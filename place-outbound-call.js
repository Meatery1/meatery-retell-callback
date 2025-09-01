#!/usr/bin/env node

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function placeOutboundCall(phoneNumber, customerName = null, orderNumber = null) {
  console.log('📞 Placing Outbound Call');
  console.log('========================\n');
  
  // Clean phone number
  const toNumber = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
  
  // Use defaults if not provided
  const name = customerName || 'there';
  const order = orderNumber || '(your recent order)';
  
  console.log(`To: ${toNumber}`);
  console.log(`Customer: ${name}`);
  console.log(`Order: ${order}\n`);
  
  try {
    const call = await retell.call.createPhoneCall({
      from_number: '+16198212984',  // Your Retell number
      to_number: toNumber,
      override_agent_id: 'agent_2f7a3254099b872da193df3133',
      
      // CRITICAL: Pass dynamic variables for the agent to use
      retell_llm_dynamic_variables: {
        customer_name: name,
        order_number: order,
        customer_phone: toNumber.replace('+1', '')  // Store without country code
      },
      
      // Also pass in metadata for the webhook/tools to access
      metadata: {
        customer_phone: toNumber.replace('+1', ''),
        order_number: order,
        customer_name: name,
        source: 'manual_outbound'
      }
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log(`Call ID: ${call.call_id}`);
    console.log(`Status: ${call.call_status}\n`);
    
    console.log('🎯 Expected behavior:');
    console.log('1. Mike waits for customer to say hello');
    console.log(`2. Mike says: "Hey ${name}, it's Mike from The Meatery..."`);
    console.log('3. Mike checks on order and can look up details if asked\n');
    
    console.log('💡 To monitor this call:');
    console.log(`node analyze-single-call.js ${call.call_id}`);
    
    return call;
  } catch (error) {
    console.error('❌ Failed to place call:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Command line usage
if (process.argv.length < 3) {
  console.log('Usage: node place-outbound-call.js <phone> [name] [order_number]');
  console.log('Example: node place-outbound-call.js 6194587071 Nicky 42507');
  process.exit(1);
}

const [,, phone, name, order] = process.argv;
placeOutboundCall(phone, name, order).catch(console.error);
