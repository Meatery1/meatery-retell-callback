#!/usr/bin/env node

/**
 * Quick test script to verify Shopify-Retell integration
 */

import { Retell } from 'retell-sdk';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Use the correct agent and LLM IDs
const AGENT_ID = 'agent_2f7a3254099b872da193df3133';  // Meatery Nick - Confident Male
const LLM_ID = 'llm_7eed186989d2fba11fa1f9395bc7';

async function testIntegration() {
  console.log('🧪 Testing Shopify-Retell Integration\n');
  console.log('=============================================\n');
  
  // Step 1: Verify LLM has Shopify tools
  console.log('1️⃣ Checking LLM configuration...');
  try {
    const llm = await retell.llm.retrieve(LLM_ID);
    const shopifyTools = (llm.general_tools || []).filter(tool => 
      tool.name?.includes('order') || 
      tool.name?.includes('customer') || 
      tool.name?.includes('discount') ||
      tool.name?.includes('replacement')
    );
    
    console.log(`✅ Found ${shopifyTools.length} Shopify tools:`);
    shopifyTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description?.substring(0, 50)}...`);
    });
  } catch (error) {
    console.log(`❌ Failed to check LLM: ${error.message}`);
  }
  
  // Step 2: Get a real order from Shopify
  console.log('\n2️⃣ Fetching a real order from Shopify...');
  let testOrderNumber = '69';  // Default
  let testCustomerName = 'Customer';
  let testItemsSummary = 'Your recent order';
  
  try {
    const ordersUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const ordersResponse = await axios.get(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      params: { limit: 1, status: 'any' }
    });
    
    if (ordersResponse.data.orders.length > 0) {
      const order = ordersResponse.data.orders[0];
      testOrderNumber = String(order.name?.replace('#', '') || order.order_number || '69');
      testCustomerName = order.customer?.first_name || 'Customer';
      
      if (order.line_items && order.line_items.length > 0) {
        testItemsSummary = order.line_items
          .slice(0, 3)
          .map(item => `${item.quantity}x ${item.title}`)
          .join(', ');
      }
      
      console.log(`✅ Found order #${testOrderNumber} for ${testCustomerName}`);
      console.log(`   Items: ${testItemsSummary}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not fetch Shopify order: ${error.message}`);
    console.log('   Using default test values...');
  }
  
  // Step 3: Create a test web call
  console.log('\n3️⃣ Creating test web call...');
  try {
    const webCall = await retell.call.createWebCall({
      agent_id: AGENT_ID,
      metadata: {
        test_call: true,
        source: 'shopify-integration-test',
        order_number: testOrderNumber
      },
      retell_llm_dynamic_variables: {
        customer_name: String(testCustomerName),
        order_number: String(testOrderNumber),
        items_summary: String(testItemsSummary),
        customer_phone: '+15555551234',  // Test phone
        test_mode: 'true'
      }
    });
    
    console.log('✅ Test web call created successfully!\n');
    console.log('=============================================');
    
    // Find the correct URL property
    const accessUrl = webCall.access_url || webCall.url || webCall.web_call_url || webCall.call_url;
    
    if (!accessUrl) {
      console.log('⚠️  Call created but URL not found. Full response:');
      console.log(JSON.stringify(webCall, null, 2));
    } else {
      console.log(`📱 ACCESS URL: ${accessUrl}`);
    }
    
    console.log('=============================================\n');
    
    console.log('🎯 TEST THESE SCENARIOS:');
    console.log(`   1. "What did I order?" → Should mention: ${testItemsSummary}`);
    console.log(`   2. "What's my order number?" → Should say: #${testOrderNumber}`);
    console.log('   3. "My meat arrived thawed" → Should explain it\'s safe');
    console.log('   4. "The meat smells bad" → Should offer refund/replacement');
    console.log('   5. "Can I get a discount?" → Should send SMS (if eligible)');
    console.log('   6. "I need a replacement" → Should flag order');
    
    console.log('\n💡 The agent has access to:');
    console.log('   • get_order_details - Look up order info');
    console.log('   • lookup_customer_orders - See order history');
    console.log('   • save_customer_feedback - Save satisfaction scores');
    console.log('   • send_discount_code - Send SMS discounts');
    console.log('   • check_discount_eligibility - Verify discount eligibility');
    console.log('   • request_replacement - Flag for replacement');
    
    console.log('\n✨ Integration test ready! Click the URL above to start.');
    
  } catch (error) {
    console.log(`❌ Failed to create test call: ${error.response?.data?.error_message || error.message}`);
    
    if (error.response?.data?.error_message?.includes('agent_id')) {
      console.log('\n⚠️  Agent ID issue detected. Trying to fix...');
      console.log(`   Current RETELL_AGENT_ID in .env: ${process.env.RETELL_AGENT_ID}`);
      console.log(`   Correct agent ID should be: ${AGENT_ID}`);
      console.log('\n   Run this to update your .env:');
      console.log(`   echo 'RETELL_AGENT_ID="${AGENT_ID}"' >> .env`);
    }
  }
}

// Run the test
testIntegration().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
