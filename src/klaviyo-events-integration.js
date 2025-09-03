import { sendDiscountViaEvent } from './klaviyo-events-service.js';
import { sendKlaviyoDiscountSMS } from './klaviyo-email-service-fixed.js';
import { fetchAbandonedCheckoutById, findLatestAbandonedCheckout } from './shopify-graphql-queries.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate a unique discount code
 */
function generateDiscountCode(prefix = 'GRACE') {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

/**
 * Send discount via Klaviyo Events API with proper abandoned checkout integration
 * This replaces the old createAndSendKlaviyoDiscount function
 */
export async function sendKlaviyoDiscountWithCheckout({
  customerEmail,
  customerPhone,
  customerName,
  discountValue = 10,
  discountType = 'percentage',
  preferredChannel = 'email',
  abandonedCheckoutId = null,
  orderNumber = null
}) {
  try {
    console.log('📧 Sending discount via Klaviyo...');
    console.log(`   abandonedCheckoutId: ${abandonedCheckoutId || 'NOT PROVIDED'}`);
    console.log(`   preferredChannel: ${preferredChannel}`);
    console.log(`   customerPhone: ${customerPhone || 'NOT PROVIDED'}`);
    console.log(`   customerEmail: ${customerEmail || 'NOT PROVIDED'}`);
    
    // Generate discount code
    const discountCode = generateDiscountCode(orderNumber || 'GRACE');
    
    // Fetch abandoned checkout URL
    let recoveryUrl = null;
    let cartTotal = 0;
    let cartItems = [];
    
    if (abandonedCheckoutId) {
      try {
        console.log(`🛒 Fetching abandoned checkout: ${abandonedCheckoutId}`);
        const checkout = await fetchAbandonedCheckoutById(abandonedCheckoutId);
        
        if (checkout) {
          recoveryUrl = checkout.abandonedCheckoutUrl;
          cartTotal = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || 0);
          
          // Extract cart items
          if (checkout.lineItems?.edges) {
            cartItems = checkout.lineItems.edges.map(edge => ({
              title: edge.node.title,
              quantity: edge.node.quantity,
              variant: edge.node.variantTitle
            }));
          }
          
          console.log(`✅ Found abandoned checkout URL: ${recoveryUrl}`);
          console.log(`   Cart total: $${cartTotal}`);
          console.log(`   Items: ${cartItems.length}`);
        }
      } catch (error) {
        console.error('⚠️ Failed to fetch abandoned checkout, using fallback URL:', error.message);
      }
    }
    
    // If no checkoutId provided or lookup failed, try by contact info
    if (!recoveryUrl) {
      const byContact = await findLatestAbandonedCheckout({ email: customerEmail, phone: customerPhone });
      if (byContact?.abandonedCheckoutUrl) {
        recoveryUrl = byContact.abandonedCheckoutUrl;
        console.log(`✅ Found abandoned checkout URL by contact: ${recoveryUrl}`);
      }
    }
    
    // Fallback to generic checkout if still no URL
    if (!recoveryUrl) {
      recoveryUrl = 'https://themeatery.com/checkout';
      console.log('📍 Using fallback checkout URL (no abandoned checkout found)');
    } else {
      console.log(`✅ Using actual abandoned checkout URL: ${recoveryUrl}`);
    }
    
    // Append discount code and UTM parameters to the recovery URL
    const url = new URL(recoveryUrl);
    url.searchParams.set('discount', discountCode);
    url.searchParams.set('utm_source', 'grace_ai');
    url.searchParams.set('utm_medium', preferredChannel);
    url.searchParams.set('utm_campaign', 'discount_recovery');
    recoveryUrl = url.toString();
    console.log(`🔗 Final recovery URL with discount: ${recoveryUrl}`);
    
    // Send via appropriate channel
    let result;
    if (preferredChannel === 'sms' && customerPhone) {
      // Use the SMS campaign API for immediate SMS delivery
      console.log(`📱 Using SMS campaign API for immediate delivery to ${customerPhone}`);
      result = await sendKlaviyoDiscountSMS({
        customerPhone,
        customerName,
        discountValue,
        discountType,
        orderNumber: null,
        discountCode,
        recoveryUrl
      });
    } else {
      // Use Events API for email or fallback
      result = await sendDiscountViaEvent({
        customerEmail,
        customerPhone,
        customerName,
        discountValue,
        discountType,
        discountCode,
        recoveryUrl,
        abandonedCheckoutId,
        channel: preferredChannel
      });
    }
    
    console.log(`✅ Discount sent successfully via ${preferredChannel}`);
    console.log(`   Discount code: ${discountCode}`);
    console.log(`   Recovery URL: ${recoveryUrl}`);
    
    return {
      success: true,
      discountCode,
      recoveryUrl,
      cartTotal,
      cartItems,
      channel: preferredChannel,
      eventResult: result,
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discountCode} sent via Klaviyo ${preferredChannel === 'sms' ? 'SMS Campaign' : 'Events API'}`
    };
    
  } catch (error) {
    console.error('❌ Error sending Klaviyo discount:', error);
    return {
      success: false,
      error: error.message,
      summary: `Failed to send discount: ${error.message}`
    };
  }
}

/**
 * Backwards compatibility wrapper
 * Maps old function name to new implementation
 */
export async function createAndSendKlaviyoDiscount(params) {
  return sendKlaviyoDiscountWithCheckout(params);
}

export default {
  sendKlaviyoDiscountWithCheckout,
  createAndSendKlaviyoDiscount
};
