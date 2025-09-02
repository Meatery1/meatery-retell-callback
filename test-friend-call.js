#!/usr/bin/env node

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Your real abandoned checkout data (same as before)
const YOUR_CHECKOUT_DATA = {
  checkoutId: '37329230495960',
  phone: '16194587071', // This will be overridden
  customerName: 'Jimmy',
  itemsSummary: '1x SavedBy Package Protection ($2.97), 1x Japanese A5 Wagyu Ribeye',
  totalPrice: 153.78,
  currency: 'USD',
  email: 'nickyfiorentino@gmail.com'
};

// Grace's agent ID
const GRACE_AGENT_ID = 'agent_e2636fcbe1c89a7f6bd0731e11';

/**
 * Test call using your real abandoned checkout data but with a different phone number
 */
async function testFriendCall(friendPhoneNumber) {
  try {
    console.log('🧪 Testing Grace agent call with YOUR real abandoned checkout data');
    console.log('==================================================================\n');
    
    console.log('📋 Checkout Details:');
    console.log(`   Customer: ${YOUR_CHECKOUT_DATA.customerName}`);
    console.log(`   Phone: ${friendPhoneNumber} (friend's number)`);
    console.log(`   Items: ${YOUR_CHECKOUT_DATA.itemsSummary}`);
    console.log(`   Total: ${YOUR_CHECKOUT_DATA.currency} ${YOUR_CHECKOUT_DATA.totalPrice}`);
    console.log(`   Email: ${YOUR_CHECKOUT_DATA.email}\n`);
    
    // Format phone number correctly - just add the + prefix
    const toNumber = `+${friendPhoneNumber}`;
    
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
        customer_phone: friendPhoneNumber, // Use friend's number
        customer_email: YOUR_CHECKOUT_DATA.email,
        is_abandoned_checkout: 'true',
        test_pronunciation: 'true'
      },
      
      metadata: {
        source: 'test_pronunciation_improvements_friend',
        checkout_id: YOUR_CHECKOUT_DATA.checkoutId,
        customer_phone: friendPhoneNumber,
        customer_name: YOUR_CHECKOUT_DATA.customerName,
        items_summary: YOUR_CHECKOUT_DATA.itemsSummary,
        total_price: String(YOUR_CHECKOUT_DATA.totalPrice),
        currency: YOUR_CHECKOUT_DATA.currency,
        customer_email: YOUR_CHECKOUT_DATA.email,
        test_type: 'pronunciation_improvements_friend'
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
    console.log('   ✅ Dynamic variables working correctly');
    console.log('\n📞 Grace should be calling your friend shortly!');
    
    return { success: true, call_id: call.call_id, call_status: call.call_status };
    
  } catch (error) {
    console.error('❌ Failed to place test call:', error.message);
    throw error;
  }
}

// Get phone number from command line argument
const friendPhoneNumber = process.argv[2];

if (!friendPhoneNumber) {
  console.log('Usage: node test-friend-call.js <phone_number>');
  console.log('Example: node test-friend-call.js 15551234567');
  process.exit(1);
}

// Run the test
testFriendCall(friendPhoneNumber)
  .then(result => {
    console.log('\n✅ Test call successful!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test call failed:', error.message);
    process.exit(1);
  });
