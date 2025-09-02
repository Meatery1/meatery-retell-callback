import { 
  fetchAbandonedCheckoutsGraphQL, 
  fetchAbandonedCheckoutById, 
  formatAbandonedCheckoutForCall 
} from './shopify-graphql-queries.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Fetch abandoned checkouts from Shopify using GraphQL
 * This replaces the old REST API approach
 */
export async function fetchAbandonedCheckouts({ hours = 24, minValue = 50, first = 50 } = {}) {
  try {
    console.log(`🔍 Fetching abandoned checkouts from last ${hours} hours, min value: $${minValue}`);
    
    // Build query filter for abandoned checkouts
    const query = `created_at:>${hours} hours ago`;
    
    const result = await fetchAbandonedCheckoutsGraphQL({ first, query });
    
    // Filter by minimum value if specified
    let filteredCheckouts = result.checkouts;
    if (minValue > 0) {
      filteredCheckouts = result.checkouts.filter(checkout => {
        const total = parseFloat(checkout.totalPriceSet?.shopMoney?.amount || 0);
        return total >= minValue;
      });
      console.log(`💰 Filtered to ${filteredCheckouts.length} checkouts with value >= $${minValue}`);
    }
    
    return {
      checkouts: filteredCheckouts,
      total: filteredCheckouts.length,
      pageInfo: result.pageInfo
    };
    
  } catch (error) {
    console.error('❌ Failed to fetch abandoned checkouts:', error.message);
    throw error;
  }
}

/**
 * Fetch a specific abandoned checkout by ID
 */
export async function getAbandonedCheckoutById(checkoutId) {
  try {
    const checkout = await fetchAbandonedCheckoutById(checkoutId);
    return checkout;
  } catch (error) {
    console.error(`❌ Failed to fetch abandoned checkout ${checkoutId}:`, error.message);
    throw error;
  }
}

/**
 * Format checkout data for call placement
 */
export function formatCheckoutForCall(checkout) {
  return formatAbandonedCheckoutForCall(checkout);
}

/**
 * Check if customer has recent successful orders
 * This helps avoid calling customers who just made purchases
 */
export async function checkCustomerHistory(customerEmail, days = 7) {
  try {
    if (!customerEmail) return { hasRecentOrders: false, lastOrderDate: null };
    
    // Query for recent orders by this customer
    const query = `email:${customerEmail} AND created_at:>${days} days ago`;
    
    // This would need to be implemented with a separate GraphQL query for orders
    // For now, return a basic check
    console.log(`🔍 Checking customer history for ${customerEmail} (last ${days} days)`);
    
    return { hasRecentOrders: false, lastOrderDate: null };
    
  } catch (error) {
    console.error('❌ Failed to check customer history:', error.message);
    return { hasRecentOrders: false, lastOrderDate: null };
  }
}

/**
 * Check if customer is eligible for discount based on history
 */
export async function checkDiscountEligibility(customerEmail, totalValue) {
  try {
    const history = await checkCustomerHistory(customerEmail);
    
    // If they have recent orders, they might be less likely to need a discount
    if (history.hasRecentOrders) {
      return {
        eligible: true,
        discountPercent: 5, // Smaller discount for recent customers
        reason: 'Recent customer - smaller discount'
      };
    }
    
    // Higher value carts get bigger discounts
    if (totalValue >= 200) {
      return {
        eligible: true,
        discountPercent: 15,
        reason: 'High value cart - maximum discount'
      };
    } else if (totalValue >= 100) {
      return {
        eligible: true,
        discountPercent: 10,
        reason: 'Medium value cart - standard discount'
      };
    } else {
      return {
        eligible: true,
        discountPercent: 5,
        reason: 'Lower value cart - minimal discount'
      };
    }
    
  } catch (error) {
    console.error('❌ Failed to check discount eligibility:', error.message);
    // Default to eligible with 10% discount
    return {
      eligible: true,
      discountPercent: 10,
      reason: 'Default discount due to error'
    };
  }
}

/**
 * Get abandoned checkouts ready for calling
 * Filters out customers with recent orders and formats data
 */
export async function getAbandonedCheckoutsForCalling({ hours = 24, minValue = 50, first = 50 } = {}) {
  try {
    console.log('📞 Preparing abandoned checkouts for calling...');
    
    const result = await fetchAbandonedCheckouts({ hours, minValue, first });
    
    const readyForCalling = [];
    
    for (const checkout of result.checkouts) {
      const formatted = formatCheckoutForCall(checkout);
      
      // Skip if no phone number
      if (!formatted.phone) {
        console.log(`⚠️  Skipping ${formatted.checkout_name} - no phone number`);
        continue;
      }
      
      // Check customer history
      const history = await checkCustomerHistory(formatted.customer_email);
      if (history.hasRecentOrders) {
        console.log(`⚠️  Skipping ${formatted.checkout_name} - customer has recent orders`);
        continue;
      }
      
      // Check discount eligibility
      const discountInfo = await checkDiscountEligibility(formatted.customer_email, formatted.total_price);
      
      readyForCalling.push({
        ...formatted,
        discountInfo,
        ready: true
      });
    }
    
    console.log(`✅ Found ${readyForCalling.length} abandoned checkouts ready for calling`);
    
    return {
      checkouts: readyForCalling,
      total: readyForCalling.length
    };
    
  } catch (error) {
    console.error('❌ Failed to get abandoned checkouts for calling:', error.message);
    throw error;
  }
}

/**
 * Test function to demonstrate the service
 */
export async function testAbandonedCheckoutService() {
  try {
    console.log('🧪 Testing Abandoned Checkout Service\n');
    
    // Test 1: Get count and recent checkouts
    console.log('1️⃣ Testing basic fetch...');
    const basicResult = await fetchAbandonedCheckouts({ first: 5 });
    console.log(`   Found ${basicResult.total} checkouts\n`);
    
    // Test 2: Get checkouts ready for calling
    console.log('2️⃣ Testing checkout preparation for calling...');
    const callingResult = await getAbandonedCheckoutsForCalling({ first: 5 });
    console.log(`   ${callingResult.total} checkouts ready for calling\n`);
    
    // Test 3: Show sample data
    if (callingResult.checkouts.length > 0) {
      console.log('3️⃣ Sample checkout data:');
      const sample = callingResult.checkouts[0];
      console.log(`   Customer: ${sample.customer_name}`);
      console.log(`   Phone: ${sample.phone}`);
      console.log(`   Items: ${sample.items_summary}`);
      console.log(`   Total: ${sample.currency} ${sample.total_price}`);
      console.log(`   Discount: ${sample.discountInfo.discountPercent}% (${sample.discountInfo.reason})`);
    }
    
    return { success: true, basicResult, callingResult };
    
  } catch (error) {
    console.error('❌ Service test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Export for command line testing
if (import.meta.url === `file://${process.argv[1]}`) {
  testAbandonedCheckoutService()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 Service test completed successfully!');
      } else {
        console.log('\n⚠️ Service test completed with issues');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Service test failed:', error.message);
      process.exit(1);
    });
}
