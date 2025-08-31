#!/usr/bin/env node

/**
 * Place a test call to Nicky
 */

import { Retell } from 'retell-sdk';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function callNicky() {
  console.log('📞 Placing call to Nicky at (619) 458-7071...\n');
  
  // Get a real order from Shopify for context
  let orderContext = {
    order_number: "69",
    customer_name: "Nicky",
    items_summary: "2x Ribeye Steak, 1x Ground Beef",
    primary_item: "Ribeye Steak"
  };
  
  try {
    // Try to get a real recent order
    const ordersUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const ordersResponse = await axios.get(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      params: { limit: 1, status: 'any', financial_status: 'paid' }
    });
    
    if (ordersResponse.data.orders.length > 0) {
      const order = ordersResponse.data.orders[0];
      orderContext.order_number = String(order.name?.replace('#', '') || order.order_number || '69');
      
      if (order.line_items && order.line_items.length > 0) {
        orderContext.items_summary = order.line_items
          .slice(0, 3)
          .map(item => `${item.quantity}x ${item.title}`)
          .join(', ');
        orderContext.primary_item = order.line_items[0]?.title || "Ribeye Steak";
      }
    }
  } catch (e) {
    console.log('Using default order context...\n');
  }
  
  try {
    // Place the actual phone call
    const call = await retell.call.createPhoneCall({
      from_number: process.env.RETELL_FROM_NUMBER || '+14154419233',  // Your Retell number
      to_number: '+16194587071',  // Nicky's number
      override_agent_id: 'agent_2f7a3254099b872da193df3133',  // Mike from The Meatery
      metadata: {
        test_call: true,
        customer_name: 'Nicky',
        source: 'manual-test'
      },
      retell_llm_dynamic_variables: {
        customer_name: "Nicky",
        order_number: orderContext.order_number,
        items_summary: orderContext.items_summary,
        primary_item: orderContext.primary_item,
        customer_phone: "6194587071"
      }
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log('📞 Call Details:');
    console.log(`   Call ID: ${call.call_id}`);
    console.log(`   From: ${call.from_number || process.env.RETELL_FROM_NUMBER}`);
    console.log(`   To: Nicky at (619) 458-7071`);
    console.log(`   Agent: Mike from The Meatery`);
    console.log(`   Order Context: #${orderContext.order_number}`);
    console.log(`   Items: ${orderContext.items_summary}`);
    
    console.log('\n🎯 What will happen:');
    console.log('   1. Your phone will ring in a few seconds');
    console.log('   2. Mike will introduce himself from The Meatery');
    console.log(`   3. He'll ask about order #${orderContext.order_number}`);
    console.log('   4. He can access Shopify data if you ask about orders');
    console.log('   5. He can send discount codes via SMS');
    
    console.log('\n💡 Test these with Mike:');
    console.log('   • "What did I order?"');
    console.log('   • "My meat arrived thawed"');
    console.log('   • "Can I get a discount?"');
    console.log('   • "I need a replacement"');
    
  } catch (error) {
    console.log('❌ Failed to place call:', error.response?.data || error.message);
    
    if (error.response?.data?.error === 'invalid_phone_number') {
      console.log('\n⚠️  Phone number format issue. Trying with different format...');
    }
  }
}

// Place the call immediately
callNicky().catch(console.error);
