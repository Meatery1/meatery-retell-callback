/**
 * Shopify Discount Code + Email Service
 * Creates personalized discount codes and emails them to customers
 * Replaces SMS service for Grace's discount delivery
 */

import axios from 'axios';
import crypto from 'crypto';
import { initializeEmailService, transporter } from './email-service.js';

/**
 * Get Shopify customer ID by email
 */
async function getShopifyCustomerByEmail(email) {
  try {
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/search.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN
        },
        params: {
          query: `email:${email}`
        }
      }
    );
    
    const customers = response.data.customers || [];
    return customers.length > 0 ? customers[0] : null;
  } catch (error) {
    console.error('Error finding customer by email:', error.message);
    return null;
  }
}

/**
 * Create a customer-specific discount code in Shopify using GraphQL
 */
export async function createShopifyDiscountCode({
  code,
  discountType = 'percentage', // 'percentage' or 'fixed_amount'
  value = 10, // 10% or $10
  usageLimit = 1,
  expiresInDays = 30,
  minimumAmount = null,
  customerEmail = null
}) {
  try {
    // Generate unique code if not provided
    if (!code) {
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      code = `MEATERY${value}OFF${randomSuffix}`;
    }

    // Get customer ID for customer-specific discount
    const customer = customerEmail ? await getShopifyCustomerByEmail(customerEmail) : null;
    
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const mutation = `
      mutation createDiscountCode($input: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $input) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        title: `Customer Service Discount - ${customerEmail || 'General'}`,
        code: code,
        startsAt: new Date().toISOString(),
        endsAt: expiresAt.toISOString(),
        // Make discount customer-specific if customer exists
        customerSelection: customer ? {
          customers: {
            add: [`gid://shopify/Customer/${customer.id}`]
          }
        } : {
          all: true
        },
        customerGets: {
          value: discountType === 'percentage' ? {
            percentage: value / 100
          } : {
            fixedAmount: {
              amount: value,
              currencyCode: 'USD'
            }
          },
          items: {
            all: true
          },
          // Apply to both one-time purchases and first subscription order only
          appliesOnSubscription: true,
          appliesOnOneTimePurchase: true
        },
        minimumRequirement: minimumAmount ? {
          subtotal: {
            greaterThanOrEqualToSubtotal: {
              amount: minimumAmount,
              currencyCode: 'USD'
            }
          }
        } : {
          quantity: {
            greaterThanOrEqualToQuantity: "1"
          }
        },
        usageLimit: usageLimit,
        appliesOncePerCustomer: true
      }
    };

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    const result = response.data.data.discountCodeBasicCreate;
    if (result.userErrors.length > 0) {
      throw new Error(`Shopify user errors: ${JSON.stringify(result.userErrors)}`);
    }

    return {
      success: true,
      code: code,
      discount_id: result.codeDiscountNode.id,
      value: value,
      type: discountType,
      expires_at: expiresAt.toISOString(),
      checkout_url: `https://${process.env.SHOPIFY_STORE_DOMAIN}/discount/${code}`,
      customer_specific: !!customer
    };

  } catch (error) {
    console.error('Error creating Shopify discount:', error.response?.data || error.message);
    
    // If code already exists, generate a new one
    if (error.message.includes('already been taken') || error.message.includes('taken')) {
      return createShopifyDiscountCode({ 
        ...arguments[0], 
        code: null // Force regeneration
      });
    }
    
    throw error;
  }
}

/**
 * Send discount code via email
 */
export async function sendDiscountEmail({
  toEmail,
  customerName = 'Valued Customer',
  discountCode,
  discountValue,
  discountType,
  checkoutUrl,
  orderNumber = null
}) {
  // Initialize email service if not already done
  await initializeEmailService();

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;

  const subject = `Your ${discountText} Off Discount Code from The Meatery 🥩`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa;
        }
        .email-container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header { 
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); 
            color: white; 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #e74c3c, #f39c12, #e74c3c);
        }
        .meatery-logo { 
            font-size: 32px; 
            font-weight: 700; 
            color: #ffffff; 
            margin: 0 0 8px 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .tagline { 
            font-size: 16px; 
            color: #ecf0f1; 
            margin: 0;
            font-weight: 300;
        }
        .content { 
            padding: 40px 30px; 
        }
        .greeting {
            font-size: 24px;
            color: #2c3e50;
            margin: 0 0 20px 0;
            font-weight: 600;
        }
        .intro-text {
            font-size: 16px;
            color: #555;
            margin: 0 0 30px 0;
            line-height: 1.7;
        }
        .discount-container {
            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            text-align: center;
            box-shadow: 0 8px 25px rgba(39, 174, 96, 0.3);
            position: relative;
            overflow: hidden;
        }
        .discount-container::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: shimmer 3s ease-in-out infinite;
        }
        @keyframes shimmer {
            0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(30deg); }
            50% { transform: translateX(100%) translateY(100%) rotate(30deg); }
        }
        .discount-title {
            font-size: 20px;
            color: white;
            margin: 0 0 15px 0;
            font-weight: 600;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }
        .discount-code { 
            font-size: 28px; 
            font-weight: 700; 
            color: #ffffff; 
            letter-spacing: 3px; 
            margin: 15px 0;
            padding: 15px 20px;
            background: rgba(255,255,255,0.2);
            border-radius: 8px;
            border: 2px dashed rgba(255,255,255,0.5);
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            font-family: 'Courier New', monospace;
        }
        .expiry {
            color: #ffffff;
            font-size: 14px;
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .cta-section {
            text-align: center;
            margin: 40px 0;
        }
        .cta-button { 
            display: inline-block; 
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); 
            color: white; 
            padding: 18px 40px; 
            text-decoration: none; 
            border-radius: 50px; 
            font-weight: 700; 
            font-size: 18px;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 6px 20px rgba(231, 76, 60, 0.4);
            transition: all 0.3s ease;
            border: none;
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(231, 76, 60, 0.6);
        }
        .steps-section {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
        }
        .steps-title {
            font-size: 20px;
            color: #2c3e50;
            margin: 0 0 20px 0;
            font-weight: 600;
            text-align: center;
        }
        .steps-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .steps-list li {
            padding: 12px 0;
            border-bottom: 1px solid #e9ecef;
            position: relative;
            padding-left: 40px;
            font-size: 16px;
            color: #555;
        }
        .steps-list li:last-child {
            border-bottom: none;
        }
        .steps-list li::before {
            content: counter(step-counter);
            counter-increment: step-counter;
            position: absolute;
            left: 0;
            top: 12px;
            background: #e74c3c;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
        }
        .steps-list {
            counter-reset: step-counter;
        }
        .contact-info {
            background: #ecf0f1;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
            text-align: center;
        }
        .contact-info p {
            margin: 5px 0;
            color: #555;
            font-size: 14px;
        }
        .signature {
            margin: 40px 0 20px 0;
            padding: 20px 0;
            border-top: 2px solid #ecf0f1;
        }
        .signature p {
            margin: 5px 0;
            color: #555;
        }
        .signature-name {
            font-weight: 600;
            color: #2c3e50;
            font-size: 16px;
        }
        .signature-title {
            color: #7f8c8d;
            font-style: italic;
        }
        .footer { 
            background: #2c3e50; 
            color: #bdc3c7; 
            padding: 30px 20px; 
            text-align: center; 
            font-size: 12px; 
            line-height: 1.5;
        }
        .footer p {
            margin: 5px 0;
        }
        .footer a {
            color: #3498db;
            text-decoration: none;
        }
        @media (max-width: 600px) {
            .email-container {
                margin: 0;
                box-shadow: none;
            }
            .content {
                padding: 20px;
            }
            .discount-code {
                font-size: 24px;
                letter-spacing: 2px;
            }
            .cta-button {
                padding: 15px 30px;
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="meatery-logo">THE MEATERY</div>
            <p class="tagline">Premium Meats Delivered Fresh</p>
        </div>
        
        <div class="content">
            <h2 class="greeting">Hi ${customerName}! 🎉</h2>
            
            <p class="intro-text">Thanks for being a valued Meatery customer! As promised during our call, here's your exclusive discount code to use on your next order of premium meats.</p>
            
            <div class="discount-container">
                <h3 class="discount-title">Your ${discountText} Off Discount Code</h3>
                <div class="discount-code">${discountCode}</div>
                <p class="expiry">⏰ Expires in 30 days</p>
            </div>
            
            <div class="cta-section">
                <a href="${checkoutUrl}" class="cta-button">Shop Now & Use Your Code</a>
            </div>
            
            <div class="steps-section">
                <h3 class="steps-title">How to Use Your Discount</h3>
                <ul class="steps-list">
                    <li>Browse our selection of premium meats</li>
                    <li>Add your favorite items to your cart</li>
                    <li>Enter code <strong>${discountCode}</strong> at checkout</li>
                    <li>Enjoy your savings on premium quality!</li>
                </ul>
            </div>
            
            <div class="contact-info">
                <p><strong>Need help?</strong></p>
                <p>Reply to this email or call us at <strong>(619) 391-3495</strong></p>
                <p>We're here to help with any questions!</p>
            </div>
            
            <div class="signature">
                <p class="signature-name">Best regards,<br>Grace</p>
                <p class="signature-title">The Meatery Customer Experience Team</p>
            </div>
        </div>
        
        <div class="footer">
            <p>This discount code was generated during your customer service call on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}</p>
            ${orderNumber ? `<p>Reference: Order #${orderNumber}</p>` : ''}
            <p><strong>The Meatery</strong> | Premium Meats Delivered Fresh</p>
            <p><a href="https://themeatery.com">themeatery.com</a> | <a href="mailto:hello@themeatery.com">hello@themeatery.com</a></p>
        </div>
    </div>
</body>
</html>`;

  const textContent = `
Hi ${customerName}!

Thanks for being a valued Meatery customer! As promised during our call, here's your exclusive discount code:

Your ${discountText} Off Discount Code: ${discountCode}
Expires in 30 days

Use this code at checkout to save ${discountText} on your next order of premium meats.

Shop now: ${checkoutUrl}

What's Next?
- Browse our selection of premium meats
- Add items to your cart  
- Enter code ${discountCode} at checkout
- Enjoy your savings!

If you have any questions about your discount or need help with your order, just reply to this email or call us at (619) 391-3495.

Thanks again for choosing The Meatery!

Best regards,
Grace
The Meatery Customer Experience Team

This discount code was generated during your customer service call on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}
${orderNumber ? `Reference: Order #${orderNumber}` : ''}
The Meatery | Premium Meats Delivered Fresh
  `;

  // Initialize email service
  await initializeEmailService();
  
  if (!transporter) {
    throw new Error('Email service not available. Please check your Google service account configuration.');
  }

  const mailOptions = {
    from: 'Grace@TheMeatery.com', // Use Grace's email address
    to: toEmail,
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      'X-Discount-Code': discountCode,
      'X-Discount-Value': discountValue.toString(),
      'X-Discount-Type': discountType,
      'X-Order-Number': orderNumber || 'N/A',
      'X-Sent-By': 'Grace-Discount-Service'
    }
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Discount email sent to ${toEmail}:`, result.messageId);
    return {
      success: true,
      messageId: result.messageId,
      to: toEmail,
      status: 'sent'
    };
  } catch (error) {
    console.error('Error sending discount email:', error.message);
    throw error;
  }
}

/**
 * Create discount and send via email (combined operation)
 */
export async function createAndSendDiscountEmail({
  customerEmail,
  customerName,
  customerPhone,
  discountType = 'percentage',
  discountValue = 10,
  reason = 'customer_service',
  orderNumber = null
}) {
  try {
    // Cap discount at 15% maximum
    if (discountType === 'percentage' && discountValue > 15) {
      console.log(`⚠️ Discount capped at 15% (requested: ${discountValue}%)`);
      discountValue = 15;
    }

    // Create the discount code
    const discount = await createShopifyDiscountCode({
      code: null, // Auto-generate
      discountType,
      value: discountValue,
      usageLimit: 1,
      expiresInDays: 30,
      customerEmail
    });

    // Send email with the discount
    const email = await sendDiscountEmail({
      toEmail: customerEmail,
      customerName,
      discountCode: discount.code,
      discountValue: discountValue,
      discountType: discountType,
      checkoutUrl: discount.checkout_url,
      orderNumber
    });

    // Log the discount creation
    console.log(`✅ Discount created and emailed:`, {
      code: discount.code,
      customer: customerName,
      email: customerEmail,
      phone: customerPhone,
      order: orderNumber,
      reason
    });

    return {
      success: true,
      discount,
      email,
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discount.code} sent to ${customerEmail}`
    };

  } catch (error) {
    console.error('Error in createAndSendDiscountEmail:', error);
    return {
      success: false,
      error: error.message,
      summary: `Failed to create/send discount email: ${error.message}`
    };
  }
}

/**
 * Check if customer is eligible for a discount
 */
export async function checkDiscountEligibility({
  customerEmail,
  customerPhone,
  orderNumber
}) {
  try {
    // Check recent discount usage
    const recentDiscountsUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/search.json`;
    
    // Search for customer
    const searchQuery = customerEmail ? `email:${customerEmail}` : `phone:${customerPhone}`;
    const customerResponse = await axios.get(recentDiscountsUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      params: { query: searchQuery }
    });

    const customers = customerResponse.data?.customers || [];
    if (customers.length === 0) {
      return { eligible: true, reason: 'new_customer' };
    }

    const customer = customers[0];
    
    // Check if customer has made recent orders
    const ordersUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/${customer.id}/orders.json`;
    const ordersResponse = await axios.get(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      params: { limit: 10 }
    });

    const orders = ordersResponse.data?.orders || [];
    
    // Check for recent discounts used
    const recentDiscountUse = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      const daysSinceOrder = (Date.now() - orderDate) / (1000 * 60 * 60 * 24);
      return daysSinceOrder < 30 && order.discount_codes?.length > 0;
    });

    if (recentDiscountUse.length > 0) {
      return { 
        eligible: false, 
        reason: 'recent_discount_used',
        last_discount_date: recentDiscountUse[0].created_at
      };
    }

    // Check order value for eligibility (capped at 15%)
    const totalSpent = parseFloat(customer.total_spent || 0);
    if (totalSpent > 1000) {
      return { eligible: true, reason: 'vip_customer', discount_value: 15 }; // MAX discount
    } else if (totalSpent > 500) {
      return { eligible: true, reason: 'valued_customer', discount_value: 12 };
    } else {
      return { eligible: true, reason: 'standard', discount_value: 10 }; // Starting discount
    }

  } catch (error) {
    console.error('Error checking discount eligibility:', error);
    // Default to eligible with 10% standard discount
    return { eligible: true, reason: 'default', discount_value: 10 };
  }
}
