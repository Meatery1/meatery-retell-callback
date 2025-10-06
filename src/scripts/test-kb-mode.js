#!/usr/bin/env node
/**
 * Knowledge Base Mode Testing & Comparison Tool
 * 
 * This script helps test and compare KB mode vs prompt mode
 */

import Retell from 'retell-sdk';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { KnowledgeBaseManager } from '../knowledge-base-manager.js';
import { discoverAgentsFromAPI } from '../retell-config.js';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const kbManager = new KnowledgeBaseManager(retell);

/**
 * Get agent token usage (approximate)
 */
function estimateTokenUsage(text) {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Analyze agent configuration
 */
async function analyzeAgent(agentId, agentName) {
  console.log(`\n📊 Analyzing ${agentName}...`);
  
  try {
    const agent = await retell.agent.retrieve(agentId);
    const llm = await retell.llm.retrieve(agent.response_engine.llm_id);
    
    const analysis = {
      agent_id: agentId,
      agent_name: agentName,
      llm_id: llm.llm_id,
      prompt_length: llm.general_prompt.length,
      prompt_tokens: estimateTokenUsage(llm.general_prompt),
      knowledge_bases: llm.knowledge_base_ids || [],
      has_kb: (llm.knowledge_base_ids || []).length > 0
    };
    
    // Get KB stats if exists
    if (analysis.has_kb) {
      const kbStats = await kbManager.getStatistics(llm.knowledge_base_ids[0]);
      analysis.kb_stats = kbStats;
    }
    
    console.log(`   Prompt: ${analysis.prompt_length} chars (~${analysis.prompt_tokens} tokens)`);
    console.log(`   Knowledge Bases: ${analysis.knowledge_bases.length}`);
    
    if (analysis.kb_stats) {
      console.log(`   KB Documents: ${analysis.kb_stats.total_documents}`);
      console.log(`   KB Size: ${analysis.kb_stats.total_size_chars} chars`);
    }
    
    return analysis;
    
  } catch (error) {
    console.error(`   ❌ Failed to analyze:`, error.message);
    return null;
  }
}

/**
 * Compare costs between modes
 */
function compareCosts(promptTokens, kbDocuments, callsPerDay = 50) {
  // GPT-4o pricing (approximate)
  const costPerInputToken = 0.0025 / 1000; // $2.50 per 1M tokens
  const costPerOutputToken = 0.010 / 1000; // $10.00 per 1M tokens
  
  // Prompt mode: Full prompt on every call
  const promptModeInputTokens = promptTokens;
  const promptModeOutputTokens = 300; // Average response
  const promptModeCostPerCall = 
    (promptModeInputTokens * costPerInputToken) + 
    (promptModeOutputTokens * costPerOutputToken);
  
  // KB mode: Core prompt + retrieval (avg 3 docs per call)
  const kbModeCoreTokens = 600; // Lean core prompt
  const kbModeRetrievalTokens = 500; // 3 docs * ~150 tokens each
  const kbModeOutputTokens = 300;
  const kbModeCostPerCall =
    ((kbModeCoreTokens + kbModeRetrievalTokens) * costPerInputToken) +
    (kbModeOutputTokens * costPerOutputToken);
  
  return {
    prompt_mode: {
      tokens_per_call: promptModeInputTokens + promptModeOutputTokens,
      cost_per_call: promptModeCostPerCall,
      cost_per_day: promptModeCostPerCall * callsPerDay,
      cost_per_month: promptModeCostPerCall * callsPerDay * 30
    },
    kb_mode: {
      tokens_per_call: kbModeCoreTokens + kbModeRetrievalTokens + kbModeOutputTokens,
      cost_per_call: kbModeCostPerCall,
      cost_per_day: kbModeCostPerCall * callsPerDay,
      cost_per_month: kbModeCostPerCall * callsPerDay * 30
    },
    savings: {
      per_call: promptModeCostPerCall - kbModeCostPerCall,
      per_day: (promptModeCostPerCall - kbModeCostPerCall) * callsPerDay,
      per_month: (promptModeCostPerCall - kbModeCostPerCall) * callsPerDay * 30,
      percent: ((1 - kbModeCostPerCall / promptModeCostPerCall) * 100).toFixed(1)
    }
  };
}

/**
 * Test KB retrieval
 */
async function testKBRetrieval(kbId, testQuery) {
  console.log(`\n🧪 Testing KB retrieval for query: "${testQuery}"`);
  
  try {
    const kb = await retell.knowledgeBase.retrieve(kbId);
    
    // Simple keyword matching (Retell does semantic search in production)
    const relevantDocs = kb.text_content.filter(doc => {
      const content = (doc.title + ' ' + doc.body).toLowerCase();
      return testQuery.toLowerCase().split(' ').some(word => 
        content.includes(word.toLowerCase())
      );
    });
    
    console.log(`   Found ${relevantDocs.length} relevant documents:`);
    relevantDocs.slice(0, 3).forEach(doc => {
      console.log(`   - ${doc.title}`);
    });
    
    return relevantDocs;
    
  } catch (error) {
    console.error(`   ❌ Failed to test retrieval:`, error.message);
    return [];
  }
}

/**
 * Generate comparison report
 */
async function generateComparisonReport() {
  console.log('🚀 Knowledge Base Mode Analysis\n');
  
  try {
    // Discover agents
    console.log('📋 Discovering agents...');
    const agents = await discoverAgentsFromAPI();
    
    const analyses = [];
    
    for (const agent of Object.values(agents)) {
      if (agent.llmId) {
        const analysis = await analyzeAgent(agent.agentId, agent.name);
        if (analysis) {
          analyses.push(analysis);
        }
      }
    }
    
    // Calculate totals
    const totalPromptTokens = analyses.reduce((sum, a) => sum + a.prompt_tokens, 0);
    const totalKBDocs = analyses.reduce((sum, a) => sum + (a.kb_stats?.total_documents || 0), 0);
    
    console.log(`\n\n📊 OVERALL ANALYSIS`);
    console.log('=' .repeat(60));
    console.log(`Agents analyzed: ${analyses.length}`);
    console.log(`Total prompt tokens: ${totalPromptTokens.toLocaleString()}`);
    console.log(`Average prompt tokens: ${Math.round(totalPromptTokens / analyses.length).toLocaleString()}`);
    console.log(`Agents with KB: ${analyses.filter(a => a.has_kb).length}`);
    console.log(`Total KB documents: ${totalKBDocs}`);
    
    // Cost comparison
    const avgPromptTokens = Math.round(totalPromptTokens / analyses.length);
    const costComparison = compareCosts(avgPromptTokens, totalKBDocs);
    
    console.log(`\n\n💰 COST COMPARISON (50 calls/day)`);
    console.log('=' .repeat(60));
    console.log(`\nPrompt Mode:`);
    console.log(`   Per call: $${costComparison.prompt_mode.cost_per_call.toFixed(4)}`);
    console.log(`   Per day: $${costComparison.prompt_mode.cost_per_day.toFixed(2)}`);
    console.log(`   Per month: $${costComparison.prompt_mode.cost_per_month.toFixed(2)}`);
    
    console.log(`\nKnowledge Base Mode:`);
    console.log(`   Per call: $${costComparison.kb_mode.cost_per_call.toFixed(4)}`);
    console.log(`   Per day: $${costComparison.kb_mode.cost_per_day.toFixed(2)}`);
    console.log(`   Per month: $${costComparison.kb_mode.cost_per_month.toFixed(2)}`);
    
    console.log(`\n💵 Savings with KB Mode:`);
    console.log(`   Per call: $${costComparison.savings.per_call.toFixed(4)}`);
    console.log(`   Per day: $${costComparison.savings.per_day.toFixed(2)}`);
    console.log(`   Per month: $${costComparison.savings.per_month.toFixed(2)}`);
    console.log(`   Percentage: ${costComparison.savings.percent}%`);
    
    // Recommendations
    console.log(`\n\n💡 RECOMMENDATIONS`);
    console.log('=' .repeat(60));
    
    const avgPromptSize = avgPromptTokens;
    
    if (avgPromptSize > 5000) {
      console.log(`✅ STRONGLY RECOMMENDED: Migrate to KB mode`);
      console.log(`   Your prompts are large (${avgPromptSize} tokens avg)`);
      console.log(`   KB mode will save ~$${costComparison.savings.per_month.toFixed(0)}/month`);
    } else if (avgPromptSize > 3000) {
      console.log(`✅ RECOMMENDED: Consider KB mode for future scalability`);
      console.log(`   Your prompts are moderate (${avgPromptSize} tokens avg)`);
      console.log(`   KB mode prevents future bloat`);
    } else {
      console.log(`ℹ️  OPTIONAL: Current prompts are lean`);
      console.log(`   But KB mode will prevent future bloat as you add improvements`);
    }
    
    // Save report
    const reportPath = './kb-comparison-report.json';
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        generated_at: new Date().toISOString(),
        agents: analyses,
        cost_comparison: costComparison,
        recommendations: avgPromptSize > 5000 ? 'strongly_recommended' : 
                        avgPromptSize > 3000 ? 'recommended' : 'optional'
      }, null, 2)
    );
    
    console.log(`\n📄 Detailed report saved: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

/**
 * Run specific tests
 */
async function runTests() {
  const args = process.argv.slice(2);
  const testType = args[0];
  
  if (testType === 'retrieval' && args[1]) {
    // Test KB retrieval
    const agents = await discoverAgentsFromAPI();
    const firstAgent = Object.values(agents).find(a => a.llmId);
    
    if (firstAgent) {
      const llm = await retell.llm.retrieve(firstAgent.llmId);
      if (llm.knowledge_base_ids && llm.knowledge_base_ids.length > 0) {
        await testKBRetrieval(llm.knowledge_base_ids[0], args[1]);
      } else {
        console.log('❌ No knowledge base found for agent');
      }
    }
  } else {
    // Run full comparison
    await generateComparisonReport();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

export { analyzeAgent, compareCosts, generateComparisonReport };

