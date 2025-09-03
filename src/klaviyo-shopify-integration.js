import axios from 'axios';
import dotenv from 'dotenv';
import { sendDiscountViaEvent } from './klaviyo-events-service.js';
import { 
  fetchAbandonedCheckoutById 
} from './shopify-graphql-queries.js';

dotenv.config();

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
 * Create customer-specific discount code in Shopify using GraphQL
 */
async function createShopifyDiscountCode({
  discountValue,
  discountType = 'percentage',
  customerEmail,
  orderNumber = null
}) {
  const prefix = orderNumber ? `ORDER${orderNumber}` : 'GRACE';
  const code = `${prefix}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  // Get customer ID for customer-specific discount
  const customer = customerEmail ? await getShopifyCustomerByEmail(customerEmail) : null;
  
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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
      title: `Grace Discount - ${customerEmail || 'General'}`,
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
          percentage: discountValue / 100
        } : {
          fixedAmount: {
            amount: discountValue,
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
      minimumRequirement: {
        quantity: {
          greaterThanOrEqualToQuantity: "1"
        }
      },
      usageLimit: 1,
      appliesOncePerCustomer: true
    }
  };

  try {
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
      code,
      id: result.codeDiscountNode.id,
      value: discountValue,
      type: discountType,
      expiresAt: expiresAt.toISOString(),
      customer_specific: !!customer
    };
  } catch (error) {
    console.error('Error creating Shopify discount code:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send discount for abandoned checkout recovery
 * Properly integrates Shopify abandoned checkout data with Klaviyo
 */
export async function sendAbandonedCheckoutDiscount({
  abandonedCheckoutId,
  customerEmail,
  customerPhone,
  customerName,
  discountValue = 10,
  discountType = 'percentage',
  preferredChannel = 'email'
}) {
  try {
    console.log(`🛒 Processing abandoned checkout discount for ${abandonedCheckoutId}`);
    
    // Step 1: Fetch the actual abandoned checkout from Shopify
    let abandonedCheckoutUrl = null;
    let cartItems = [];
    let cartTotal = 0;
    
    if (abandonedCheckoutId) {
      try {
        const checkout = await fetchAbandonedCheckoutById(abandonedCheckoutId);
        if (checkout) {
          abandonedCheckoutUrl = checkout.abandonedCheckoutUrl;
          cartTotal = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || 0);
          
          // Extract cart items for personalization
          if (checkout.lineItems?.nodes) {
            cartItems = checkout.lineItems.nodes.map(item => ({
              title: item.title,
              quantity: item.quantity,
              price: item.variant?.price || 0
            }));
          }
          
          console.log(`✅ Found abandoned checkout:`, {
            url: abandonedCheckoutUrl,
            total: cartTotal,
            items: cartItems.length
          });
        }
      } catch (error) {
        console.error('⚠️ Failed to fetch abandoned checkout:', error.message);
      }
    }
    
    // Step 2: Create discount code
    const discount = await createShopifyDiscountCode({
      discountValue,
      discountType,
      customerEmail: customerEmail || customerPhone,
      orderNumber: abandonedCheckoutId
    });
    
    // Step 3: Build recovery URL with discount code
    let recoveryUrl = abandonedCheckoutUrl;
    if (!recoveryUrl) {
      // Fallback to generic checkout if no abandoned checkout URL
      recoveryUrl = 'https://themeatery.com/checkout';
    }
    
    // Append discount code to the recovery URL
    const url = new URL(recoveryUrl);
    url.searchParams.set('discount', discount.code);
    url.searchParams.set('utm_source', 'grace_ai');
    url.searchParams.set('utm_medium', preferredChannel);
    url.searchParams.set('utm_campaign', 'abandoned_cart_recovery');
    
    const finalRecoveryUrl = url.toString();
    
    console.log(`🔗 Recovery URL with discount: ${finalRecoveryUrl}`);
    
    // Step 4: Send via Events API (triggers Klaviyo Flow)
    const result = await sendDiscountViaEvent({
      customerEmail,
      customerPhone,
      customerName: customerName || 'Valued Customer',
      discountValue,
      discountType,
      discountCode: discount.code,
      recoveryUrl: finalRecoveryUrl,
      abandonedCheckoutId,
      channel: preferredChannel
    });
    
    return {
      success: true,
      discount,
      recoveryUrl: finalRecoveryUrl,
      abandonedCheckoutUrl,
      cartItems,
      cartTotal,
      channel: preferredChannel,
      result
    };
    
  } catch (error) {
    console.error('❌ Error sending abandoned checkout discount:', error);
    throw error;
  }
}

/**
 * Test function for abandoned checkout recovery
 */
export async function testAbandonedCheckoutRecovery() {
  try {
    // Test with a mock abandoned checkout ID
    const result = await sendAbandonedCheckoutDiscount({
      abandonedCheckoutId: 'gid://shopify/AbandonedCheckout/123456789',
      customerEmail: 'NickyFiorentino@gmail.com',
      customerPhone: '+16194587071',
      customerName: 'Nicky',
      discountValue: 15,
      discountType: 'percentage',
      preferredChannel: 'email'
    });
    
    console.log('✅ Abandoned checkout discount sent:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

export default {
  sendAbandonedCheckoutDiscount,
  testAbandonedCheckoutRecovery
};
