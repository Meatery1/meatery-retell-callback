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
    
    console.log(`🔍 Using GraphQL to find customer by phone: "${phone}" or email: "${customerEmail}"`);
    
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    let customer = null;
    let searchMethod = '';

    // Try to find customer using different methods
    const customerCandidates = [];
    
    if (phone) {
      console.log(`🔍 Attempting phone search with: ${phone}`);
      
      // Method 1: Use customers query with phone search (can return multiple matches)
      const phoneSearchGraphQL = `
        query findByPhone($query: String!) {
          customers(first: 20, query: $query) {
            edges {
              node {
                id
                firstName
                lastName
                email
                phone
                defaultPhoneNumber {
                  phoneNumber
                }
                numberOfOrders
                amountSpent {
                  amount
                  currencyCode
                }
                lastOrder {
                  createdAt
                }
                orders(first: 50, sortKey: CREATED_AT, reverse: true) {
                  edges {
                    node {
                      id
                      name
                      createdAt
                      currentTotalPriceSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      lineItems(first: 20) {
                        edges {
                          node {
                            title
                            quantity
                            variant {
                              id
                              title
                              sku
                              product {
                                title
                                vendor
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      // Try different phone formats to catch all possible matches
      const phoneFormats = [
        phone, // Original: +16194587071
        phone.replace(/^\+1/, ''), // Without +1: 6194587071
        phone.replace(/^\+/, ''), // Without +: 16194587071
      ];

      for (const phoneFormat of phoneFormats) {
        console.log(`🔍 Searching for phone format: ${phoneFormat}`);
        
        const response = await fetch(shopifyGraphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopifyAccessToken
          },
          body: JSON.stringify({
            query: phoneSearchGraphQL,
            variables: { query: `phone:${phoneFormat}` }
          })
        });

        const data = await response.json();
        
        if (data.errors) {
          console.log(`❌ GraphQL errors for phone ${phoneFormat}:`, data.errors);
          continue;
        }

        const customers = data.data?.customers?.edges || [];
        if (customers.length > 0) {
          console.log(`✅ Found ${customers.length} customer(s) for phone ${phoneFormat}`);
          customers.forEach(customerEdge => {
            customerCandidates.push({
              customer: customerEdge.node,
              searchMethod: `phone (${phoneFormat})`,
              phoneFormat: phoneFormat
            });
          });
        }
      }

      console.log(`🔍 Total customer candidates found: ${customerCandidates.length}`);
      
      // If we found multiple candidates, pick the best one
      if (customerCandidates.length > 1) {
        console.log(`⚠️ Multiple customers found for phone ${phone}:`);
        customerCandidates.forEach((candidate, index) => {
          console.log(`  ${index + 1}. ${candidate.customer.firstName} ${candidate.customer.lastName} - ${candidate.customer.email} - ${candidate.customer.numberOfOrders} orders - $${candidate.customer.amountSpent.amount} spent`);
        });
        
        // Prioritize by: 1) Most orders, 2) Highest spend, 3) Most recent activity
        const bestCustomer = customerCandidates.sort((a, b) => {
          // First: Most orders
          if (a.customer.numberOfOrders !== b.customer.numberOfOrders) {
            return b.customer.numberOfOrders - a.customer.numberOfOrders;
          }
          // Second: Highest lifetime spend
          if (parseFloat(a.customer.amountSpent.amount) !== parseFloat(b.customer.amountSpent.amount)) {
            return parseFloat(b.customer.amountSpent.amount) - parseFloat(a.customer.amountSpent.amount);
          }
          // Third: Most recent order
          const aLastOrder = a.customer.lastOrder?.createdAt || '1970-01-01';
          const bLastOrder = b.customer.lastOrder?.createdAt || '1970-01-01';
          return new Date(bLastOrder) - new Date(aLastOrder);
        })[0];
        
        customer = bestCustomer.customer;
        searchMethod = `${bestCustomer.searchMethod} (best of ${customerCandidates.length} matches)`;
        
        console.log(`✅ Selected best customer: ${customer.firstName} ${customer.lastName} - ${customer.email} - ${customer.numberOfOrders} orders - $${customer.amountSpent.amount}`);
        
      } else if (customerCandidates.length === 1) {
        customer = customerCandidates[0].customer;
        searchMethod = customerCandidates[0].searchMethod;
        console.log(`✅ Found single customer: ${customer.firstName} ${customer.lastName}`);
      }
    }

    // Fallback: Try email search if phone didn't work and email is available
    if (!customer && customerEmail) {
      console.log(`🔍 Attempting email search with: ${customerEmail}`);
      
      const emailSearchGraphQL = `
        query findByEmail($emailAddress: String!) {
          customerByIdentifier(identifier: { emailAddress: $emailAddress }) {
            id
            firstName
            lastName
            email
            phone
            defaultPhoneNumber {
              phoneNumber
            }
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            lastOrder {
              createdAt
            }
            orders(first: 50, sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id
                  name
                  createdAt
                  currentTotalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  lineItems(first: 20) {
                    edges {
                      node {
                        title
                        quantity
                        variant {
                          id
                          title
                          sku
                          product {
                            title
                            vendor
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch(shopifyGraphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyAccessToken
        },
        body: JSON.stringify({
          query: emailSearchGraphQL,
          variables: { emailAddress: customerEmail }
        })
      });

      const data = await response.json();
      
      if (data.errors) {
        console.log(`❌ GraphQL errors for email:`, data.errors);
      } else if (data.data?.customerByIdentifier) {
        customer = data.data.customerByIdentifier;
        searchMethod = `email (${customerEmail})`;
        console.log(`✅ Found customer by email: ${customer.firstName} ${customer.lastName}`);
      }
    }

    // Final check: if no customer found
    if (!customer) {
      console.log(`❌ No customer found for phone: ${phone}, email: ${customerEmail}`);
      return {
        success: false,
        error: 'No customer found',
        orderHistory: [],
        allVariantIds: [],
        popularItems: []
      };
    }

    const customerOrders = customer.orders.edges;
    console.log(`✅ Found customer: ${customer.firstName} ${customer.lastName} via ${searchMethod} with ${customerOrders.length} recent orders`);

    // Extract variant information from GraphQL response
    const orderHistory = customerOrders.map(orderEdge => {
      const order = orderEdge.node;
      return {
        orderNumber: order.name.replace('#', ''), // Remove # from order name
        orderName: order.name,
        total: order.currentTotalPriceSet.shopMoney.amount,
        date: order.createdAt,
        items: order.lineItems.edges.map(lineItemEdge => {
          const lineItem = lineItemEdge.node;
          return {
            variantId: lineItem.variant?.id || null,
            title: lineItem.title,
            vendor: lineItem.variant?.product?.vendor || 'Unknown',
            quantity: lineItem.quantity,
            sku: lineItem.variant?.sku || ''
          };
        }).filter(item => item.variantId) // Only include items with valid variant IDs
      };
    });

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
        const parts = key.split('_');
        const variantId = parts[parts.length - 1];
        const title = parts.slice(0, -1).join('_');
        return { variantId, title, frequency };
      });

    return {
      success: true,
      customer: {
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        phone: customer.phone,
        numberOfOrders: customer.numberOfOrders,
        amountSpent: customer.amountSpent.amount
      },
      searchInfo: {
        method: searchMethod,
        totalCandidates: customerCandidates.length,
        multipleProfiles: customerCandidates.length > 1
      },
      orderHistory: orderHistory.slice(0, maxOrders), // Limit final return but process all 50
      allOrderHistory: orderHistory, // Full history for analysis
      allVariantIds: [...new Set(allVariantIds)], // Remove duplicates
      popularItems: popularItems.slice(0, 5), // Top 5 most ordered
      lastOrderDate: orderHistory[0]?.date,
      lastOrderTotal: orderHistory[0]?.total,
      totalOrders: orderHistory.length, // All orders found, not just returned
      totalLifetimeValue: customer.amountSpent.amount
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
  discountValue = 20,
  targetAmount = 400 // Target order value before discount
}) {
  try {
    console.log('🎯 Creating Shopify draft order for win-back...');
    
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    // Intelligent product selection: prioritize customer history + similar recommendations
    let variantsToUse = productVariants;
    let orderContext = { usedHistory: false, historyItems: [], targetAmount, reasoning: [] };
    
    if (productVariants.length === 0) {
      console.log('🧠 No specific variants provided, using intelligent product selector...');
      
      // Import and use the intelligent product selector
      const { getIntelligentProductRecommendations } = await import('./intelligent-product-selector.js');
      
      const intelligentRecommendations = await getIntelligentProductRecommendations({
        customerPhone,
        customerEmail,
        targetAmount,
        maxItems: 6
      });
      
      if (intelligentRecommendations.success && intelligentRecommendations.recommendations.length > 0) {
        console.log(`✅ Got ${intelligentRecommendations.recommendations.length} intelligent recommendations`);
        
        // Extract variant IDs and quantities
        variantsToUse = intelligentRecommendations.recommendations.map(rec => rec.variantId);
        
        // Store the full recommendation context for later use
        orderContext = {
          usedHistory: intelligentRecommendations.context.usedHistory,
          historyItems: intelligentRecommendations.context.historyItems,
          reasoning: intelligentRecommendations.context.reasoning,
          recommendations: intelligentRecommendations.recommendations,
          targetAmount,
          estimatedTotal: intelligentRecommendations.totalEstimated
        };
        
        console.log(`🎯 Intelligent selection:`, intelligentRecommendations.recommendations.map(r => `${r.quantity}x ${r.title} ($${r.price}) - ${r.reason}`));
        console.log(`📝 Reasoning:`, orderContext.reasoning);
      } else {
        console.error('❌ Intelligent product selector failed:', intelligentRecommendations.error);
        return {
          success: false,
          error: 'Could not determine appropriate products for this customer. Please specify specific variant IDs.'
        };
      }
    }

    if (variantsToUse.length === 0) {
      return {
        success: false,
        error: 'No product variants provided. Please specify which products to include in the draft order.'
      };
    }
    
    // Build line items for draft order - target specific amount
    let lineItems = [];
    
    if (variantsToUse.length > 0) {
      // Get product details with prices to calculate quantities
      const variantDetailsQuery = `
        query getVariantDetails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              price
              title
              product {
                title
              }
              availableForSale
            }
          }
        }
      `;
      
      const variantIds = variantsToUse.map(id => 
        id.startsWith('gid://shopify') ? id : `gid://shopify/ProductVariant/${id}`
      );
      
      try {
        const variantResponse = await fetch(shopifyGraphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopifyAccessToken
          },
          body: JSON.stringify({
            query: variantDetailsQuery,
            variables: { ids: variantIds }
          })
        });
        
        const variantData = await variantResponse.json();
        const variants = variantData.data?.nodes?.filter(node => node && node.availableForSale) || [];
        
        if (variants.length === 0) {
          console.log('❌ No available variants found');
          return {
            success: false,
            error: 'Selected products are not available for sale'
          };
        }
        
        // Use intelligent quantity recommendations if available, otherwise use smart calculation
        let currentTotal = 0;
        const targetBeforeDiscount = targetAmount;
        
        console.log(`🎯 Building order to reach $${targetBeforeDiscount} (target: $${targetAmount})`);
        
        if (orderContext.recommendations && orderContext.recommendations.length > 0) {
          // Use the intelligent recommendations with their calculated quantities
          console.log('📝 Using intelligent quantity recommendations');
          
          orderContext.recommendations.forEach(rec => {
            const variant = variants.find(v => v.id === rec.variantId);
            if (variant) {
              const price = parseFloat(variant.price);
              lineItems.push({
                variantId: variant.id,
                quantity: rec.quantity
              });
              currentTotal += price * rec.quantity;
              console.log(`Added ${rec.quantity}x ${variant.product.title} - ${variant.title} ($${price} each) - ${rec.reason} - Running total: $${currentTotal.toFixed(2)}`);
            }
          });
        } else {
          // Fallback to basic quantity calculation
          console.log('📝 Using fallback quantity calculation');
          
          // Sort variants by price (ascending) for better distribution
          variants.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
          
          // Start with 1 of each item, then add more of the most expensive items to reach target
          variants.forEach(variant => {
            const price = parseFloat(variant.price);
            lineItems.push({
              variantId: variant.id,
              quantity: 1
            });
            currentTotal += price;
            console.log(`Added 1x ${variant.product.title} - ${variant.title} ($${price}) - Running total: $${currentTotal.toFixed(2)}`);
          });
          
          // If we haven't reached target, add more of the higher-value items
          if (currentTotal < targetBeforeDiscount && variants.length > 0) {
            const remainingAmount = targetBeforeDiscount - currentTotal;
            console.log(`🔄 Need $${remainingAmount.toFixed(2)} more to reach target`);
            
            // Add quantities of the most expensive items first
            const expensiveVariants = [...variants].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
            
            for (const variant of expensiveVariants) {
              const price = parseFloat(variant.price);
              const additionalQuantity = Math.floor((targetBeforeDiscount - currentTotal) / price);
              
              if (additionalQuantity > 0 && additionalQuantity <= 2) { // Don't go crazy with quantities
                // Find existing line item and increase quantity
                const existingItem = lineItems.find(item => item.variantId === variant.id);
                if (existingItem) {
                  existingItem.quantity += additionalQuantity;
                  currentTotal += (price * additionalQuantity);
                  console.log(`Increased ${variant.product.title} to ${existingItem.quantity}x - Added $${(price * additionalQuantity).toFixed(2)} - Running total: $${currentTotal.toFixed(2)}`);
                }
                
                if (currentTotal >= targetBeforeDiscount * 0.95) { // Within 5% of target
                  break;
                }
              }
            }
          }
        }
        
        console.log(`✅ Final order total: $${currentTotal.toFixed(2)} (Target: $${targetBeforeDiscount})`);
        orderContext.actualAmount = currentTotal;
        
      } catch (error) {
        console.error('❌ Error fetching variant details:', error);
        // Fallback to simple approach
        lineItems = variantsToUse.map(variantId => ({
          variantId: variantId.startsWith('gid://shopify') ? variantId : `gid://shopify/ProductVariant/${variantId}`,
          quantity: 1
        }));
      }
    } else {
      // Fallback if no variants
      lineItems = variantsToUse.map(variantId => ({
        variantId: variantId.startsWith('gid://shopify') ? variantId : `gid://shopify/ProductVariant/${variantId}`,
        quantity: 1
      }));
    }

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
