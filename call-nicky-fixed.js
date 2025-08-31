#!/usr/bin/env node

/**
 * Place a test call to Nicky with fixed integration
 */

import { Retell } from 'retell-sdk';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function waitForDeployment() {
  console.log('⏳ Waiting 30 seconds for Railway deployment...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));
}

async function callNicky() {
  // Wait for deployment
  await waitForDeployment();
  
  console.log('📞 Placing IMPROVED call to Nicky at (619) 458-7071...\n');
  console.log('🔧 Fixed issues:');
  console.log('   ✅ Webhook parsing now handles events properly');
  console.log('   ✅ Order lookup now tries multiple formats');
  console.log('   ✅ Custom tools endpoint supports POST requests');
  console.log('   ✅ Better error handling and logging\n');
  
  // Get a real order from Shopify for context
  let orderContext = {
    order_number: "42507",  // Eric J's order
    customer_name: "Nicky",
    items_summary: "1x Australian Wagyu Picanha, 1x Kurobuta Bacon",
    primary_item: "Australian Wagyu Picanha"
  };
  
  try {
    // Place the actual phone call
    const call = await retell.call.createPhoneCall({
      from_number: process.env.RETELL_FROM_NUMBER || '+14154419233',
      to_number: '+16194587071',  // Nicky's number
      override_agent_id: 'agent_2f7a3254099b872da193df3133',  // Mike from The Meatery
      metadata: {
        test_call: true,
        customer_name: 'Nicky',
        source: 'fixed-integration-test'
      },
      retell_llm_dynamic_variables: {
        customer_name: "Nicky",
        order_number: "42507",  // Pass as string
        items_summary: orderContext.items_summary,
        primary_item: orderContext.primary_item,
        customer_phone: "6194587071"
      }
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log('📞 Call Details:');
    console.log(`   Call ID: ${call.call_id}`);
    console.log(`   To: Nicky at (619) 458-7071`);
    console.log(`   Agent: Mike from The Meatery`);
    console.log(`   Order: #42507 (Eric J's order)`);
    console.log(`   Items: ${orderContext.items_summary}`);
    
    console.log('\n🎯 What should work now:');
    console.log('   ✅ "What was in that order?" → Mike can look it up');
    console.log('   ✅ "My meat arrived thawed" → Proper response');
    console.log('   ✅ "Can I get a discount?" → SMS will be sent');
    console.log('   ✅ "I need a replacement" → Order will be flagged');
    
    console.log('\n📊 Monitor the call:');
    console.log(`   Railway logs: https://railway.app`);
    console.log(`   Call analysis: node analyze-nicky-call.js`);
    
  } catch (error) {
    console.log('❌ Failed to place call:', error.response?.data || error.message);
  }
}

// Place the call
callNicky().catch(console.error);
