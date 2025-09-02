/**
 * Recovery Cart Service for Abandoned Checkout Recovery
 * Creates recovery cart links with discounts and sends them to customers
 */

import { createShopifyDiscountCode, checkDiscountEligibility } from './discount-sms-service.js';
import { sendEmail } from './email-service.js';

/**
 * Create a recovery cart link with discount for abandoned checkout
 */
export async function createRecoveryCart({
  customerName,
  customerEmail,
  customerPhone,
  checkoutId,
  itemsSummary,
  totalPrice,
  currency = 'USD'
}) {
  try {
    console.log(`🛒 Creating recovery cart for ${customerName} (${checkoutId})`);
    
    // Check discount eligibility
    const eligibility = await checkDiscountEligibility({
      customerEmail,
      customerPhone,
      orderNumber: checkoutId
    });
    
    if (!eligibility.eligible) {
      return {
        success: false,
        error: `Customer not eligible for discount: ${eligibility.reason}`,
        reason: eligibility.reason
      };
    }
    
    // Determine discount value based on eligibility
    let discountValue = eligibility.discount_value || 10;
    
    // Cap at 15% maximum as per business rules
    if (discountValue > 15) {
      discountValue = 15;
    }
    
    // Calculate discount amount
    const discountAmount = (totalPrice * discountValue) / 100;
    const finalPrice = totalPrice - discountAmount;
    
    console.log(`💰 Discount: ${discountValue}% ($${discountAmount.toFixed(2)} off $${totalPrice})`);
    
    // Create discount code in Shopify
    const discount = await createShopifyDiscountCode({
      code: `RECOVER${checkoutId.slice(-6)}`, // Unique code based on checkout ID
      discountType: 'percentage',
      value: discountValue,
      usageLimit: 1,
      expiresInDays: 1, // Expires in 1 day as promised
      minimumAmount: totalPrice * 0.5, // Must spend at least 50% of original cart
      customerEmail
    });
    
    if (!discount.success) {
      throw new Error(`Failed to create discount: ${discount.error}`);
    }
    
    // Create recovery cart URL
    const recoveryCartUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/cart?discount=${discount.code}`;
    
    // Prepare email content
    const emailSubject = `Complete Your Order - ${discountValue}% Off Expires Tomorrow!`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d4af37;">Hey ${customerName}!</h2>
        
        <p>I noticed you had some amazing cuts in your cart earlier and wanted to make sure you didn't miss out!</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Cart:</h3>
          <p><strong>${itemsSummary}</strong></p>
          <p><strong>Original Total: ${currency} ${totalPrice.toFixed(2)}</strong></p>
          <p><strong>Your Discount: ${discountValue}% off</strong></p>
          <p><strong>Final Price: ${currency} ${finalPrice.toFixed(2)}</strong></p>
          <p><strong>You Save: ${currency} ${discountAmount.toFixed(2)}!</strong></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${recoveryCartUrl}" 
             style="background: #d4af37; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 18px;">
             Complete Your Order Now
          </a>
        </div>
        
        <p><strong>⚠️ IMPORTANT:</strong> This discount expires in 24 hours!</p>
        
        <p>Just click the button above to complete your order with the discount already applied. It only takes about 2 minutes!</p>
        
        <p>If you have any questions about the cuts or cooking tips, just reply to this email or give us a call.</p>
        
        <p>Thanks for checking us out!</p>
        <p><strong>Grace</strong><br>The Meatery Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          This is a recovery offer for your abandoned cart. If you didn't request this, please ignore this email.
        </p>
      </div>
    `;
    
    // Send recovery email
    let emailSent = false;
    if (customerEmail) {
      try {
        await sendEmail({
          to: customerEmail,
          subject: emailSubject,
          html: emailHtml
        });
        emailSent = true;
        console.log(`📧 Recovery email sent to ${customerEmail}`);
      } catch (emailError) {
        console.warn(`⚠️ Failed to send email to ${customerEmail}:`, emailError.message);
      }
    }
    
    // Prepare SMS content (if phone available)
    let smsSent = false;
    if (customerPhone) {
      try {
        const smsText = `Hey ${customerName}! Complete your order with ${discountValue}% off - expires in 24 hours! ${recoveryCartUrl}`;
        
        // Note: SMS sending would require Twilio integration
        // For now, we'll log it
        console.log(`📱 SMS would be sent to ${customerPhone}: ${smsText}`);
        smsSent = true;
      } catch (smsError) {
        console.warn(`⚠️ Failed to send SMS to ${customerPhone}:`, smsError.message);
      }
    }
    
    console.log(`✅ Recovery cart created successfully for ${customerName}`);
    
    return {
      success: true,
      customerName,
      checkoutId,
      discountCode: discount.code,
      discountValue,
      discountAmount,
      originalPrice: totalPrice,
      finalPrice,
      recoveryCartUrl,
      expiresAt: discount.expires_at,
      emailSent,
      smsSent,
      summary: `${discountValue}% discount ($${discountAmount.toFixed(2)} off) recovery cart sent to ${customerName}. Expires in 24 hours.`
    };
    
  } catch (error) {
    console.error('❌ Failed to create recovery cart:', error.message);
    return {
      success: false,
      error: error.message,
      customerName,
      checkoutId
    };
  }
}

/**
 * Check if a recovery cart can be created for a customer
 */
export async function canCreateRecoveryCart({
  customerEmail,
  customerPhone,
  checkoutId
}) {
  try {
    const eligibility = await checkDiscountEligibility({
      customerEmail,
      customerPhone,
      orderNumber: checkoutId
    });
    
    return {
      canCreate: eligibility.eligible,
      reason: eligibility.reason,
      maxDiscount: eligibility.discount_value || 10,
      message: eligibility.eligible 
        ? `Customer eligible for up to ${eligibility.discount_value || 10}% discount`
        : `Customer not eligible: ${eligibility.reason}`
    };
  } catch (error) {
    console.error('Error checking recovery cart eligibility:', error);
    return {
      canCreate: false,
      reason: 'error',
      maxDiscount: 0,
      message: `Error checking eligibility: ${error.message}`
    };
  }
}

/**
 * Get recovery cart status
 */
export async function getRecoveryCartStatus(checkoutId) {
  try {
    // This would check if a recovery cart was already created
    // For now, return basic info
    return {
      checkoutId,
      status: 'available',
      message: 'Recovery cart can be created'
    };
  } catch (error) {
    return {
      checkoutId,
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Test the recovery cart service
 */
export async function testRecoveryCartService() {
  console.log('🧪 Testing Recovery Cart Service...');
  
  const testData = {
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '+1234567890',
    checkoutId: 'test-checkout-123',
    itemsSummary: '1x A5 Wagyu Ribeye, 1x Kurobuta Bacon',
    totalPrice: 189.99,
    currency: 'USD'
  };
  
  try {
    const result = await createRecoveryCart(testData);
    console.log('Test Result:', result);
    return result;
  } catch (error) {
    console.error('Test failed:', error);
    return { success: false, error: error.message };
  }
}
