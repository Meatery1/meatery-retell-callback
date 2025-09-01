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
    // First check for SMTP configuration (simpler and more common)
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
      
      // Test the connection
      try {
        await transporter.verify();
        console.log('✅ Email service initialized with SMTP successfully');
        return true;
      } catch (error) {
        console.error('❌ SMTP connection failed:', error.message);
        console.log('Falling back to Google Service Account...');
      }
    }
    
    // Use Google Service Account with domain-wide delegation
    const serviceAccountEmail = process.env.ANALYTICS_CLIENT_EMAIL || 'meatery-dashboard@theta-voyager-423706-t9.iam.gserviceaccount.com';
    const privateKey = process.env.ANALYTICS_PRIVATE_KEY;
    const impersonatedUser = process.env.GMAIL_IMPERSONATED_USER || 'nicholas@themeatery.com';
    
    if (!privateKey) {
      console.log('⚠️ Email service not configured - no SMTP or Google service account credentials found');
      return false;
    }

    console.log('Using Google Service Account with domain-wide delegation');
    console.log('Service Account:', serviceAccountEmail);
    console.log('Impersonating:', impersonatedUser);
    
    // Create JWT client with user impersonation (required for Gmail with domain-wide delegation)
    const jwtClient = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: impersonatedUser // CRITICAL: Must impersonate a domain user for Gmail
    });

    // Authorize
    await jwtClient.authorize();
    console.log('JWT client authorized successfully');
    
    const gmail = google.gmail({ version: 'v1', auth: jwtClient });
    
    // Create custom transporter using Gmail API
    transporter = {
      sendMail: async (mailOptions) => {
        // Build the email in RFC 2822 format
        const messageParts = [
          `From: "${impersonatedUser.split('@')[0]}" <${impersonatedUser}>`,
          `To: ${mailOptions.to}`
        ];
        
        if (mailOptions.cc) {
          messageParts.push(`Cc: ${mailOptions.cc}`);
        }
        
        messageParts.push(
          `Subject: ${mailOptions.subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=utf-8'
        );
        
        // Add custom headers if provided
        if (mailOptions.headers) {
          Object.entries(mailOptions.headers).forEach(([key, value]) => {
            messageParts.push(`${key}: ${value}`);
          });
        }
        
        messageParts.push('', mailOptions.html || mailOptions.text || '');
        
        const message = messageParts.join('\r\n');
        
        // Encode for Gmail API
        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        
        const result = await gmail.users.messages.send({
          userId: impersonatedUser,
          requestBody: {
            raw: encodedMessage
          }
        });
        
        console.log('Email sent successfully via Gmail API');
        return { messageId: result.data.id, ...result.data };
      }
    };

    console.log('✅ Email service initialized with Google Service Account successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize email service:', error.message);
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
