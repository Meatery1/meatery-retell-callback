import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

/**
 * GraphQL query to fetch a specific abandoned checkout by ID
 */
const ABANDONED_CHECKOUT_BY_ID_QUERY = `
  query GetAbandonedCheckoutById($id: ID!) {
    abandonedCheckout(id: $id) {
      id
      name
      abandonedCheckoutUrl
      createdAt
      updatedAt
      completedAt
      note
      customAttributes {
        key
        value
      }
      customer {
        id
        firstName
        lastName
        email
        phone
      }
      billingAddress {
        firstName
        lastName
        phone
        address1
        city
        province
        country
        zip
      }
      shippingAddress {
        firstName
        lastName
        phone
        address1
        city
        province
        country
        zip
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            variantTitle
            sku
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
              title
              handle
            }
            variant {
              id
              title
              sku
            }
          }
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      discountCodes
      totalDiscountSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      taxesIncluded
    }
  }
`;

/**
 * Execute a GraphQL query against Shopify Admin API
 */
async function executeGraphQLQuery(query, variables = {}) {
  try {
    const response = await axios.post(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`,
      {
        query,
        variables
      },
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data;
  } catch (error) {
    console.error('GraphQL query failed:', error.message);
    throw error;
  }
}

/**
 * Format abandoned checkout data for call placement
 */
function formatAbandonedCheckoutForCall(checkout) {
  // Get customer phone from various sources
  const phone = checkout.customer?.phone || 
                checkout.billingAddress?.phone || 
                checkout.shippingAddress?.phone;
  
  // Get customer name
  const customerName = checkout.customer?.firstName || 
                      checkout.billingAddress?.firstName ||
                      checkout.shippingAddress?.firstName ||
                      'there';
  
  // Format line items
  const lineItems = checkout.lineItems.edges.map(edge => {
    const item = edge.node;
    return `${item.quantity}x ${item.title}${item.variantTitle ? ` (${item.variantTitle})` : ''}`;
  });
  
  const itemsSummary = lineItems.join(', ');
  
  // Get total price
  const totalPrice = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || 0);
  const currency = checkout.totalPriceSet?.shopMoney?.currencyCode || 'USD';
  
  return {
    checkout_id: checkout.id,
    checkout_name: checkout.name,
    phone: phone ? phone.replace(/\D/g, '') : null,
    customer_name: customerName,
    customer_email: checkout.customer?.email,
    items_summary: itemsSummary,
    line_items: checkout.lineItems.edges.map(edge => edge.node),
    total_price: totalPrice,
    currency: currency,
    created_at: checkout.createdAt,
    updated_at: checkout.updatedAt,
    abandoned_url: checkout.abandonedCheckoutUrl,
    note: checkout.note,
    custom_attributes: checkout.customAttributes
  };
}

/**
 * Test the specific abandoned checkout
 */
async function testSpecificCheckout() {
  try {
    const checkoutId = '37329230495960';
    console.log(`🧪 Testing specific abandoned checkout: #${checkoutId}`);
    console.log('================================================\n');
    
    // Convert to GraphQL ID format
    const graphqlId = `gid://shopify/AbandonedCheckout/${checkoutId}`;
    console.log(`🔍 Fetching checkout with GraphQL ID: ${graphqlId}`);
    
    const data = await executeGraphQLQuery(ABANDONED_CHECKOUT_BY_ID_QUERY, { id: graphqlId });
    
    if (!data.abandonedCheckout) {
      throw new Error(`Abandoned checkout not found: ${checkoutId}`);
    }
    
    const checkout = data.abandonedCheckout;
    
    console.log('\n✅ SUCCESS! Found your abandoned checkout:');
    console.log(`   Name: ${checkout.name}`);
    console.log(`   Created: ${new Date(checkout.createdAt).toLocaleString()}`);
    console.log(`   Total: ${checkout.totalPriceSet?.shopMoney?.amount} ${checkout.totalPriceSet?.shopMoney?.currencyCode}`);
    
    if (checkout.customer) {
      console.log(`   Customer: ${checkout.customer.firstName || ''} ${checkout.customer.lastName || ''}`);
      console.log(`   Email: ${checkout.customer.email || 'Not provided'}`);
      console.log(`   Phone: ${checkout.customer.phone || 'Not provided'}`);
    }
    
    if (checkout.billingAddress) {
      console.log(`   Billing Phone: ${checkout.billingAddress.phone || 'Not provided'}`);
    }
    
    if (checkout.shippingAddress) {
      console.log(`   Shipping Phone: ${checkout.shippingAddress.phone || 'Not provided'}`);
    }
    
    if (checkout.lineItems?.edges?.length > 0) {
      console.log('\n📦 Items in cart:');
      checkout.lineItems.edges.forEach((edge, index) => {
        const item = edge.node;
        console.log(`   ${index + 1}. ${item.quantity}x ${item.title}`);
        if (item.variantTitle) {
          console.log(`      Variant: ${item.variantTitle}`);
        }
        console.log(`      Price: ${item.originalUnitPriceSet?.shopMoney?.amount} ${item.originalUnitPriceSet?.shopMoney?.currencyCode}`);
      });
    }
    
    // Format for call placement
    const formatted = formatAbandonedCheckoutForCall(checkout);
    
    console.log('\n📋 Formatted for Grace agent call:');
    console.log(`   Checkout ID: ${formatted.checkout_id}`);
    console.log(`   Customer: ${formatted.customer_name}`);
    console.log(`   Phone: ${formatted.phone || 'No phone available'}`);
    console.log(`   Items: ${formatted.items_summary}`);
    console.log(`   Total: ${formatted.currency} ${formatted.total_price}`);
    console.log(`   Created: ${new Date(formatted.created_at).toLocaleDateString()}`);
    
    if (!formatted.phone) {
      console.log('\n⚠️  WARNING: No phone number found for this customer.');
      console.log('   You may need to use email instead or skip this checkout.');
      return { success: false, error: 'No phone number available' };
    }
    
    console.log('\n🎉 READY FOR TESTING!');
    console.log('   This checkout has all the data needed to test the Grace agent.');
    console.log('   You can now place a call using the abandoned checkout recovery system.');
    
    return { success: true, checkout, formatted };
    
  } catch (error) {
    console.error('\n❌ Failed to fetch abandoned checkout:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Testing Specific Abandoned Checkout for Grace Agent');
  console.log('======================================================\n');
  
  // Check environment variables
  if (!process.env.SHOPIFY_STORE_DOMAIN) {
    console.error('❌ Missing SHOPIFY_STORE_DOMAIN environment variable');
    process.exit(1);
  }
  
  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Missing SHOPIFY_ADMIN_TOKEN environment variable');
    process.exit(1);
  }
  
  console.log(`🏪 Store: ${process.env.SHOPIFY_STORE_DOMAIN}`);
  console.log(`🔑 Token: ${process.env.SHOPIFY_ADMIN_TOKEN.substring(0, 10)}...`);
  console.log('');
  
  try {
    const result = await testSpecificCheckout();
    
    if (result.success) {
      console.log('\n🎉 Test completed successfully!');
      console.log('   Your abandoned checkout is ready for Grace agent testing.');
    } else {
      console.log('\n⚠️ Test completed with issues');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
main();
