#!/usr/bin/env node
/**
 * Create Core Prompts for Knowledge Base Mode
 * 
 * This script creates lean, focused core prompts for each agent
 * by extracting only essential behaviors and removing improvements.
 * 
 * Core prompts should contain:
 * - Agent identity and role
 * - Core mission
 * - Essential behaviors
 * - Critical safety rules
 * - Tool descriptions
 * 
 * Everything else goes in the knowledge base.
 */

import Retell from 'retell-sdk';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { discoverAgentsFromAPI } from '../retell-config.js';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CORE_PROMPTS_DIR = './core-prompts';
const MAX_CORE_PROMPT_TOKENS = 3000;

/**
 * Use AI to extract core essence from current prompt
 */
async function extractCorePrompt(currentPrompt, agentName) {
  console.log(`🤖 Extracting core prompt for ${agentName}...`);
  
  const extractionPrompt = `
You are an expert at distilling agent prompts to their core essence.

Given this agent prompt, extract ONLY the essential core elements:
1. Identity (who is the agent)
2. Core Mission (what's their primary purpose)
3. Essential Behaviors (fundamental personality/approach)
4. Critical Safety Rules (DNC, legal requirements, etc.)
5. Tool descriptions (what tools they can use)

Remove ALL:
- Specific edge case handling
- Fringe scenarios
- Detailed objection responses
- One-off situations
- Historical improvements

Keep it under ${MAX_CORE_PROMPT_TOKENS} tokens.

CURRENT PROMPT:
${currentPrompt}

Extract and rewrite as a clean, lean core prompt:
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { 
        role: 'system', 
        content: 'You are an expert at creating lean, focused agent prompts that contain only essential information.' 
      },
      { role: 'user', content: extractionPrompt }
    ],
    temperature: 0.3,
    max_tokens: MAX_CORE_PROMPT_TOKENS
  });

  return response.choices[0].message.content;
}

/**
 * Generate core prompt template
 */
function generateCorePromptTemplate(agentName, agentType) {
  const templates = {
    abandoned_checkout: `
You are Grace, an abandoned checkout recovery specialist for The Meatery.

IDENTITY:
You represent The Meatery, a premium meat delivery service. You are friendly, 
conversational, and genuinely helpful - never pushy or salesy.

CORE MISSION:
Reach out to customers who left items in their cart to:
1. Understand why they didn't complete checkout
2. Address any concerns or questions
3. Offer assistance to complete their order
4. Provide incentives when appropriate

ESSENTIAL BEHAVIORS:
- Be warm and conversational, like talking to a friend
- Ask before assuming (don't guess why they left)
- Listen actively to objections and concerns
- Offer a 10% discount code when it feels natural
- Never be pushy - respect their decision

CRITICAL SAFETY RULES:
- Always check if phone is on DNC list (use get_dnc tool)
- Maximum 3 call attempts per customer
- Respect voicemail - leave brief message and stop
- Follow discount policy: 10% standard, up to 15% for serious issues
- Never share customer data between calls

TOOLS AVAILABLE:
- get_order_details: Fetch order information
- lookup_customer_history: See past orders
- send_discount_code: Send SMS with discount
- save_customer_feedback: Record satisfaction
- get_dnc: Check do-not-call status

For specific scenarios, edge cases, and fringe situations, relevant information 
will be retrieved from your knowledge base automatically.
`,
    
    post_delivery: `
You are Nick, a post-delivery confirmation specialist for The Meatery.

IDENTITY:
You represent The Meatery, checking in after orders are delivered to ensure 
customer satisfaction and address any issues.

CORE MISSION:
After delivery, call customers to:
1. Confirm they received their order
2. Ensure they're satisfied with the quality
3. Address any issues immediately
4. Build long-term relationships

ESSENTIAL BEHAVIORS:
- Be friendly and genuinely concerned about their experience
- Listen carefully to any issues
- Take immediate action on problems
- Thank them for their business
- Invite them to order again

CRITICAL SAFETY RULES:
- Always check if phone is on DNC list
- Respect privacy - don't push for details
- Follow refund/replacement policies
- Maximum 2 call attempts

TOOLS AVAILABLE:
- get_order_details: Fetch order information
- save_customer_feedback: Record satisfaction score
- request_replacement: Initiate replacement process
- get_dnc: Check do-not-call status

For specific scenarios and edge cases, relevant information will be retrieved 
from your knowledge base automatically.
`,

    inbound: `
You are Nick, an inbound customer service specialist for The Meatery.

IDENTITY:
You represent The Meatery, helping customers who call in with questions, 
orders, or issues.

CORE MISSION:
Provide excellent customer service by:
1. Understanding their question or issue
2. Providing accurate information
3. Resolving problems efficiently
4. Making the experience pleasant

ESSENTIAL BEHAVIORS:
- Be helpful and solution-oriented
- Listen to understand, not just respond
- Take ownership of issues
- Be patient and professional
- Follow through on promises

CRITICAL SAFETY RULES:
- Verify customer identity for account changes
- Follow refund/replacement policies
- Escalate complex issues appropriately
- Protect customer data

TOOLS AVAILABLE:
- get_order_details: Fetch order information
- lookup_customer_history: See past orders
- save_customer_feedback: Record interactions
- request_replacement: Initiate replacements

For specific scenarios and edge cases, relevant information will be retrieved 
from your knowledge base automatically.
`
  };

  return templates[agentType] || templates.inbound;
}

/**
 * Create core prompt for an agent
 */
async function createCorePromptForAgent(agent, useAI = true) {
  console.log(`\n📝 Creating core prompt for ${agent.name}...`);
  
  try {
    // Get current LLM
    const currentLLM = await retell.llm.retrieve(agent.llmId);
    const currentPrompt = currentLLM.general_prompt;
    
    console.log(`   Current prompt size: ${currentPrompt.length} characters`);
    
    let corePrompt;
    
    if (useAI) {
      // Use AI to extract core
      corePrompt = await extractCorePrompt(currentPrompt, agent.name);
    } else {
      // Use template
      const agentType = agent.function || 'inbound';
      corePrompt = generateCorePromptTemplate(agent.name, agentType);
    }
    
    console.log(`   Core prompt size: ${corePrompt.length} characters`);
    console.log(`   Reduction: ${((1 - corePrompt.length / currentPrompt.length) * 100).toFixed(1)}%`);
    
    // Save core prompt
    await fs.mkdir(CORE_PROMPTS_DIR, { recursive: true });
    const filename = `${agent.agentId}_core_prompt.txt`;
    const filepath = path.join(CORE_PROMPTS_DIR, filename);
    
    await fs.writeFile(filepath, corePrompt);
    console.log(`   ✅ Saved to: ${filepath}`);
    
    return {
      agent_id: agent.agentId,
      agent_name: agent.name,
      llm_id: agent.llmId,
      original_size: currentPrompt.length,
      core_size: corePrompt.length,
      reduction_percent: ((1 - corePrompt.length / currentPrompt.length) * 100).toFixed(1),
      filepath
    };
    
  } catch (error) {
    console.error(`   ❌ Failed to create core prompt:`, error.message);
    return null;
  }
}

/**
 * Apply core prompts to agents
 */
async function applyCorePrompts(dryRun = true) {
  console.log('\n🚀 Applying core prompts to agents...');
  
  if (dryRun) {
    console.log('   (DRY RUN - no changes will be made)');
  }
  
  try {
    // Read all core prompt files
    const files = await fs.readdir(CORE_PROMPTS_DIR);
    const corePromptFiles = files.filter(f => f.endsWith('_core_prompt.txt'));
    
    console.log(`   Found ${corePromptFiles.length} core prompts`);
    
    for (const file of corePromptFiles) {
      const agentId = file.replace('_core_prompt.txt', '');
      const corePrompt = await fs.readFile(
        path.join(CORE_PROMPTS_DIR, file),
        'utf8'
      );
      
      console.log(`\n   Agent: ${agentId}`);
      console.log(`   Core prompt: ${corePrompt.length} characters`);
      
      if (!dryRun) {
        // Get current LLM
        const agent = await retell.agent.retrieve(agentId);
        
        // Update LLM with core prompt
        await retell.llm.update(agent.response_engine.llm_id, {
          general_prompt: corePrompt
        });
        
        console.log(`   ✅ Updated LLM`);
      }
    }
    
    console.log('\n✅ Core prompts ready!');
    
    if (dryRun) {
      console.log('\nTo apply for real, run: node create-core-prompts.js --apply');
    }
    
  } catch (error) {
    console.error('❌ Failed to apply core prompts:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const useAI = !args.includes('--template');
  const apply = args.includes('--apply');
  
  console.log('🚀 Core Prompt Creation Tool\n');
  
  if (apply) {
    // Just apply existing core prompts
    await applyCorePrompts(false);
  } else {
    // Create core prompts
    console.log('📋 Discovering agents...');
    const agents = await discoverAgentsFromAPI();
    
    console.log(`Found ${Object.keys(agents).length} agents\n`);
    
    const results = [];
    
    for (const agent of Object.values(agents)) {
      if (agent.llmId) {
        const result = await createCorePromptForAgent(agent, useAI);
        if (result) {
          results.push(result);
        }
      }
    }
    
    // Save summary
    const summaryPath = path.join(CORE_PROMPTS_DIR, 'summary.json');
    await fs.writeFile(
      summaryPath,
      JSON.stringify({
        created_at: new Date().toISOString(),
        method: useAI ? 'ai_extraction' : 'template',
        agents: results
      }, null, 2)
    );
    
    console.log(`\n✅ Created ${results.length} core prompts`);
    console.log(`📊 Summary saved: ${summaryPath}`);
    console.log('\n📝 Next Steps:');
    console.log('   1. Review core prompts in ./core-prompts/');
    console.log('   2. Edit if needed');
    console.log('   3. Run migration: npm run migrate-to-kb');
    console.log('   4. Apply core prompts: node create-core-prompts.js --apply');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

export { createCorePromptForAgent, applyCorePrompts };

