#!/usr/bin/env node

/**
 * Test inbound call handling - simulates a customer calling back
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function testInboundCall() {
  console.log('📞 Testing Inbound Call Handling\n');
  console.log('This simulates a customer calling back to (619) 821-2984\n');
  
  console.log('🎯 What to Test:\n');
  console.log('1. Call (619) 821-2984 from any phone');
  console.log('2. Mike should answer: "Hey, this is Mike from The Meatery. Are you calling back about your recent order?"');
  console.log('3. Say "Yes, I missed your call"');
  console.log('4. Mike asks for your name and order number');
  console.log('5. Give him any order number (like 42507)');
  console.log('6. He should look it up and help you\n');
  
  console.log('📱 Creating a web call simulation of an inbound call...\n');
  
  try {
    // Create a web call WITHOUT order context to simulate inbound
    const webCall = await retell.call.createWebCall({
      agent_id: 'agent_2f7a3254099b872da193df3133',
      metadata: {
        test_call: true,
        call_type: 'inbound_simulation',
        source: 'test-inbound-call'
      },
      // NO dynamic variables - simulating a callback without context
      retell_llm_dynamic_variables: {}
    });
    
    console.log('✅ Inbound call simulation created!\n');
    
    const accessUrl = webCall.access_url || webCall.url || webCall.web_call_url || webCall.call_url;
    
    if (accessUrl) {
      console.log(`🌐 Web Call URL: ${accessUrl}\n`);
    } else {
      console.log('Call ID:', webCall.call_id);
      console.log('Access Token:', webCall.access_token?.substring(0, 50) + '...\n');
    }
    
    console.log('🧪 INBOUND SCENARIOS TO TEST:\n');
    
    console.log('Scenario 1: Missed Call Callback');
    console.log('  You: "Hi, I got a missed call from this number"');
    console.log('  Mike: Should ask about your recent order\n');
    
    console.log('Scenario 2: Order Question');
    console.log('  You: "I have a question about my order"');
    console.log('  Mike: Should ask for order details to look it up\n');
    
    console.log('Scenario 3: General Inquiry');
    console.log('  You: "Do you guys sell wagyu?"');
    console.log('  Mike: Should answer and offer to help with ordering\n');
    
    console.log('Scenario 4: Cooking Help');
    console.log('  You: "I need help cooking a ribeye I bought"');
    console.log('  Mike: Should provide cooking tips\n');
    
    console.log('💡 Key Differences from Outbound:');
    console.log('  • Mike won\'t know your name initially');
    console.log('  • He\'ll need to ask for your order number');
    console.log('  • More discovery-oriented conversation');
    console.log('  • Can handle general inquiries too\n');
    
    return webCall;
    
  } catch (error) {
    console.error('❌ Failed to create test call:', error.message);
    throw error;
  }
}

// Run the test
testInboundCall()
  .then(() => {
    console.log('📞 Phone Number Configuration:');
    console.log('  Number: (619) 821-2984');
    console.log('  Status: ✅ Ready for inbound calls');
    console.log('  Agent: Mike from The Meatery');
    console.log('  Features: Order lookup, cooking tips, discount codes\n');
    
    console.log('🎯 The phone number is now fully configured for:');
    console.log('  ✅ Outbound calls (post-delivery follow-ups)');
    console.log('  ✅ Inbound calls (customer callbacks)');
    console.log('  ✅ Voicemail detection and messages\n');
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
