import { sendDiscountViaEvent } from './klaviyo-events-service.js';
import { fetchAbandonedCheckoutById } from './shopify-graphql-queries.js';
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
    console.log('📧 Sending discount via Klaviyo Events API...');
    
    // Generate discount code
    const discountCode = generateDiscountCode(orderNumber || 'GRACE');
    
    // Fetch abandoned checkout URL if we have an ID
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
    
    // Fallback to generic checkout if no abandoned checkout URL
    if (!recoveryUrl) {
      recoveryUrl = 'https://themeatery.com/checkout';
      console.log('📍 Using fallback checkout URL');
    }
    
    // Send via Events API (this triggers Klaviyo Flows)
    const result = await sendDiscountViaEvent({
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
    
    console.log(`✅ Discount event sent successfully via ${preferredChannel}`);
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
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discountCode} sent via Klaviyo Events API`
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
