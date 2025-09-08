import { sendDiscountViaEvent } from './klaviyo-events-service.js';
import { sendKlaviyoDiscountSMS } from './klaviyo-email-service-fixed.js';
import { fetchAbandonedCheckoutById, findLatestAbandonedCheckout } from './shopify-graphql-queries.js';
import { createShopifyDiscountCode } from './klaviyo-email-service.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate a unique discount code
 */
function toCodeFromNameAndPercent(name, percent) {
  const first = String(name || 'Guest').trim().split(/\s+/)[0] || 'Guest';
  const cleanFirst = first.replace(/[^A-Za-z]/g, '').slice(0, 20) || 'Guest';
  const pct = Math.max(1, Math.min(99, Number(percent) || 10));
  return `${cleanFirst}${pct}`;
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
    
    // Build requested code like James12 based on provided customerName and discountValue
    const desiredCode = toCodeFromNameAndPercent(customerName, discountValue);
    
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
    
    // Fallback to homepage if still no URL
    if (!recoveryUrl) {
      recoveryUrl = 'https://themeatery.com/';
      console.log('📍 Using fallback homepage URL (no abandoned checkout found)');
    } else {
      console.log(`✅ Using actual abandoned checkout URL: ${recoveryUrl}`);
    }
    
    // Append discount code and UTM parameters to the recovery URL
    const url = new URL(recoveryUrl);
    url.searchParams.set('discount', desiredCode);
    url.searchParams.set('utm_source', 'grace_ai');
    url.searchParams.set('utm_medium', preferredChannel);
    url.searchParams.set('utm_campaign', 'discount_recovery');
    recoveryUrl = url.toString();
    console.log(`🔗 Final recovery URL with discount: ${recoveryUrl}`);
    
    // Send via appropriate channel
    // Create the Shopify discount with the desired code (handle collision with suffix)
    let shopifyDiscount;
    try {
      shopifyDiscount = await createShopifyDiscountCode({
        discountValue,
        discountType,
        customerEmail,
        customerPhone,
        orderNumber,
        code: desiredCode
      });
    } catch (e) {
      console.error('❌ Failed to create desired discount code, aborting send:', e.message);
      return { success: false, error: e.message, summary: 'Failed to create discount code' };
    }

    // Use the actually created code (may include suffix if collision)
    const discountCode = shopifyDiscount.code;
    // Ensure URL contains the actual created code
    url.searchParams.set('discount', discountCode);
    recoveryUrl = url.toString();

    // Agent path: Always trigger Klaviyo event and let flows handle delivery
    const result = await sendDiscountViaEvent({
      customerEmail,
      customerPhone,
      customerName,
      discountValue,
      discountType,
      discountCode,
      recoveryUrl,
      abandonedCheckoutId,
      channel: customerPhone ? 'sms' : 'email'
    });
    
    console.log(`✅ Discount sent successfully via ${preferredChannel}`);
    console.log(`   Discount code: ${discountCode}`);
    console.log(`   Recovery URL: ${recoveryUrl}`);
    
    return {
      success: true,
      discountCode,
      recoveryUrl,
      cartTotal,
      cartItems,
      channel: customerPhone ? 'sms' : 'email',
      eventResult: result,
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discountCode} published via Klaviyo Event (flow delivery)`
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
 * Get customer's previous order history with line items
 */
export async function getCustomerOrderHistory(customerPhone, customerEmail, maxOrders = 3) {
  try {
    console.log(`📋 Fetching order history for phone: ${customerPhone}, email: ${customerEmail}`);
    
    const phone = String(customerPhone || "").replace(/[^\d+]/g, "");
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // Last year
    
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const params = {
      status: "any",
      financial_status: "paid",
      updated_at_min: since,
      limit: 50, // Get more orders to find matches
      fields: "id,name,order_number,customer,phone,shipping_address,current_total_price,created_at,line_items,tags"
    };

    const response = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN },
      params
    });

    const orders = response.data?.orders || [];
    
    // Find orders matching either phone or email
    const matchingOrders = orders
      .filter((order) => {
        const orderPhone = (order.phone || order?.customer?.phone || order?.shipping_address?.phone || "").replace(/[^\d+]/g, "");
        const orderEmail = order?.customer?.email || order?.email;
        
        // Match by phone (loose match on last 10 digits) or exact email match
        const phoneMatch = phone && orderPhone && phone.endsWith(orderPhone.slice(-10));
        const emailMatch = customerEmail && orderEmail && orderEmail.toLowerCase() === customerEmail.toLowerCase();
        
        return phoneMatch || emailMatch;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, maxOrders);

    console.log(`✅ Found ${matchingOrders.length} previous orders`);

    // Extract variant information from line items
    const orderHistory = matchingOrders.map(order => ({
      orderNumber: order.order_number,
      orderName: order.name,
      total: order.current_total_price,
      date: order.created_at,
      items: order.line_items.map(item => ({
        variantId: item.variant_id ? `gid://shopify/ProductVariant/${item.variant_id}` : null,
        productId: item.product_id ? `gid://shopify/Product/${item.product_id}` : null,
        title: item.title,
        vendor: item.vendor,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku
      })).filter(item => item.variantId) // Only include items with valid variant IDs
    }));

    // Get all unique variant IDs from their order history
    const allVariantIds = [];
    const itemFrequency = {};

    orderHistory.forEach(order => {
      order.items.forEach(item => {
        if (item.variantId) {
          allVariantIds.push(item.variantId);
          const key = `${item.title}_${item.variantId}`;
          itemFrequency[key] = (itemFrequency[key] || 0) + item.quantity;
        }
      });
    });

    // Sort items by frequency (most ordered first)
    const popularItems = Object.entries(itemFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([key, frequency]) => {
        const variantId = key.split('_').slice(-1)[0];
        const title = key.split('_').slice(0, -1).join('_');
        return { variantId, title, frequency };
      });

    return {
      success: true,
      orderHistory,
      allVariantIds: [...new Set(allVariantIds)], // Remove duplicates
      popularItems: popularItems.slice(0, 5), // Top 5 most ordered
      lastOrderDate: orderHistory[0]?.date,
      lastOrderTotal: orderHistory[0]?.total,
      totalOrders: matchingOrders.length
    };

  } catch (error) {
    console.error('❌ Error fetching customer order history:', error);
    return {
      success: false,
      error: error.message,
      orderHistory: [],
      allVariantIds: [],
      popularItems: []
    };
  }
}

/**
 * Create a win-back draft order in Shopify with discount and specific products
 */
export async function createWinBackDraftOrder({
  customerEmail,
  customerPhone, 
  customerName,
  productVariants = [], // Array of Shopify variant IDs
  discountValue = 20
}) {
  try {
    console.log('🎯 Creating Shopify draft order for win-back...');
    
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    // Smart product selection: prioritize customer history, fallback to store popular items
    let variantsToUse = productVariants;
    let orderContext = { usedHistory: false, historyItems: [] };
    
    if (productVariants.length === 0) {
      console.log('📦 No specific variants provided, checking customer history...');
      
      // First: Try to get their previous order history
      const customerHistory = await getCustomerOrderHistory(customerPhone, customerEmail, 3);
      
      if (customerHistory.success && customerHistory.popularItems.length > 0) {
        console.log(`✅ Found customer order history: ${customerHistory.popularItems.length} unique items`);
        
        // Use their most frequently ordered items (top 3)
        variantsToUse = customerHistory.popularItems
          .slice(0, 3)
          .map(item => item.variantId);
          
        orderContext = {
          usedHistory: true,
          historyItems: customerHistory.popularItems.slice(0, 3),
          lastOrderDate: customerHistory.lastOrderDate,
          lastOrderTotal: customerHistory.lastOrderTotal,
          totalOrders: customerHistory.totalOrders
        };
        
        console.log(`🎯 Using customer's favorite items:`, orderContext.historyItems.map(i => i.title));
      } else {
        console.log('📦 No customer history found, fetching store popular products...');
        
        try {
          // Fallback: Fetch top-selling products from store
          const popularVariantsQuery = `
            query {
              productVariants(first: 3, sortKey: INVENTORY_TOTAL, reverse: true) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                    product {
                      title
                      tags
                    }
                  }
                }
              }
            }
          `;

          const popularResponse = await fetch(shopifyGraphqlEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyAccessToken
            },
            body: JSON.stringify({
              query: popularVariantsQuery
            })
          });

          const popularData = await popularResponse.json();
          
          if (popularData.data?.productVariants?.edges?.length > 0) {
            // Use actual available products from your store
            variantsToUse = popularData.data.productVariants.edges
              .filter(edge => edge.node.availableForSale)
              .map(edge => edge.node.id);
            
            console.log(`✅ Using ${variantsToUse.length} store popular products as fallback`);
          } else {
            throw new Error('No available products found in store');
          }
        } catch (error) {
          console.error('❌ Could not fetch popular products:', error.message);
          return {
            success: false,
            error: 'No products specified and could not fetch default products. Please provide specific variant IDs.'
          };
        }
      }
    }

    if (variantsToUse.length === 0) {
      return {
        success: false,
        error: 'No product variants provided. Please specify which products to include in the draft order.'
      };
    }
    
    // Build line items for draft order
    const lineItems = variantsToUse.map(variantId => ({
      variantId: variantId.startsWith('gid://shopify') ? variantId : `gid://shopify/ProductVariant/${variantId}`,
      quantity: 1
    }));

    // Create draft order mutation
    const draftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            invoiceUrl
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
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
        email: customerEmail,
        lineItems: lineItems,
        appliedDiscount: {
          value: discountValue,
          valueType: "PERCENTAGE",
          title: "Win-Back Special",
          description: `${discountValue}% off welcome back offer`
        },
        note: `Win-back order for ${customerName} - ${discountValue}% discount applied`,
        tags: ["win-back", "grace-ai", "retell-generated"],
        sourceName: "Grace AI Win-Back Campaign",
        visibleToCustomer: true
      }
    };

    // Create draft order via GraphQL
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: draftOrderMutation,
        variables: variables
      })
    });

    const data = await response.json();
    
    if (data.errors || data.data?.draftOrderCreate?.userErrors?.length > 0) {
      throw new Error(data.errors?.[0]?.message || data.data?.draftOrderCreate?.userErrors?.[0]?.message || 'Failed to create draft order');
    }

    const draftOrder = data.data.draftOrderCreate.draftOrder;
    
    // Send invoice email via Shopify
    const invoiceMutation = `
      mutation draftOrderInvoiceSend($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            id
            invoiceSentAt
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const invoiceVariables = {
      id: draftOrder.id,
      email: {
        to: customerEmail,
        subject: `Your Special 20% Off Order is Ready - The Meatery`,
        customMessage: `Hi ${customerName}! We've prepared a special order just for you with 20% off. Click the link below to complete your purchase.`
      }
    };

    await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: invoiceMutation,
        variables: invoiceVariables
      })
    });

    console.log(`✅ Draft order created: ${draftOrder.id}`);
    console.log(`📧 Invoice sent to: ${customerEmail}`);
    
    return {
      success: true,
      draftOrderId: draftOrder.id,
      checkoutUrl: draftOrder.invoiceUrl,
      totalValue: parseFloat(draftOrder.totalPriceSet.shopMoney.amount),
      orderContext: orderContext, // Include whether we used customer history
      summary: `Draft order ${draftOrder.name} created with ${discountValue}% discount${orderContext.usedHistory ? ' using customer favorites' : ''}`
    };

  } catch (error) {
    console.error('❌ Error creating win-back draft order:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send Klaviyo event for win-back draft order to trigger SMS flow
 */
export async function sendWinBackDraftOrderEvent({
  customerEmail,
  customerPhone,
  customerName,
  draftOrderId,
  checkoutUrl,
  discountValue,
  totalValue
}) {
  try {
    console.log('📱 Sending win-back draft order event to Klaviyo...');
    
    const klaviyoApiKey = process.env.KLAVIYO_API_KEY;
    
    if (!klaviyoApiKey) {
      throw new Error('Klaviyo API key not configured');
    }

    // Create event data for Klaviyo
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          properties: {
            draft_order_id: draftOrderId,
            checkout_url: checkoutUrl,
            discount_value: discountValue,
            total_value: totalValue,
            campaign_type: 'win_back',
            channel: customerPhone ? 'sms' : 'email'
          },
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Grace Win-Back Draft Order' // ← Different event name!
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: customerPhone ? {
                phone_number: customerPhone,
                first_name: customerName,
                email: customerEmail || undefined,
                properties: {
                  last_winback_draft_order: draftOrderId,
                  last_winback_discount: discountValue
                }
              } : {
                email: customerEmail,
                first_name: customerName,
                properties: {
                  last_winback_draft_order: draftOrderId,
                  last_winback_discount: discountValue
                }
              }
            }
          },
          time: new Date().toISOString(),
          unique_id: `winback-${draftOrderId}-${Date.now()}`
        }
      }
    };

    const response = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Klaviyo API error: ${response.status} - ${errorData}`);
    }

    console.log(`✅ Win-back draft order event sent to Klaviyo`);
    console.log(`📱 Event will trigger SMS to: ${customerPhone}`);
    
    return {
      success: true,
      eventSent: true,
      summary: `Win-back event sent for draft order ${draftOrderId}`
    };

  } catch (error) {
    console.error('❌ Error sending win-back draft order event:', error);
    return {
      success: false,
      error: error.message
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
  createAndSendKlaviyoDiscount,
  createWinBackDraftOrder,
  sendWinBackDraftOrderEvent,
  getCustomerOrderHistory
};
