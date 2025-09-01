#!/usr/bin/env node

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function checkTools() {
  console.log('🔍 Checking PRODUCTION Retell Configuration\n');
  console.log('='.repeat(50));
  
  // Get the LLM
  const llm = await retell.llm.retrieve('llm_7eed186989d2fba11fa1f9395bc7');
  
  console.log('\n📋 LLM Details:');
  console.log(`   ID: ${llm.llm_id}`);
  console.log(`   Model: ${llm.model}`);
  console.log(`   Last Modified: ${new Date(llm.last_modification_timestamp).toISOString()}`);
  
  console.log('\n🔧 TOOLS CONFIGURED IN PRODUCTION:');
  const tools = llm.general_tools || [];
  console.log(`   Total Tools: ${tools.length}`);
  
  if (tools.length > 0) {
    console.log('\n   Shopify Tools:');
    tools.filter(t => t.type === 'custom').forEach(tool => {
      console.log(`   ✅ ${tool.name}`);
      console.log(`      → ${tool.url || 'No URL'}`);
    });
    
    console.log('\n   Built-in Tools:');
    tools.filter(t => t.type !== 'custom').forEach(tool => {
      console.log(`   • ${tool.name} (${tool.type})`);
    });
  } else {
    console.log('   ❌ NO TOOLS CONFIGURED!');
  }
  
  // Check the agent too
  console.log('\n👤 Agent Configuration:');
  const agent = await retell.agent.retrieve('agent_2f7a3254099b872da193df3133');
  console.log(`   Name: ${agent.agent_name}`);
  console.log(`   Using LLM: ${agent.response_engine.llm_id}`);
  console.log(`   LLM Version: ${agent.response_engine.version}`);
  console.log(`   Webhook URL: ${agent.webhook_url}`);
  
  console.log('\n='.repeat(50));
  
  if (tools.length > 0) {
    console.log('\n✅ PRODUCTION STATUS: Tools are LIVE!');
    console.log('   Nick can now:');
    console.log('   • Look up order details');
    console.log('   • Check customer history');
    console.log('   • Send discount codes');
    console.log('   • Save feedback to Shopify');
    console.log('   • Request replacements');
  } else {
    console.log('\n❌ PRODUCTION STATUS: Tools NOT configured!');
    console.log('   Run: node setup-shopify-retell.js');
  }
}

checkTools().catch(console.error);
