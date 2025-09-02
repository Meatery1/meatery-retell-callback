import { testSpecificCheckout } from './src/shopify-graphql-queries.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Testing Shopify Abandoned Checkout GraphQL API');
  console.log('================================================\n');
  
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
      console.log('\n🎉 SUCCESS! Your abandoned checkout was found and formatted for calling.');
      console.log('\n📞 Ready to place a call with Grace agent using this data:');
      console.log(`   Checkout ID: ${result.formatted.checkout_id}`);
      console.log(`   Customer: ${result.formatted.customer_name}`);
      console.log(`   Phone: ${result.formatted.phone || 'No phone available'}`);
      console.log(`   Items: ${result.formatted.items_summary}`);
      console.log(`   Total: ${result.formatted.currency} ${result.formatted.total_price}`);
      
      if (!result.formatted.phone) {
        console.log('\n⚠️  WARNING: No phone number found for this customer.');
        console.log('   You may need to use email instead or skip this checkout.');
      }
      
    } else {
      console.log('\n⚠️  Could not fetch your specific checkout, but here are recent ones:');
      if (result.recentCheckouts) {
        console.log(`\n📋 Found ${result.recentCheckouts.total} recent abandoned checkouts`);
        console.log('   You can use any of these for testing instead.');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    process.exit(1);
  }
}

// Run the test
main();
