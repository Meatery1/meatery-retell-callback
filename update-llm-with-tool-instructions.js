#!/usr/bin/env node

/**
 * Update the Retell LLM prompt to include instructions about using Shopify tools
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function updatePrompt() {
  console.log('📝 Updating LLM prompt with tool instructions...\n');
  
  // Get current LLM
  const llm = await retell.llm.retrieve('llm_7eed186989d2fba11fa1f9395bc7');
  
  // Add tool instructions to the beginning of the prompt
  const toolInstructions = `## IMPORTANT: You have Shopify tools available!

When customer asks "what was in my order" or similar:
- Use the 'get_order_details' tool with order_number parameter
- This will return the actual items from their Shopify order
- Say something like "Let me look that up for you..." while the tool executes

Available tools you can use:
1. get_order_details - Look up what's in an order
2. send_discount_code - Send SMS discount codes
3. save_customer_feedback - Save feedback to Shopify
4. request_replacement - Flag orders for replacement

CRITICAL: When asked about order contents, ALWAYS use get_order_details instead of saying "I don't have the details."

`;

  const updatedPrompt = toolInstructions + llm.general_prompt;
  
  // Update the LLM
  await retell.llm.update('llm_7eed186989d2fba11fa1f9395bc7', {
    general_prompt: updatedPrompt
  });
  
  console.log('✅ Prompt updated with tool instructions!');
  console.log('\nMike will now:');
  console.log('  • Use tools when customers ask about orders');
  console.log('  • Say "Let me look that up" while tools execute');
  console.log('  • Actually retrieve order contents from Shopify');
  
  // Save backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`./backups/prompt-with-tools-${timestamp}.txt`, updatedPrompt);
  console.log(`\n📁 Backup saved to: ./backups/prompt-with-tools-${timestamp}.txt`);
}

updatePrompt().catch(console.error);
