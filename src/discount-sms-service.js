/**
 * Shopify Discount Code + SMS Service
 * Creates personalized discount codes and texts them to customers
 */

import axios from 'axios';
import twilio from 'twilio';
import crypto from 'crypto';

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

/**
 * Create a discount code in Shopify
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

    // Create price rule first
    const priceRuleUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/price_rules.json`;
    
    const priceRuleData = {
      price_rule: {
        title: `Customer Service Discount - ${code}`,
        target_type: "line_item",
        target_selection: "all",
        allocation_method: "across",
        value_type: discountType === 'percentage' ? 'percentage' : 'fixed_amount',
        value: discountType === 'percentage' ? `-${value}` : `-${value * 100}`, // Negative value for discount, cents for fixed
        customer_selection: customerEmail ? "prerequisite" : "all",
        prerequisite_customer_ids: [],
        once_per_customer: true,
        usage_limit: usageLimit,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      }
    };

    // Add minimum purchase requirement if specified
    if (minimumAmount) {
      priceRuleData.price_rule.prerequisite_subtotal_range = {
        greater_than_or_equal_to: String(minimumAmount)
      };
    }

    // Create the price rule
    const priceRuleResponse = await axios.post(priceRuleUrl, priceRuleData, {
      headers: { 
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const priceRuleId = priceRuleResponse.data.price_rule.id;

    // Create discount code for the price rule
    const discountCodeUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/price_rules/${priceRuleId}/discount_codes.json`;
    
    const discountCodeData = {
      discount_code: {
        code: code
      }
    };

    const discountCodeResponse = await axios.post(discountCodeUrl, discountCodeData, {
      headers: { 
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      code: code,
      discount_id: discountCodeResponse.data.discount_code.id,
      price_rule_id: priceRuleId,
      value: value,
      type: discountType,
      expires_at: priceRuleData.price_rule.ends_at,
      checkout_url: `https://${process.env.SHOPIFY_STORE_DOMAIN}/discount/${code}`
    };

  } catch (error) {
    console.error('Error creating Shopify discount:', error.response?.data || error.message);
    
    // If code already exists, generate a new one
    if (error.response?.data?.errors?.base?.[0]?.includes('already been taken')) {
      return createShopifyDiscountCode({ 
        ...arguments[0], 
        code: null // Force regeneration
      });
    }
    
    throw error;
  }
}

/**
 * Send SMS with discount code
 */
export async function sendDiscountSMS({
  toPhone,
  discountCode,
  discountValue,
  discountType,
  checkoutUrl,
  customerName = 'there'
}) {
  if (!twilioClient) {
    throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  }

  // Format phone number (ensure it has country code)
  let formattedPhone = toPhone.replace(/\D/g, '');
  if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
    formattedPhone = '1' + formattedPhone; // Add US country code
  }
  formattedPhone = '+' + formattedPhone;

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;

  const message = `Hi ${customerName}! Thanks for being a valued Meatery customer. ` +
    `Here's your exclusive ${discountText} off discount code: ${discountCode}\n\n` +
    `Shop now: ${checkoutUrl}\n\n` +
    `Code expires in 30 days. Enjoy your premium meats! 🥩`;

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    return {
      success: true,
      message_sid: result.sid,
      to: formattedPhone,
      status: result.status
    };
  } catch (error) {
    console.error('Error sending SMS:', error.message);
    throw error;
  }
}

/**
 * Create discount and send via SMS (combined operation)
 */
export async function createAndSendDiscount({
  customerPhone,
  customerName,
  customerEmail,
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

    // Send SMS with the discount
    const sms = await sendDiscountSMS({
      toPhone: customerPhone,
      discountCode: discount.code,
      discountValue: discountValue,
      discountType: discountType,
      checkoutUrl: discount.checkout_url,
      customerName
    });

    // Log the discount creation
    console.log(`✅ Discount created and sent:`, {
      code: discount.code,
      customer: customerName,
      phone: customerPhone,
      order: orderNumber,
      reason
    });

    return {
      success: true,
      discount,
      sms,
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discount.code} sent to ${customerPhone}`
    };

  } catch (error) {
    console.error('Error in createAndSendDiscount:', error);
    return {
      success: false,
      error: error.message,
      summary: `Failed to create/send discount: ${error.message}`
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
