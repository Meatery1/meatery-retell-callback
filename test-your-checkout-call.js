import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Your real abandoned checkout data
const YOUR_CHECKOUT_DATA = {
  checkoutId: '37329230495960',
  phone: '16194587071',
  customerName: 'Nick',
  itemsSummary: '1x SavedBy Package Protection ($2.97), 1x Japanese A5 Wagyu Ribeye',
  totalPrice: 153.78,
  currency: 'USD',
  email: 'nickyfiorentino@gmail.com'
};

// Grace's agent ID - using the original one that should have the working prompt
const GRACE_AGENT_ID = 'agent_e2636fcbe1c89a7f6bd0731e11';

/**
 * Test call using your real abandoned checkout data
 */
async function testYourCheckoutCall() {
  try {
    console.log('🧪 Testing Grace agent call with YOUR real abandoned checkout data');
    console.log('==================================================================\n');
    
    console.log('📋 Checkout Details:');
    console.log(`   Customer: ${YOUR_CHECKOUT_DATA.customerName}`);
    console.log(`   Phone: ${YOUR_CHECKOUT_DATA.phone}`);
    console.log(`   Items: ${YOUR_CHECKOUT_DATA.itemsSummary}`);
    console.log(`   Total: ${YOUR_CHECKOUT_DATA.currency} ${YOUR_CHECKOUT_DATA.totalPrice}`);
    console.log(`   Email: ${YOUR_CHECKOUT_DATA.email}\n`);
    
    // Format phone number correctly - just add the + prefix
    const toNumber = `+${YOUR_CHECKOUT_DATA.phone}`;
    
    console.log(`📞 Placing call from Grace to: ${toNumber}`);
    console.log('This will test the new pronunciation improvements!\n');
    
    const call = await retell.call.createPhoneCall({
      from_number: '+16198212984',
      to_number: toNumber,
      override_agent_id: GRACE_AGENT_ID,
      
      // Dynamic variables for Grace to use during the call
      retell_llm_dynamic_variables: {
        call_direction: 'OUTBOUND',
        customer_name: YOUR_CHECKOUT_DATA.customerName,
        items_summary: YOUR_CHECKOUT_DATA.itemsSummary,
        total_price: String(YOUR_CHECKOUT_DATA.totalPrice),
        currency: YOUR_CHECKOUT_DATA.currency,
        checkout_id: YOUR_CHECKOUT_DATA.checkoutId,
        customer_phone: YOUR_CHECKOUT_DATA.phone,
        customer_email: YOUR_CHECKOUT_DATA.email,
        is_abandoned_checkout: 'true',
        test_pronunciation: 'true'
      },
      
      metadata: {
        source: 'test_pronunciation_improvements',
        checkout_id: YOUR_CHECKOUT_DATA.checkoutId,
        customer_phone: YOUR_CHECKOUT_DATA.phone,
        customer_name: YOUR_CHECKOUT_DATA.customerName,
        items_summary: YOUR_CHECKOUT_DATA.itemsSummary,
        total_price: String(YOUR_CHECKOUT_DATA.totalPrice),
        currency: YOUR_CHECKOUT_DATA.currency,
        customer_email: YOUR_CHECKOUT_DATA.email,
        test_type: 'pronunciation_improvements'
      }
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log(`Call ID: ${call.call_id}`);
    console.log(`Status: ${call.call_status}\n`);
    
    console.log('🎯 This call will test:');
    console.log('   ✅ "The Meatery" → "mee-tuh-ree" pronunciation');
    console.log('   ✅ "Wagyu" → "wah-gyoo" pronunciation');
    console.log('   ✅ "Picanha" → "pee-kahn-yah" pronunciation');
    console.log('   ✅ All other meat-related terms');
    console.log('\n📞 Grace should be calling you shortly!');
    
    return { success: true, call_id: call.call_id, call_status: call.call_status };
    
  } catch (error) {
    console.error('❌ Failed to place test call:', error.message);
    throw error;
  }
}

// Run the test
testYourCheckoutCall()
  .then(result => {
    console.log('\n✅ Test call successful!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test call failed:', error.message);
    process.exit(1);
  });
