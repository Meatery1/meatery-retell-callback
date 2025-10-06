#!/usr/bin/env node
/**
 * Build Grace's First Knowledge Base
 * From historic calls and improvements
 * 
 * Agent: agent_e2636fcbe1c89a7f6bd0731e11
 * Name: Grace - Abandoned Checkout Recovery Specialist
 */

import Retell from 'retell-sdk';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { KnowledgeBaseManager } from '../knowledge-base-manager.js';

dotenv.config();

// Initialize Retell with extended timeout for KB operations
const retell = new Retell({ 
  apiKey: process.env.RETELL_API_KEY,
  timeout: 300000 // 5 minutes for KB operations which can be slow
});
const kbManager = new KnowledgeBaseManager(retell);

// Grace's Agent Configuration
const GRACE_AGENT = {
  agentId: 'agent_e2636fcbe1c89a7f6bd0731e11',
  llmId: 'llm_330631504f69f5507c481d3447bf',
  name: 'Grace - Abandoned Checkout Recovery Specialist',
  function: 'abandoned_checkout_recovery'
};

const LOGS_DIR = './improvement-logs';

/**
 * Extract improvements specific to Grace from logs
 */
async function extractGraceImprovements() {
  console.log('📚 Extracting Grace\'s improvements from logs...\n');
  
  try {
    const files = await fs.readdir(LOGS_DIR);
    const improvementFiles = files
      .filter(f => f.startsWith('improvement-') && f.endsWith('.json'))
      .sort();
    
    console.log(`Found ${improvementFiles.length} improvement logs\n`);
    
    const graceImprovements = {
      new_sections: new Map(),
      modifications: new Map(),
      all_improvements: []
    };
    
    let totalLogs = 0;
    let graceSpecificLogs = 0;
    
    for (const file of improvementFiles) {
      try {
        const filePath = path.join(LOGS_DIR, file);
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        totalLogs++;
        
        // Check if this improvement was for Grace
        const isForGrace = data.updated_agents?.some(agent => 
          agent.agent_id === GRACE_AGENT.agentId ||
          agent.agent_name?.toLowerCase().includes('grace') ||
          agent.agent_name?.toLowerCase().includes('abandoned')
        );
        
        if (isForGrace && data.improvements) {
          graceSpecificLogs++;
          
          console.log(`✅ ${file}`);
          console.log(`   Date: ${new Date(data.timestamp).toLocaleString()}`);
          
          // Extract new sections
          if (data.improvements.new_sections) {
            Object.entries(data.improvements.new_sections).forEach(([section, content]) => {
              graceImprovements.new_sections.set(section, {
                content,
                timestamp: data.timestamp,
                source: file
              });
              console.log(`   📝 Section: ${section}`);
            });
          }
          
          // Extract modifications
          if (data.improvements.modifications) {
            Object.entries(data.improvements.modifications).forEach(([section, content]) => {
              graceImprovements.modifications.set(section, {
                content,
                timestamp: data.timestamp,
                source: file
              });
              console.log(`   🔄 Modified: ${section}`);
            });
          }
          
          graceImprovements.all_improvements.push({
            timestamp: data.timestamp,
            improvements: data.improvements,
            source: file
          });
          
          console.log('');
        }
      } catch (error) {
        console.warn(`⚠️ Skipping invalid file ${file}:`, error.message);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total logs analyzed: ${totalLogs}`);
    console.log(`   Grace-specific logs: ${graceSpecificLogs}`);
    console.log(`   Unique sections: ${graceImprovements.new_sections.size}`);
    console.log(`   Modifications: ${graceImprovements.modifications.size}\n`);
    
    return graceImprovements;
    
  } catch (error) {
    console.error('❌ Failed to extract improvements:', error.message);
    throw error;
  }
}

/**
 * Get Grace's current prompt to understand her baseline
 */
async function getGraceCurrentPrompt() {
  console.log('📋 Fetching Grace\'s current prompt...\n');
  
  try {
    const llm = await retell.llm.retrieve(GRACE_AGENT.llmId);
    
    const promptLength = llm.general_prompt.length;
    const estimatedTokens = Math.ceil(promptLength / 4);
    
    console.log(`Current prompt size: ${promptLength} characters (~${estimatedTokens} tokens)\n`);
    
    // Save for reference
    await fs.mkdir('./core-prompts', { recursive: true });
    await fs.writeFile(
      `./core-prompts/${GRACE_AGENT.agentId}_current_prompt.txt`,
      llm.general_prompt
    );
    
    console.log(`✅ Saved current prompt to: ./core-prompts/${GRACE_AGENT.agentId}_current_prompt.txt\n`);
    
    return llm.general_prompt;
    
  } catch (error) {
    console.error('❌ Failed to get current prompt:', error.message);
    throw error;
  }
}

/**
 * Analyze patterns in Grace's improvements
 */
function analyzeImprovementPatterns(improvements) {
  console.log('🔍 Analyzing improvement patterns...\n');
  
  const patterns = {
    categories: new Map(),
    keywords: new Map(),
    themes: []
  };
  
  // Categorize by topic
  improvements.new_sections.forEach((data, section) => {
    const sectionLower = section.toLowerCase();
    
    // Identify categories
    if (sectionLower.includes('voicemail')) {
      patterns.categories.set('voicemail_handling', (patterns.categories.get('voicemail_handling') || 0) + 1);
    }
    if (sectionLower.includes('discount')) {
      patterns.categories.set('discount_handling', (patterns.categories.get('discount_handling') || 0) + 1);
    }
    if (sectionLower.includes('cancel')) {
      patterns.categories.set('cancellation_handling', (patterns.categories.get('cancellation_handling') || 0) + 1);
    }
    if (sectionLower.includes('objection')) {
      patterns.categories.set('objection_handling', (patterns.categories.get('objection_handling') || 0) + 1);
    }
    if (sectionLower.includes('edge') || sectionLower.includes('fringe')) {
      patterns.categories.set('edge_cases', (patterns.categories.get('edge_cases') || 0) + 1);
    }
    
    // Extract keywords
    const content = data.content.toLowerCase();
    const commonKeywords = ['discount', 'voicemail', 'cancel', 'shipping', 'delivery', 'price', 'quality', 'refund'];
    commonKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        patterns.keywords.set(keyword, (patterns.keywords.get(keyword) || 0) + 1);
      }
    });
  });
  
  // Identify themes
  if (patterns.categories.get('voicemail_handling') > 0) {
    patterns.themes.push('Strong focus on voicemail detection and handling');
  }
  if (patterns.categories.get('discount_handling') > 0) {
    patterns.themes.push('Discount requests and price objections are common');
  }
  if (patterns.categories.get('cancellation_handling') > 0) {
    patterns.themes.push('Needs to handle order cancellations gracefully');
  }
  
  console.log('📊 Categories:');
  patterns.categories.forEach((count, category) => {
    console.log(`   - ${category}: ${count} sections`);
  });
  
  console.log('\n🔑 Top Keywords:');
  const topKeywords = Array.from(patterns.keywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  topKeywords.forEach(([keyword, count]) => {
    console.log(`   - ${keyword}: ${count} occurrences`);
  });
  
  console.log('\n💡 Identified Themes:');
  patterns.themes.forEach(theme => {
    console.log(`   - ${theme}`);
  });
  console.log('');
  
  return patterns;
}

/**
 * Build Grace's knowledge base
 */
async function buildGraceKnowledgeBase(improvements, patterns) {
  console.log('🏗️ Building Grace\'s Knowledge Base...\n');
  
  try {
    // Create or get KB
    const kbId = await kbManager.ensureKnowledgeBase(
      GRACE_AGENT.agentId,
      GRACE_AGENT.name
    );
    
    console.log(`Knowledge Base ID: ${kbId}\n`);
    
    // Prepare documents
    const documents = [];
    
    // Add new sections as documents
    console.log('📝 Adding section documents...');
    improvements.new_sections.forEach((data, section) => {
      documents.push({
        section,
        content: data.content,
        metadata: {
          agent_id: GRACE_AGENT.agentId,
          agent_name: GRACE_AGENT.name,
          original_date: data.timestamp,
          migration_date: new Date().toISOString(),
          source: data.source,
          type: 'section',
          keywords: extractKeywordsFromContent(data.content)
        }
      });
      console.log(`   ✅ ${section}`);
    });
    
    // Add modifications as enhanced documents
    console.log('\n🔄 Adding modification documents...');
    improvements.modifications.forEach((data, section) => {
      documents.push({
        section: `${section}_ENHANCED`,
        content: data.content,
        metadata: {
          agent_id: GRACE_AGENT.agentId,
          agent_name: GRACE_AGENT.name,
          original_date: data.timestamp,
          migration_date: new Date().toISOString(),
          source: data.source,
          type: 'modification',
          keywords: extractKeywordsFromContent(data.content)
        }
      });
      console.log(`   ✅ ${section}_ENHANCED`);
    });
    
    // Add pattern-based summary document
    documents.push({
      section: 'KNOWLEDGE_BASE_OVERVIEW',
      content: generateOverviewDocument(improvements, patterns),
      metadata: {
        agent_id: GRACE_AGENT.agentId,
        agent_name: GRACE_AGENT.name,
        migration_date: new Date().toISOString(),
        type: 'meta',
        keywords: Array.from(patterns.keywords.keys())
      }
    });
    
    console.log(`\n📊 Total documents prepared: ${documents.length}`);
    console.log('\n⏳ Adding documents to knowledge base...');
    
    // Add all documents
    const results = await kbManager.addLearningsBatch(kbId, documents);
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`\n✅ Success: ${successCount}/${documents.length} documents added`);
    if (failCount > 0) {
      console.log(`⚠️ Failed: ${failCount} documents`);
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.section}: ${r.error}`);
      });
    }
    
    // Link KB to Grace's LLM
    console.log('\n🔗 Linking KB to Grace\'s LLM...');
    await kbManager.linkKnowledgeBaseToAgent(
      GRACE_AGENT.agentId,
      GRACE_AGENT.llmId,
      kbId
    );
    
    // Get statistics
    const stats = await kbManager.getStatistics(kbId);
    
    console.log('\n📊 Knowledge Base Statistics:');
    console.log(`   Total documents: ${stats.total_documents}`);
    console.log(`   Total size: ${stats.total_size_chars.toLocaleString()} characters`);
    console.log(`   Average doc size: ${Math.round(stats.total_size_chars / stats.total_documents).toLocaleString()} characters`);
    
    return {
      kb_id: kbId,
      documents_added: successCount,
      statistics: stats
    };
    
  } catch (error) {
    console.error('❌ Failed to build KB:', error.message);
    throw error;
  }
}

/**
 * Extract keywords from content
 */
function extractKeywordsFromContent(content) {
  const keywords = new Set();
  
  // Common important words for abandoned checkout recovery
  const importantWords = [
    'discount', 'shipping', 'delivery', 'price', 'cost', 'voicemail',
    'cancel', 'refund', 'quality', 'fresh', 'frozen', 'payment',
    'cart', 'checkout', 'order', 'product', 'item', 'question'
  ];
  
  const contentLower = content.toLowerCase();
  importantWords.forEach(word => {
    if (contentLower.includes(word)) {
      keywords.add(word);
    }
  });
  
  return Array.from(keywords);
}

/**
 * Generate overview document
 */
function generateOverviewDocument(improvements, patterns) {
  return `# Grace's Knowledge Base - Overview

This knowledge base contains ${improvements.new_sections.size + improvements.modifications.size} documents covering fringe cases, edge scenarios, and customer objections learned from real interactions.

## Categories Covered:
${Array.from(patterns.categories.entries()).map(([cat, count]) => 
  `- ${cat.replace(/_/g, ' ').toUpperCase()}: ${count} documents`
).join('\n')}

## Common Topics:
${Array.from(patterns.keywords.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([keyword, count]) => `- ${keyword}: ${count} mentions`)
  .join('\n')}

## Key Themes:
${patterns.themes.map(theme => `- ${theme}`).join('\n')}

This knowledge base is automatically updated when new patterns are identified in customer interactions.
Last updated: ${new Date().toISOString()}`;
}

/**
 * Generate report
 */
async function generateReport(improvements, patterns, kbResult) {
  const reportPath = path.join(LOGS_DIR, `grace-kb-build-${new Date().toISOString()}.json`);
  
  const report = {
    build_date: new Date().toISOString(),
    agent: GRACE_AGENT,
    improvements: {
      total_logs_analyzed: improvements.all_improvements.length,
      unique_sections: improvements.new_sections.size,
      modifications: improvements.modifications.size,
      total_documents: improvements.new_sections.size + improvements.modifications.size + 1
    },
    patterns: {
      categories: Object.fromEntries(patterns.categories),
      top_keywords: Array.from(patterns.keywords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
      themes: patterns.themes
    },
    knowledge_base: kbResult,
    sections_added: Array.from(improvements.new_sections.keys()),
    modifications_added: Array.from(improvements.modifications.keys())
  };
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Report saved: ${reportPath}`);
  
  return report;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Building Grace\'s First Knowledge Base\n');
  console.log('=' .repeat(60));
  console.log(`Agent: ${GRACE_AGENT.name}`);
  console.log(`Agent ID: ${GRACE_AGENT.agentId}`);
  console.log(`LLM ID: ${GRACE_AGENT.llmId}`);
  console.log('=' .repeat(60));
  console.log('');
  
  try {
    // Step 1: Get current prompt
    const currentPrompt = await getGraceCurrentPrompt();
    
    // Step 2: Extract improvements
    const improvements = await extractGraceImprovements();
    
    if (improvements.new_sections.size === 0 && improvements.modifications.size === 0) {
      console.log('⚠️ No improvements found for Grace in logs');
      console.log('   This might be a fresh setup or logs are in a different location');
      return;
    }
    
    // Step 3: Analyze patterns
    const patterns = analyzeImprovementPatterns(improvements);
    
    // Step 4: Build KB
    const kbResult = await buildGraceKnowledgeBase(improvements, patterns);
    
    // Step 5: Generate report
    const report = await generateReport(improvements, patterns, kbResult);
    
    console.log('\n\n✅ Grace\'s Knowledge Base Built Successfully!');
    console.log('=' .repeat(60));
    console.log(`Knowledge Base ID: ${kbResult.kb_id}`);
    console.log(`Documents added: ${kbResult.documents_added}`);
    console.log(`Total KB size: ${kbResult.statistics.total_size_chars.toLocaleString()} characters`);
    console.log('=' .repeat(60));
    
    console.log('\n📝 Next Steps:');
    console.log('   1. Review the KB in Retell dashboard');
    console.log('   2. Test with: USE_KNOWLEDGE_BASE=true npm run improve');
    console.log('   3. Monitor Grace\'s calls for proper context retrieval');
    console.log('   4. Compare costs before/after: npm run kb:compare');
    
  } catch (error) {
    console.error('\n💥 Build failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

