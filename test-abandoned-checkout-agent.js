import { placeAbandonedCheckoutCall } from './place-abandoned-checkout-call.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAbandonedCheckoutAgent() {
  console.log('🧪 Testing Abandoned Checkout Recovery Agent (Grace)\n');
  
  const testData = {
    checkoutId: 'test-checkout-12345',
    phone: '6194587071',
    customerName: 'Test Customer',
    itemsSummary: '2x Wagyu Ribeye, 1x Kurobuta Bacon',
    totalPrice: 189.99,
    currency: 'USD',
    email: 'test@example.com'
  };
  
  console.log('📋 Test Data:');
  console.log(`   Checkout ID: ${testData.checkoutId}`);
  console.log(`   Phone: ${testData.phone}`);
  console.log(`   Customer: ${testData.customerName}`);
  console.log(`   Items: ${testData.itemsSummary}`);
  console.log(`   Total: ${testData.currency} ${testData.totalPrice}`);
  console.log(`   Email: ${testData.email}\n`);
  
  console.log('🎯 Expected Behavior:');
  console.log('1. Grace waits for customer to say hello');
  console.log('2. Grace says: "Hey Test Customer, it\'s Grace from The Meatery. I noticed you were looking at 2x Wagyu Ribeye, 1x Kurobuta Bacon on our site earlier - did you have any questions about those cuts?"');
  console.log('3. Grace can handle price concerns with strategic discounting');
  console.log('4. Grace can question website difficulties subliminally');
  console.log('5. Grace can send recovery cart links with discounts\n');
  
  try {
    console.log('📞 Placing test call...\n');
    
    const result = await placeAbandonedCheckoutCall(testData);
    
    if (result.skipped) {
      console.log('⚠️ Call skipped:', result.reason);
      console.log('   This is expected if the customer has recent successful orders');
    } else if (result.success) {
      console.log('✅ Test call successful!');
      console.log(`   Call ID: ${result.call_id}`);
      console.log(`   Status: ${result.call_status}\n`);
      
      console.log('💡 To monitor this call:');
      console.log(`   node analyze-single-call.js ${result.call_id}`);
      
      console.log('\n🎯 What to listen for:');
      console.log('   ✅ Grace introduces herself (not Nick)');
      console.log('   ✅ References their specific cart items');
      console.log('   ✅ Asks if they had questions about the cuts');
      console.log('   ✅ Can handle price objections with discounts');
      console.log('   ✅ Can question website difficulties strategically');
    }
    
  } catch (error) {
    console.error('❌ Test call failed:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('   1. Check RETELL_API_KEY environment variable');
    console.error('   2. Verify the agent ID is correct');
    console.error('   3. Ensure calling window is open');
    console.error('   4. Check phone number format');
  }
}

// Run the test
testAbandonedCheckoutAgent()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
