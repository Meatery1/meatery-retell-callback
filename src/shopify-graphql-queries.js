import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

/**
 * GraphQL query to fetch abandoned checkouts
 */
const ABANDONED_CHECKOUTS_QUERY = `
  query GetAbandonedCheckouts($first: Int!, $query: String) {
    abandonedCheckouts(first: $first, query: $query) {
      edges {
        cursor
        node {
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
            displayName
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
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

/**
 * GraphQL query to fetch a specific abandoned checkout by ID
 */
const ABANDONED_CHECKOUT_BY_ID_QUERY = `
  query GetAbandonedCheckoutById($id: ID!) {
    node(id: $id) {
      ... on AbandonedCheckout {
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
          displayName
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
  }
`;

/**
 * GraphQL query to get abandoned checkouts count
 */
const ABANDONED_CHECKOUTS_COUNT_QUERY = `
  query GetAbandonedCheckoutsCount($query: String) {
    abandonedCheckoutsCount(query: $query) {
      count
      precision
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
 * Fetch abandoned checkouts using GraphQL
 */
export async function fetchAbandonedCheckoutsGraphQL({ first = 50, query = null } = {}) {
  try {
    console.log('🔍 Fetching abandoned checkouts via GraphQL...');
    
    const variables = { first };
    if (query) {
      variables.query = query;
    }

    const data = await executeGraphQLQuery(ABANDONED_CHECKOUTS_QUERY, variables);
    
    const checkouts = data.abandonedCheckouts.edges.map(edge => edge.node);
    
    console.log(`✅ Found ${checkouts.length} abandoned checkouts`);
    
    return {
      checkouts,
      pageInfo: data.abandonedCheckouts.pageInfo,
      total: checkouts.length
    };
    
  } catch (error) {
    console.error('❌ Failed to fetch abandoned checkouts:', error.message);
    throw error;
  }
}

/**
 * Fetch a specific abandoned checkout by ID
 */
export async function fetchAbandonedCheckoutById(checkoutId) {
  try {
    console.log(`🔍 Fetching abandoned checkout: ${checkoutId}`);
    
    // Convert numeric ID to GraphQL ID format if needed
    let graphqlId = checkoutId;
    if (!checkoutId.startsWith('gid://')) {
      graphqlId = `gid://shopify/AbandonedCheckout/${checkoutId}`;
    }
    
    const data = await executeGraphQLQuery(ABANDONED_CHECKOUT_BY_ID_QUERY, { id: graphqlId });

    const checkout = data?.node;
    if (!checkout) {
      throw new Error(`Abandoned checkout not found: ${checkoutId}`);
    }
    console.log(`✅ Found abandoned checkout: ${checkout.name}`);
    
    return checkout;
    
  } catch (error) {
    console.error(`❌ Failed to fetch abandoned checkout ${checkoutId}:`, error.message);
    throw error;
  }
}

/**
 * Find the latest abandoned checkout by contact info (email and/or phone)
 * Returns the checkout node (including abandonedCheckoutUrl) or null
 */
export async function findLatestAbandonedCheckout({ email = null, phone = null } = {}) {
  try {
    const queries = [];
    const sanitizedPhone = String(phone || "").replace(/[^\d]/g, "");
    if (email) {
      queries.push(`customer_email:${email}`);
      queries.push(`email:${email}`);
    }
    if (sanitizedPhone) {
      // Try full and last-10 digit matches
      queries.push(`customer_phone:*${sanitizedPhone}*`);
      if (sanitizedPhone.length >= 10) {
        queries.push(`customer_phone:*${sanitizedPhone.slice(-10)}*`);
      }
    }
    // Always have a final fallback to recent list if targeted queries fail
    for (const q of queries) {
      try {
        const { checkouts } = await fetchAbandonedCheckoutsGraphQL({ first: 50, query: q });
        if (Array.isArray(checkouts) && checkouts.length > 0) {
          // Sort desc by createdAt and return first
          const sorted = [...checkouts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return sorted[0];
        }
      } catch (_) { /* try next */ }
    }
    // Fallback: recent 100 and filter by phone/email client-side
    const recent = await fetchAbandonedCheckoutsGraphQL({ first: 100 });
    const lowerEmail = String(email || "").toLowerCase();
    const last10 = sanitizedPhone.length >= 10 ? sanitizedPhone.slice(-10) : null;
    const candidates = (recent.checkouts || []).filter(c => {
      const em = c?.customer?.email || c?.billingAddress?.email || "";
      const ph = (c?.customer?.phone || c?.billingAddress?.phone || c?.shippingAddress?.phone || "").replace(/[^\d]/g, "");
      const phLast10 = ph.length >= 10 ? ph.slice(-10) : null;
      return (lowerEmail && String(em).toLowerCase() === lowerEmail) || (last10 && phLast10 === last10);
    });
    if (candidates.length > 0) {
      const sorted = [...candidates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sorted[0];
    }
    return null;
  } catch (error) {
    console.error('❌ findLatestAbandonedCheckout error:', error.message);
    return null;
  }
}

/**
 * Get count of abandoned checkouts
 */
export async function getAbandonedCheckoutsCount(query = null) {
  try {
    console.log('🔍 Getting abandoned checkouts count...');
    
    const variables = {};
    if (query) {
      variables.query = query;
    }

    const data = await executeGraphQLQuery(ABANDONED_CHECKOUTS_COUNT_QUERY, variables);
    
    console.log(`✅ Abandoned checkouts count: ${data.abandonedCheckoutsCount.count}`);
    
    return data.abandonedCheckoutsCount;
    
  } catch (error) {
    console.error('❌ Failed to get abandoned checkouts count:', error.message);
    throw error;
  }
}

/**
 * Format abandoned checkout data for call placement
 */
export function formatAbandonedCheckoutForCall(checkout) {
  // Get customer phone from various sources
  const phone = checkout.customer?.phone || 
                checkout.billingAddress?.phone || 
                checkout.shippingAddress?.phone;
  
  // Get customer name
  const customerName = checkout.customer?.firstName || 
                      checkout.billingAddress?.firstName ||
                      checkout.shippingAddress?.firstName ||
                      'there';
  
  // Format line items and find most expensive
  const lineItemsWithPrices = checkout.lineItems.edges.map(edge => {
    const item = edge.node;
    const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || item.discountedUnitPriceSet?.shopMoney?.amount || 0);
    const totalItemPrice = unitPrice * item.quantity;
    
    // Clean up product name for conversational speech
    let conversationalName = item.title
      .replace(/\|/g, '-') // Replace pipes with dashes
      .replace(/\s+/g, ' ') // Clean up multiple spaces
      .trim();
    
    // Add variant title if it exists and is different from main title
    if (item.variantTitle && !conversationalName.includes(item.variantTitle)) {
      conversationalName += ` (${item.variantTitle})`;
    }
    
    return {
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPrice: unitPrice,
      totalItemPrice: totalItemPrice,
      displayName: conversationalName,
      formatted: `${item.quantity}x ${item.title}${item.variantTitle ? ` (${item.variantTitle})` : ''}`
    };
  });
  
  // Find the most expensive item (by total price for that line item)
  const mostExpensiveItem = lineItemsWithPrices.reduce((max, current) => 
    (current.totalItemPrice > max.totalItemPrice) ? current : max, 
    lineItemsWithPrices[0] || { displayName: 'your items' }
  );
  
  // Format line items for summary
  const lineItems = lineItemsWithPrices.map(item => item.formatted);
  const itemsSummary = lineItems.join(', ');
  
  // Get total price
  const totalPrice = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || 0);
  const currency = checkout.currencyCode || 'USD';
  
  return {
    checkout_id: checkout.id,
    checkout_name: checkout.name,
    phone: phone ? phone.replace(/\D/g, '') : null,
    customer_name: customerName,
    customer_email: checkout.customer?.email || checkout.billingAddress?.email,
    items_summary: itemsSummary,
    most_expensive_item: mostExpensiveItem.displayName, // Add most expensive item
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
 * Search for abandoned checkouts by various criteria
 */
export async function searchAbandonedCheckouts(searchTerm, first = 50) {
  try {
    console.log(`🔍 Searching abandoned checkouts for: "${searchTerm}"`);
    
    // Try different search approaches
    const searchQueries = [
      `name:*${searchTerm}*`,
      `customer_email:*${searchTerm}*`,
      `created_at:>2024-08-20`, // Look for checkouts from August 20th onwards
      `created_at:>2024-08-25`  // Specifically around August 25th
    ];
    
    for (const query of searchQueries) {
      try {
        console.log(`   Trying query: ${query}`);
        const result = await fetchAbandonedCheckoutsGraphQL({ first, query });
        
        if (result.checkouts.length > 0) {
          console.log(`✅ Found ${result.checkouts.length} checkouts with query: ${query}`);
          return result;
        }
      } catch (error) {
        console.log(`   Query failed: ${query} - ${error.message}`);
        continue;
      }
    }
    
    // If no specific search worked, get recent ones and filter
    console.log('   No specific matches, getting recent checkouts...');
    const recentResult = await fetchAbandonedCheckoutsGraphQL({ first: 200 }); // Increased to 200 to find more recent ones
    
    // Filter by search term and date
    const filtered = recentResult.checkouts.filter(checkout => {
      const searchLower = searchTerm.toLowerCase();
      const checkoutDate = new Date(checkout.createdAt);
      const august25 = new Date('2024-08-25');
      const isAroundAugust25 = Math.abs(checkoutDate - august25) < (7 * 24 * 60 * 60 * 1000); // Within 7 days of Aug 25
      
      return (
        checkout.name?.toLowerCase().includes(searchLower) ||
        checkout.customer?.email?.toLowerCase().includes(searchLower) ||
        checkout.customer?.firstName?.toLowerCase().includes(searchLower) ||
        checkout.customer?.lastName?.toLowerCase().includes(searchLower) ||
        checkout.id?.includes(searchTerm) ||
        isAroundAugust25 // Include checkouts from around August 25th
      );
    });
    
    console.log(`✅ Found ${filtered.length} checkouts matching criteria`);
    
    return {
      checkouts: filtered,
      total: filtered.length,
      pageInfo: recentResult.pageInfo
    };
    
  } catch (error) {
    console.error(`❌ Search failed for "${searchTerm}":`, error.message);
    throw error;
  }
}

/**
 * Test function to fetch your specific abandoned checkout
 */
export async function testSpecificCheckout() {
  try {
    console.log('🧪 Testing with your specific abandoned checkout: #37368776458456');
    
    // First try to get the count
    const countData = await getAbandonedCheckoutsCount();
    console.log(`📊 Total abandoned checkouts: ${countData.count}`);
    
    // Try to fetch your specific checkout
    try {
      const checkout = await fetchAbandonedCheckoutById('37368776458456');
      console.log('\n✅ Successfully fetched your abandoned checkout:');
      console.log(`   Name: ${checkout.name}`);
      console.log(`   Created: ${checkout.createdAt}`);
      console.log(`   Total: ${checkout.totalPriceSet?.shopMoney?.amount} ${checkout.currencyCode}`);
      
      const formatted = formatAbandonedCheckoutForCall(checkout);
      console.log('\n📋 Formatted for call:');
      console.log(`   Customer: ${formatted.customer_name}`);
      console.log(`   Phone: ${formatted.phone || 'Not available'}`);
      console.log(`   Items: ${formatted.items_summary}`);
      console.log(`   Total: ${formatted.currency} ${formatted.total_price}`);
      
      return { success: true, checkout, formatted };
      
    } catch (checkoutError) {
      console.log('\n⚠️ Could not fetch specific checkout, trying to find it in the list...');
      
      // Fetch recent abandoned checkouts to see if we can find it
      const recentCheckouts = await fetchAbandonedCheckoutsGraphQL({ first: 10 });
      
      console.log('\n📋 Recent abandoned checkouts:');
      recentCheckouts.checkouts.forEach((checkout, index) => {
        console.log(`   ${index + 1}. ${checkout.name} - ${checkout.totalPriceSet?.shopMoney?.amount} ${checkout.currencyCode}`);
        console.log(`      Created: ${checkout.createdAt}`);
        console.log(`      Customer: ${checkout.customer?.firstName || 'Unknown'}`);
      });
      
      return { success: false, error: checkoutError.message, recentCheckouts };
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Export the test function for command line usage
if (import.meta.url === `file://${process.argv[1]}`) {
  testSpecificCheckout()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 Test completed successfully!');
      } else {
        console.log('\n⚠️ Test completed with issues');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    });
}
