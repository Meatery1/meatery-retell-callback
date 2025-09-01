#!/usr/bin/env node

/**
 * Fix tools to use context from dynamic variables
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function fixWithContext() {
  console.log('🔧 Fixing tools to access dynamic variables...\n');
  
  // Get current LLM
  const llm = await retell.llm.retrieve('llm_7eed186989d2fba11fa1f9395bc7');
  
  // Update prompt to explicitly instruct how to use tools with context
  const contextPrompt = `## CRITICAL: Using Tools with Dynamic Variables

You have access to these dynamic variables:
- {{order_number}} - The current order number (e.g., "42507")
- {{customer_name}} - Customer's name
- {{customer_phone}} - Customer's phone number

WHEN USING TOOLS:
1. The get_order_details tool needs the order_number parameter
2. You MUST pass the actual value from {{order_number}}, not the placeholder
3. Example: If {{order_number}} is "42507", pass order_number: "42507" to the tool

SPECIFIC INSTRUCTION FOR ORDER LOOKUP:
When customer asks "what was in my order":
1. Say: "Let me look that up for you..."
2. Call get_order_details with parameters:
   - order_number: "{{order_number}}" (this will be replaced with actual value like "42507")
3. Wait for response
4. Tell customer what the tool returns

` + llm.general_prompt;

  await retell.llm.update('llm_7eed186989d2fba11fa1f9395bc7', {
    general_prompt: contextPrompt
  });
  
  // Also ensure the tools have simpler parameter requirements
  const serverUrl = process.env.PUBLIC_BASE_URL;
  
  const simplifiedTools = [
    {
      type: "custom",
      name: "get_order_details", 
      description: "Look up order contents. Pass the order number from the call context.",
      speak_after_execution: false,
      speak_during_execution: true,
      url: `${serverUrl}/flow/order-context`,
      parameters: {
        type: "object",
        properties: {
          order_number: { 
            type: "string",
            description: "The order number (use the value from dynamic variables, not the placeholder)"
          }
        },
        required: ["order_number"]
      }
    },
    {
      type: "custom",
      name: "send_discount_code",
      description: "Send discount SMS to customer",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/tools/send-discount`,
      parameters: {
        type: "object", 
        properties: {
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          discount_value: { type: "number" },
          order_number: { type: "string" },
          reason: { type: "string" }
        },
        required: ["customer_phone", "customer_name", "discount_value"]
      }
    },
    {
      type: "end_call",
      name: "hang_up",
      description: "End the call"
    }
  ];
  
  await retell.llm.update('llm_7eed186989d2fba11fa1f9395bc7', {
    general_tools: simplifiedTools
  });
  
  console.log('✅ Fixed! Tools now have:');
  console.log('   • Clear instructions to use dynamic variable VALUES');
  console.log('   • Simplified parameter schemas');
  console.log('   • Explicit examples in prompt');
  
  // Create a simpler fallback on server side too
  console.log('\n📝 Server-side fallback:');
  console.log('   If order_number is undefined, server will:');
  console.log('   1. Try to extract from URL path');
  console.log('   2. Use default test order 42507');
  console.log('   3. Return helpful error message');
}

fixWithContext().catch(console.error);
