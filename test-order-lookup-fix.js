#!/usr/bin/env node

/**
 * Test the order lookup fix - agent should now properly respond after tool execution
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function testOrderLookupFix() {
  console.log('🧪 Testing Order Lookup Fix\n');
  console.log('📋 This test will verify the agent properly handles "What was in my order?" requests\n');
  
  console.log('🔧 Fix Applied:');
  console.log('   ✅ Added explicit tool response handling instructions');
  console.log('   ✅ Agent MUST continue talking after tool returns');
  console.log('   ✅ Clear example flow provided in prompt\n');
  
  console.log('📞 Creating test web call...\n');
  
  try {
    // Create a test web call with order context
    const webCall = await retell.call.createWebCall({
      agent_id: 'agent_2f7a3254099b872da193df3133',
      metadata: {
        test_call: true,
        test_purpose: 'order_lookup_fix_verification',
        source: 'test-order-lookup-fix'
      },
      retell_llm_dynamic_variables: {
        customer_name: "Test Customer",
        order_number: "42402",  // Order that exists in system
        customer_phone: "6194587071"
      }
    });
    
    console.log('✅ Test web call created successfully!\n');
    
    // The URL might be in different properties depending on the response
    const accessUrl = webCall.access_url || webCall.url || webCall.web_call_url || webCall.call_url;
    
    if (accessUrl) {
      console.log(`📱 Access URL: ${accessUrl}\n`);
    } else {
      console.log('Web call object:', JSON.stringify(webCall, null, 2));
    }
    
    console.log('🧪 TEST SCENARIOS TO VERIFY:\n');
    console.log('1️⃣  Say: "What was in my order?"');
    console.log('   ✅ EXPECTED: Agent says "Let me look that up..." then lists the items');
    console.log('   ❌ PREVIOUS BUG: Agent would hang up after "One moment"\n');
    
    console.log('2️⃣  Say: "Remind me what I ordered"');
    console.log('   ✅ EXPECTED: Agent retrieves and shares order details');
    console.log('   ❌ PREVIOUS BUG: Call would disconnect due to inactivity\n');
    
    console.log('3️⃣  Say: "I forgot what was in that order"');
    console.log('   ✅ EXPECTED: Agent uses tool and continues conversation');
    console.log('   ❌ PREVIOUS BUG: Tool would execute but agent goes silent\n');
    
    console.log('📊 WHAT SUCCESS LOOKS LIKE:');
    console.log('   • Agent says "Let me look that up for you..."');
    console.log('   • Brief pause while tool executes');
    console.log('   • Agent lists the order items conversationally');
    console.log('   • Agent asks if you need anything else');
    console.log('   • Call continues normally\n');
    
    console.log('💡 The fix ensures the agent MUST continue speaking after any tool execution.');
    console.log('   This prevents the "inactivity" disconnection issue.\n');
    
    return webCall;
    
  } catch (error) {
    console.error('❌ Failed to create test call:', error.message);
    
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    
    throw error;
  }
}

// Run the test
testOrderLookupFix()
  .then(() => {
    console.log('🎯 Test call created! Please test the scenarios above to verify the fix.\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
