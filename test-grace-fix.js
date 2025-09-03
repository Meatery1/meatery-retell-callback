#!/usr/bin/env node
/**
 * Test Grace's updated configuration with a quick call
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

const AGENT_ID = 'agent_e2636fcbe1c89a7f6bd0731e11';

async function testCall() {
  console.log('🚀 Testing Grace with updated configuration...\n');
  
  try {
    // Create a test call
    const call = await retell.call.createPhoneCall({
      from_phone_number: process.env.RETELL_PHONE_NUMBER || '+14156901150',
      to_phone_number: process.env.TEST_PHONE_NUMBER || '+14156901150', // Replace with your test number
      override_agent_id: AGENT_ID,
      metadata: {
        checkout_id: 'test_checkout_123',
        source: 'test_script',
        customer_name: 'Test Customer',
        cart_value: '299.99'
      },
      retell_llm_dynamic_variables: {
        customer_name: 'Sarah',
        items_summary: 'premium wagyu steaks',
        total_price: '299.99',
        customer_email: 'test@example.com'
      }
    });
    
    console.log('✅ Test call initiated!');
    console.log(`   Call ID: ${call.call_id}`);
    console.log(`   Status: ${call.call_status}`);
    console.log('\n📞 Call should now be in progress...');
    console.log('   Grace should:');
    console.log('   - Say "premium wagyu steaks" instead of listing all items');
    console.log('   - Leave only ONE voicemail if it goes to voicemail');
    console.log('   - Not use quotes in her speech');
    console.log('   - Sound more natural and conversational');
    
    // Wait a moment then fetch call details
    console.log('\n⏳ Waiting 30 seconds for call to complete...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Get call details
    const callDetails = await retell.call.retrieve(call.call_id);
    
    console.log('\n📊 Call Results:');
    console.log(`   Duration: ${Math.round((callDetails.end_timestamp - callDetails.start_timestamp) / 1000)}s`);
    console.log(`   Status: ${callDetails.call_status}`);
    console.log(`   Disconnection: ${callDetails.disconnection_reason}`);
    
    if (callDetails.call_analysis) {
      console.log(`   In Voicemail: ${callDetails.call_analysis.in_voicemail}`);
      console.log(`   Call Successful: ${callDetails.call_analysis.call_successful}`);
    }
    
    if (callDetails.transcript) {
      console.log('\n📝 Transcript:');
      const lines = callDetails.transcript.split('\n').slice(0, 10);
      lines.forEach(line => console.log(`   ${line}`));
      if (callDetails.transcript.split('\n').length > 10) {
        console.log('   ... (truncated)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testCall();
