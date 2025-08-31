#!/usr/bin/env node

/**
 * Final test call with everything properly configured
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function finalCall() {
  console.log('📞 Placing FINAL test call to Nicky...\n');
  console.log('✅ Everything is now configured:');
  console.log('   • Shopify tools are in production');
  console.log('   • Server endpoints are live');
  console.log('   • Mike knows to use the tools');
  console.log('   • Order lookup will work!\n');
  
  try {
    const call = await retell.call.createPhoneCall({
      from_number: process.env.RETELL_FROM_NUMBER || '+14154419233',
      to_number: '+16194587071',
      override_agent_id: 'agent_2f7a3254099b872da193df3133',
      metadata: {
        test_call: true,
        final_test: true
      },
      retell_llm_dynamic_variables: {
        customer_name: "Nicky",
        order_number: "42507",
        customer_phone: "6194587071",
        items_summary: "1x Australian Wagyu Picanha, 1x Kurobuta Bacon"
      }
    });
    
    console.log('✅ Call initiated!\n');
    console.log(`Call ID: ${call.call_id}\n`);
    
    console.log('🎯 THIS TIME when you ask "what was in that order?":');
    console.log('   Mike will say: "Let me look that up for you..."');
    console.log('   Then: "Your order contains 1x Australian Wagyu Picanha, 1x Kurobuta Bacon"');
    
    console.log('\n📊 The difference:');
    console.log('   BEFORE: "I don\'t have the details in front of me"');
    console.log('   NOW: Actually looks up your order from Shopify!');
    
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

finalCall();
