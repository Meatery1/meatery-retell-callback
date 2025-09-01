/**
 * Email Service for Ticket Management
 * Sends emails to Commslayer ticketing system with customer CC
 */

import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

// Initialize Gmail service with service account
let transporter = null;

/**
 * Initialize the email transporter with Google service account
 */
export async function initializeEmailService() {
  try {
    // Check if service account credentials are provided via env
    const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    
    let credentials;
    
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      // Load from file
      credentials = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } else if (serviceAccountKey) {
      // Parse from environment variable (useful for deployment)
      credentials = typeof serviceAccountKey === 'string' 
        ? JSON.parse(serviceAccountKey) 
        : serviceAccountKey;
    } else {
      console.log('⚠️ Email service not configured - no Google service account credentials found');
      return false;
    }

    // Create JWT client
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/gmail.send'],
      // The email address to send from (must be authorized for the service account)
      process.env.SEND_FROM_EMAIL || 'hello@themeatery.com'
    );

    // Authorize
    await jwtClient.authorize();
    
    // Create OAuth2 client from JWT
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.credentials = jwtClient.credentials;

    // Create transporter
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.SEND_FROM_EMAIL || 'hello@themeatery.com',
        serviceClient: credentials.client_email,
        privateKey: credentials.private_key,
        accessToken: jwtClient.credentials.access_token,
      },
    });

    console.log('✅ Email service initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize email service:', error.message);
    
    // Fallback to basic SMTP if available
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('✅ Email service initialized with SMTP fallback');
      return true;
    }
    
    return false;
  }
}

/**
 * Send a refund ticket email
 */
export async function sendRefundTicket({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  items,
  reason,
  preferredResolution = 'refund'
}) {
  if (!transporter) {
    await initializeEmailService();
    if (!transporter) {
      throw new Error('Email service not available');
    }
  }

  // REQUIREMENT: Customer MUST be CC'd
  if (!customerEmail) {
    console.error(`⚠️ WARNING: No customer email for order #${orderNumber} - Cannot CC customer (REQUIRED)`);
    // Still send to support but flag as incomplete
  }

  const subject = `[Refund Request] Order #${orderNumber} - ${customerName}${!customerEmail ? ' - NO CUSTOMER EMAIL' : ''}`;
  
  const htmlContent = `
    <h2>Refund Request - Order #${orderNumber}</h2>
    ${!customerEmail ? '<div style="background: #ffcccc; padding: 10px; border: 2px solid red;"><strong>⚠️ URGENT: Customer email missing - Cannot CC customer. Please obtain email and communicate directly.</strong></div>' : ''}
    
    <h3>Customer Information:</h3>
    <ul>
      <li><strong>Name:</strong> ${customerName}</li>
      <li><strong>Email:</strong> ${customerEmail || '<span style="color: red;">❌ MISSING - MUST OBTAIN</span>'}</li>
      <li><strong>Phone:</strong> ${customerPhone}</li>
      <li><strong>Order Number:</strong> #${orderNumber}</li>
    </ul>
    
    <h3>Issue Details:</h3>
    <p><strong>Reason:</strong> ${reason || 'Not specified'}</p>
    <p><strong>Items Affected:</strong> ${items || 'All items in order'}</p>
    <p><strong>Customer Preference:</strong> ${preferredResolution}</p>
    
    <h3>Action Required:</h3>
    <p>Please process this refund request and update the customer within 24 hours.</p>
    
    <hr>
    <p><small>This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}</small></p>
  `;

  const textContent = `
Refund Request - Order #${orderNumber}

Customer Information:
- Name: ${customerName}
- Email: ${customerEmail || 'Not provided'}
- Phone: ${customerPhone}
- Order Number: #${orderNumber}

Issue Details:
- Reason: ${reason || 'Not specified'}
- Items Affected: ${items || 'All items in order'}
- Customer Preference: ${preferredResolution}

Action Required:
Please process this refund request and update the customer within 24 hours.

This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}
  `;

  const mailOptions = {
    from: process.env.SEND_FROM_EMAIL || 'hello@themeatery.com',
    to: 'hello@themeatery.com',
    cc: customerEmail || undefined, // REQUIREMENT: Customer should be CC'd
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      'X-Priority': customerEmail ? '2' : '1', // HIGHEST priority if no customer email
      'X-Order-Number': orderNumber,
      'X-Ticket-Type': 'Refund',
      'X-Missing-Customer-Email': !customerEmail ? 'true' : 'false'
    }
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Refund ticket sent for order #${orderNumber}:`, result.messageId);
    return {
      success: true,
      messageId: result.messageId,
      ticketType: 'refund',
      orderNumber
    };
  } catch (error) {
    console.error(`❌ Failed to send refund ticket:`, error.message);
    throw error;
  }
}

/**
 * Send a replacement ticket email
 */
export async function sendReplacementTicket({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  itemTitle,
  quantity,
  reason,
  issueType
}) {
  if (!transporter) {
    await initializeEmailService();
    if (!transporter) {
      throw new Error('Email service not available');
    }
  }

  // REQUIREMENT: Customer MUST be CC'd
  if (!customerEmail) {
    console.error(`⚠️ WARNING: No customer email for order #${orderNumber} - Cannot CC customer (REQUIRED)`);
    // Still send to support but flag as incomplete
  }

  const subject = `[Replacement Request] Order #${orderNumber} - ${customerName}${!customerEmail ? ' - NO CUSTOMER EMAIL' : ''}`;
  
  const htmlContent = `
    <h2>Replacement Request - Order #${orderNumber}</h2>
    ${!customerEmail ? '<div style="background: #ffcccc; padding: 10px; border: 2px solid red;"><strong>⚠️ URGENT: Customer email missing - Cannot CC customer. Please obtain email and communicate directly.</strong></div>' : ''}
    
    <h3>Customer Information:</h3>
    <ul>
      <li><strong>Name:</strong> ${customerName}</li>
      <li><strong>Email:</strong> ${customerEmail || '<span style="color: red;">❌ MISSING - MUST OBTAIN</span>'}</li>
      <li><strong>Phone:</strong> ${customerPhone}</li>
      <li><strong>Order Number:</strong> #${orderNumber}</li>
    </ul>
    
    <h3>Replacement Details:</h3>
    <ul>
      <li><strong>Item:</strong> ${itemTitle}</li>
      <li><strong>Quantity:</strong> ${quantity}</li>
      <li><strong>Issue Type:</strong> ${issueType || 'Quality issue'}</li>
      <li><strong>Details:</strong> ${reason || 'Not specified'}</li>
    </ul>
    
    <h3>Action Required:</h3>
    <p>Please arrange replacement shipment and notify the customer with tracking information.</p>
    
    <hr>
    <p><small>This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}</small></p>
  `;

  const textContent = `
Replacement Request - Order #${orderNumber}

Customer Information:
- Name: ${customerName}
- Email: ${customerEmail || 'Not provided'}
- Phone: ${customerPhone}
- Order Number: #${orderNumber}

Replacement Details:
- Item: ${itemTitle}
- Quantity: ${quantity}
- Issue Type: ${issueType || 'Quality issue'}
- Details: ${reason || 'Not specified'}

Action Required:
Please arrange replacement shipment and notify the customer with tracking information.

This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}
  `;

  const mailOptions = {
    from: process.env.SEND_FROM_EMAIL || 'hello@themeatery.com',
    to: 'hello@themeatery.com',
    cc: customerEmail || undefined, // REQUIREMENT: Customer should be CC'd
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      'X-Priority': customerEmail ? '2' : '1', // HIGHEST priority if no customer email
      'X-Order-Number': orderNumber,
      'X-Ticket-Type': 'Replacement',
      'X-Missing-Customer-Email': !customerEmail ? 'true' : 'false'
    }
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Replacement ticket sent for order #${orderNumber}:`, result.messageId);
    return {
      success: true,
      messageId: result.messageId,
      ticketType: 'replacement',
      orderNumber
    };
  } catch (error) {
    console.error(`❌ Failed to send replacement ticket:`, error.message);
    throw error;
  }
}

/**
 * Send a general support ticket email
 */
export async function sendSupportTicket({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  subject: customSubject,
  issueDetails,
  priority = 'normal'
}) {
  if (!transporter) {
    await initializeEmailService();
    if (!transporter) {
      throw new Error('Email service not available');
    }
  }

  const subject = customSubject || `[Support] Order #${orderNumber} - ${customerName}`;
  
  const htmlContent = `
    <h2>Customer Support Ticket</h2>
    
    <h3>Customer Information:</h3>
    <ul>
      <li><strong>Name:</strong> ${customerName}</li>
      <li><strong>Email:</strong> ${customerEmail || 'Not provided'}</li>
      <li><strong>Phone:</strong> ${customerPhone}</li>
      ${orderNumber ? `<li><strong>Order Number:</strong> #${orderNumber}</li>` : ''}
    </ul>
    
    <h3>Issue Details:</h3>
    <div style="padding: 10px; background: #f5f5f5; border-left: 3px solid #333;">
      ${issueDetails.replace(/\n/g, '<br>')}
    </div>
    
    <h3>Priority:</h3>
    <p>${priority === 'high' ? '🔴 HIGH' : priority === 'low' ? '🟢 LOW' : '🟡 NORMAL'}</p>
    
    <hr>
    <p><small>This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}</small></p>
  `;

  const textContent = `
Customer Support Ticket

Customer Information:
- Name: ${customerName}
- Email: ${customerEmail || 'Not provided'}
- Phone: ${customerPhone}
${orderNumber ? `- Order Number: #${orderNumber}` : ''}

Issue Details:
${issueDetails}

Priority: ${priority.toUpperCase()}

This ticket was automatically generated from a customer call on ${new Date().toLocaleString()}
  `;

  const priorityMap = {
    'high': '1',
    'normal': '3',
    'low': '5'
  };

  const mailOptions = {
    from: process.env.SEND_FROM_EMAIL || 'hello@themeatery.com',
    to: 'hello@themeatery.com',
    cc: customerEmail || undefined,
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      'X-Priority': priorityMap[priority] || '3',
      'X-Order-Number': orderNumber || 'N/A',
      'X-Ticket-Type': 'Support'
    }
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Support ticket sent:`, result.messageId);
    return {
      success: true,
      messageId: result.messageId,
      ticketType: 'support',
      orderNumber
    };
  } catch (error) {
    console.error(`❌ Failed to send support ticket:`, error.message);
    throw error;
  }
}

// Initialize on module load
initializeEmailService().catch(console.error);
