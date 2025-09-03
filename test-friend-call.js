#!/usr/bin/env node

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Grace's agent ID
const GRACE_AGENT_ID = 'agent_e2636fcbe1c89a7f6bd0731e11';

// Default checkout data (fallback if no checkout ID provided)
const DEFAULT_CHECKOUT_DATA = {
  checkoutId: '37329230495960',
  phone: '16198940194',
  customerName: 'Carmen',
  mostExpensiveItem: 'that Japanese A5 Wagyu Ribeye',
  itemSuffix: '',
  itemCount: 1,
  totalPrice: 153.78,
  currency: 'USD',
  email: 'nickyfiorentino@gmail.com'
};

/**
 * GraphQL query to fetch abandoned checkout
 */
const FETCH_ABANDONED_CHECKOUT_QUERY = `
  query GetAbandonedCheckout($abandonedCheckoutId: ID!) {
    abandonmentByAbandonedCheckoutId(abandonedCheckoutId: $abandonedCheckoutId) {
      id
      abandonedCheckoutPayload {
        id
        name
        customer {
          firstName
          lastName
          email
          phone
        }
        billingAddress {
          firstName
          phone
        }
        shippingAddress {
          firstName
          phone
        }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              variantTitle
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              product {
                title
              }
            }
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

/**
 * Fetch real abandoned checkout data from Shopify
 */
async function fetchCheckoutData(checkoutId) {
  try {
    console.log(`🔍 Fetching checkout data for ID: ${checkoutId}...`);
    
    // Convert to GraphQL ID format if needed
    const graphqlId = checkoutId.startsWith('gid://') 
      ? checkoutId 
      : `gid://shopify/AbandonedCheckout/${checkoutId}`;
    
    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`,
      {
        query: FETCH_ABANDONED_CHECKOUT_QUERY,
        variables: { abandonedCheckoutId: graphqlId }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    const abandonment = response.data.data?.abandonmentByAbandonedCheckoutId;
    if (!abandonment?.abandonedCheckoutPayload) {
      throw new Error('Checkout not found');
    }
    
    return abandonment.abandonedCheckoutPayload;
  } catch (error) {
    console.warn(`⚠️  Could not fetch checkout data: ${error.message}`);
    console.log('   Using default checkout data instead\n');
    return null;
  }
}

/**
 * Find the most expensive item in the cart
 */
function findMostExpensiveItem(lineItems) {
  if (!lineItems || lineItems.length === 0) {
    return { title: 'premium selections', price: 0 };
  }
  
  let mostExpensive = lineItems[0];
  let highestPrice = 0;
  
  lineItems.forEach(item => {
    // Calculate the price from originalUnitPriceSet or a price field
    const unitPrice = parseFloat(
      item.originalUnitPriceSet?.shopMoney?.amount || 
      item.price || 
      0
    );
    const totalPrice = unitPrice * (item.quantity || 1);
    
    if (totalPrice > highestPrice) {
      highestPrice = totalPrice;
      mostExpensive = item;
    }
  });
  
  // Clean up the title for natural speech
  const title = mostExpensive.title || mostExpensive.product?.title || 'premium selection';
  
  // Format it naturally (remove technical details after | symbols)
  const cleanTitle = title.split('|')[0].trim();
  
  // Add "that" or "those" based on quantity
  const quantity = mostExpensive.quantity || 1;
  if (quantity > 1) {
    return { 
      title: `those ${quantity} ${cleanTitle}`,
      price: highestPrice
    };
  } else {
    return { 
      title: `that ${cleanTitle}`,
      price: highestPrice
    };
  }
}

/**
 * Create item suffix for multiple items
 */
function getItemSuffix(lineItems) {
  if (!lineItems || lineItems.length === 0) {
    return '';
  }
  
  // If there's more than one unique product (not just quantity)
  if (lineItems.length > 1) {
    return ' and some other goodies';
  }
  
  return '';
}

/**
 * Test call using real or default checkout data
 */
async function testFriendCall(friendPhoneNumber, checkoutId = null) {
  try {
    console.log('🧪 Testing Grace agent with improved natural conversation');
    console.log('=========================================================\n');
    
    let checkoutData = DEFAULT_CHECKOUT_DATA;
    
    // If checkout ID provided, try to fetch real data
    if (checkoutId) {
      const realCheckout = await fetchCheckoutData(checkoutId);
      if (realCheckout) {
        // Extract customer info
        const customer = realCheckout.customer;
        const customerName = customer?.firstName || 
                           realCheckout.billingAddress?.firstName ||
                           realCheckout.shippingAddress?.firstName ||
                           'there';
        
        // Get line items from edges structure
        const lineItems = realCheckout.lineItems?.edges?.map(edge => edge.node) || [];
        
        // Find the most expensive item to reference specifically
        const mostExpensiveItem = findMostExpensiveItem(lineItems);
        const itemSuffix = getItemSuffix(lineItems);
        const itemCount = lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        
        // Get phone from various sources
        const checkoutPhone = customer?.phone || 
                            realCheckout.billingAddress?.phone ||
                            realCheckout.shippingAddress?.phone;
        
        checkoutData = {
          checkoutId: realCheckout.id || checkoutId,
          phone: checkoutPhone || friendPhoneNumber,
          customerName: customerName,
          mostExpensiveItem: mostExpensiveItem.title,
          itemSuffix: itemSuffix,
          itemCount: itemCount,
          totalPrice: parseFloat(realCheckout.totalPriceSet?.shopMoney?.amount || 0),
          currency: realCheckout.totalPriceSet?.shopMoney?.currencyCode || 'USD',
          email: customer?.email || DEFAULT_CHECKOUT_DATA.email
        };
        
        console.log('✅ Using real checkout data from Shopify\n');
      }
    }
    
    console.log('📋 Call Configuration:');
    console.log(`   Customer: ${checkoutData.customerName}`);
    console.log(`   Calling: ${friendPhoneNumber} (test number)`);
    console.log(`   Most Expensive Item: "${checkoutData.mostExpensiveItem}"`);
    if (checkoutData.itemCount > 1) {
      console.log(`   Additional Items: Yes (${checkoutData.itemCount} total items)`);
      console.log(`   Grace will say: "${checkoutData.mostExpensiveItem}${checkoutData.itemSuffix}"`);
    }
    console.log(`   Total: ${checkoutData.currency} ${checkoutData.totalPrice}`);
    console.log(`   Email: ${checkoutData.email}`);
    console.log(`   Checkout ID: ${checkoutData.checkoutId}\n`);
    
    // Format phone number correctly
    const toNumber = friendPhoneNumber.startsWith('+') ? friendPhoneNumber : `+${friendPhoneNumber}`;
    
    console.log(`📞 Placing call from Grace to: ${toNumber}\n`);
    
    const call = await retell.call.createPhoneCall({
      from_number: '+16198212984',
      to_number: toNumber,
      override_agent_id: GRACE_AGENT_ID,
      
      // Dynamic variables for Grace - with ACTUAL DATA!
      retell_llm_dynamic_variables: {
        call_direction: 'OUTBOUND',
        customer_name: checkoutData.customerName,
        most_expensive_item: checkoutData.mostExpensiveItem,
        item_suffix: checkoutData.itemSuffix,
        item_count: String(checkoutData.itemCount),
        total_price: String(checkoutData.totalPrice),
        currency: checkoutData.currency,
        checkout_id: checkoutData.checkoutId,
        customer_phone: friendPhoneNumber,
        customer_email: checkoutData.email,
        is_abandoned_checkout: 'true'
      },
      
      metadata: {
        source: 'test_natural_conversation',
        checkout_id: checkoutData.checkoutId,
        customer_phone: friendPhoneNumber,
        customer_name: checkoutData.customerName,
        most_expensive_item: checkoutData.mostExpensiveItem,
        item_suffix: checkoutData.itemSuffix,
        item_count: String(checkoutData.itemCount),
        total_price: String(checkoutData.totalPrice),
        currency: checkoutData.currency,
        customer_email: checkoutData.email,
        test_type: 'natural_conversation_test'
      }
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log(`Call ID: ${call.call_id}`);
    console.log(`Status: ${call.call_status}\n`);
    
    console.log('🎯 Grace will:');
    console.log(`   ✅ Say "Hey ${checkoutData.customerName}" (not [customer_name])`);
    console.log(`   ✅ Reference "${checkoutData.mostExpensiveItem}${checkoutData.itemSuffix}"`);
    console.log('   ✅ NOT list out every single product');
    console.log('   ✅ Sound conversational and personal');
    console.log('   ✅ Leave only ONE voicemail if needed');
    console.log('\n📞 Grace should be calling shortly!');
    
    return { success: true, call_id: call.call_id, call_status: call.call_status };
    
  } catch (error) {
    console.error('❌ Failed to place test call:', error.message);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const friendPhoneNumber = args[0];
const checkoutId = args[1]; // Optional checkout ID

if (!friendPhoneNumber) {
  console.log('Usage: node test-friend-call.js <phone_number> [checkout_id]');
  console.log('\nExamples:');
  console.log('  node test-friend-call.js 15551234567');
  console.log('  node test-friend-call.js 15551234567 37382098518232');
  console.log('\nNote:');
  console.log('  - checkout_id is optional. If provided, will fetch real checkout data from Shopify.');
  console.log('  - The phone number you provide will override the customer phone for testing.');
  console.log('  - Grace will reference items naturally like "those premium wagyu steaks"');
  console.log('  - She will NOT robotically list every item in the cart.');
  process.exit(1);
}

// Run the test
testFriendCall(friendPhoneNumber, checkoutId)
  .then(result => {
    console.log('\n✅ Test call successful!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test call failed:', error.message);
    process.exit(1);
  });