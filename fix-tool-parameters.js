#!/usr/bin/env node

/**
 * Fix the tool parameter definitions so Retell knows how to pass them
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function fixTools() {
  console.log('🔧 Fixing tool parameter definitions...\n');
  
  const serverUrl = process.env.PUBLIC_BASE_URL;
  
  // Properly formatted tools with parameter schemas
  const fixedTools = [
    {
      type: "custom",
      name: "get_order_details",
      description: "Look up what items are in a specific order when customer asks about order contents",
      speak_after_execution: false,
      speak_during_execution: true,
      url: `${serverUrl}/flow/order-context`,
      parameters: {
        type: "object",
        properties: {
          order_number: { 
            type: "string", 
            description: "The order number from dynamic variables" 
          }
        },
        required: ["order_number"]
      }
    },
    {
      type: "custom",
      name: "send_discount_code",
      description: "Send a discount code to customer via SMS",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/tools/send-discount`,
      parameters: {
        type: "object",
        properties: {
          customer_phone: { type: "string", description: "Phone number to send SMS to" },
          customer_name: { type: "string", description: "Customer name" },
          discount_value: { type: "number", description: "Discount percentage (10 or 15)" },
          order_number: { type: "string", description: "Related order number" },
          reason: { type: "string", description: "Reason for discount" }
        },
        required: ["customer_phone", "customer_name", "discount_value"]
      }
    },
    {
      type: "custom",
      name: "save_customer_feedback",
      description: "Save customer satisfaction and feedback to Shopify order",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/flow/capture-feedback`,
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string", description: "Order to update" },
          satisfied_score: { type: "number", description: "Satisfaction 1-10" },
          had_issue: { type: "boolean", description: "Whether there was an issue" },
          issue_notes: { type: "string", description: "Issue details" }
        },
        required: ["order_number"]
      }
    },
    {
      type: "custom",
      name: "request_replacement",
      description: "Flag order for replacement when customer reports damaged items",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/flow/request-replacement`,
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string", description: "Order number" },
          item_title: { type: "string", description: "Item to replace" },
          quantity: { type: "number", description: "Quantity to replace" },
          reason: { type: "string", description: "Reason for replacement" }
        },
        required: ["order_number", "reason"]
      }
    },
    {
      type: "end_call",
      name: "hang_up",
      description: "End the call"
    }
  ];
  
  // Update the LLM with fixed tools
  console.log('Updating LLM with properly formatted tools...');
  await retell.llm.update('llm_7eed186989d2fba11fa1f9395bc7', {
    general_tools: fixedTools
  });
  
  console.log('✅ Tools fixed with proper parameter definitions!');
  
  // Also update the prompt to be clearer
  const llm = await retell.llm.retrieve('llm_7eed186989d2fba11fa1f9395bc7');
  
  const improvedPrompt = llm.general_prompt.replace(
    'When customer asks "what was in my order" or similar:',
    `When customer asks "what was in my order" or "remind me what I ordered":
IMPORTANT: Use the get_order_details tool!
- Pass the order_number from dynamic variables (available as: {{order_number}})
- The tool will return the actual items
- While it runs, say: "Let me look that up for you..."
- Then tell them what the tool returns

Example:
Customer: "What was in that order?"
You: "Let me look that up for you..." [CALL get_order_details with order_number: "42507"]
[Tool returns: "1x Wagyu, 1x Bacon"]
You: "Your order contains 1x Australian Wagyu Picanha and 1x Kurobuta Bacon."

When customer asks about order:`
  );
  
  await retell.llm.update('llm_7eed186989d2fba11fa1f9395bc7', {
    general_prompt: improvedPrompt
  });
  
  console.log('✅ Prompt also updated with clearer instructions!');
  console.log('\n📝 Tools now have:');
  console.log('   • Proper parameter schemas');
  console.log('   • Required fields defined');
  console.log('   • Clear descriptions');
  console.log('   • Better prompt instructions');
}

fixTools().catch(console.error);
