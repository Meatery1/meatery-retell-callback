#!/usr/bin/env node
/**
 * Migration Script: Extract Existing Improvements to Knowledge Base
 * 
 * This script:
 * 1. Reads all improvement logs
 * 2. Extracts unique sections and modifications
 * 3. Creates/updates knowledge bases for each agent
 * 4. Migrates improvements from prompt to KB
 * 
 * Run before switching to KB mode to preserve existing learnings
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

const LOGS_DIR = './improvement-logs';

/**
 * Extract all improvements from logs
 */
async function extractImprovementsFromLogs() {
  console.log('📚 Reading improvement logs...');
  
  try {
    const files = await fs.readdir(LOGS_DIR);
    const improvementFiles = files
      .filter(f => f.startsWith('improvement-') && f.endsWith('.json'))
      .sort(); // Oldest to newest
    
    console.log(`Found ${improvementFiles.length} improvement logs`);
    
    const allImprovements = [];
    const improvementsByAgent = {};
    
    for (const file of improvementFiles) {
      try {
        const filePath = path.join(LOGS_DIR, file);
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        
        if (data.improvements) {
          allImprovements.push({
            timestamp: data.timestamp,
            improvements: data.improvements,
            agents: data.updated_agents || []
          });
          
          // Group by agent
          if (data.updated_agents) {
            for (const agent of data.updated_agents) {
              const agentId = agent.agent_id;
              if (!improvementsByAgent[agentId]) {
                improvementsByAgent[agentId] = {
                  agent_name: agent.agent_name,
                  improvements: []
                };
              }
              improvementsByAgent[agentId].improvements.push({
                timestamp: data.timestamp,
                ...data.improvements
              });
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Skipping invalid file ${file}:`, error.message);
      }
    }
    
    return { allImprovements, improvementsByAgent };
    
  } catch (error) {
    console.error('❌ Failed to read improvement logs:', error.message);
    throw error;
  }
}

/**
 * Deduplicate improvements (keep most recent version)
 */
function deduplicateImprovements(improvements) {
  const sections = new Map();
  const modifications = new Map();
  
  // Process in chronological order so latest wins
  for (const imp of improvements) {
    if (imp.new_sections) {
      for (const [section, content] of Object.entries(imp.new_sections)) {
        sections.set(section, {
          content,
          timestamp: imp.timestamp
        });
      }
    }
    
    if (imp.modifications) {
      for (const [section, content] of Object.entries(imp.modifications)) {
        modifications.set(section, {
          content,
          timestamp: imp.timestamp
        });
      }
    }
  }
  
  return {
    sections: Array.from(sections.entries()).map(([title, data]) => ({
      title,
      content: data.content,
      timestamp: data.timestamp
    })),
    modifications: Array.from(modifications.entries()).map(([title, data]) => ({
      title,
      content: data.content,
      timestamp: data.timestamp
    }))
  };
}

/**
 * Migrate improvements for a specific agent
 */
async function migrateAgentImprovements(agentId, agentData) {
  console.log(`\n🔄 Migrating improvements for ${agentData.agent_name}...`);
  
  try {
    // Deduplicate improvements
    const deduplicated = deduplicateImprovements(agentData.improvements);
    
    console.log(`   Found ${deduplicated.sections.length} unique sections`);
    console.log(`   Found ${deduplicated.modifications.length} modifications`);
    
    // Get or create knowledge base
    const kbId = await kbManager.ensureKnowledgeBase(agentId, agentData.agent_name);
    
    // Prepare learnings
    const learnings = [];
    
    // Add sections
    for (const section of deduplicated.sections) {
      learnings.push({
        section: section.title,
        content: section.content,
        metadata: {
          agent_id: agentId,
          agent_name: agentData.agent_name,
          migrated_from: 'prompt_improvements',
          original_date: section.timestamp,
          migration_date: new Date().toISOString()
        }
      });
    }
    
    // Add modifications
    for (const mod of deduplicated.modifications) {
      learnings.push({
        section: `${mod.title}_ENHANCED`,
        content: mod.content,
        metadata: {
          agent_id: agentId,
          agent_name: agentData.agent_name,
          migrated_from: 'prompt_modifications',
          original_date: mod.timestamp,
          migration_date: new Date().toISOString()
        }
      });
    }
    
    // Add to knowledge base
    console.log(`   Adding ${learnings.length} documents to KB...`);
    const results = await kbManager.addLearningsBatch(kbId, learnings);
    
    const successCount = results.filter(r => r.success).length;
    console.log(`   ✅ Migrated ${successCount}/${learnings.length} documents`);
    
    return {
      agent_id: agentId,
      agent_name: agentData.agent_name,
      knowledge_base_id: kbId,
      documents_migrated: successCount,
      migration_date: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`   ❌ Failed to migrate ${agentData.agent_name}:`, error.message);
    return null;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting Knowledge Base Migration\n');
  console.log('This will migrate all existing improvements from prompts to knowledge bases.\n');
  
  try {
    // Step 1: Extract improvements from logs
    const { allImprovements, improvementsByAgent } = await extractImprovementsFromLogs();
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`   Total improvement logs: ${allImprovements.length}`);
    console.log(`   Agents with improvements: ${Object.keys(improvementsByAgent).length}`);
    
    // Step 2: Get current agents
    console.log('\n🔍 Discovering current agents...');
    const currentAgents = await discoverAgentsFromAPI();
    
    // Step 3: Migrate each agent
    const migrationResults = [];
    
    for (const [agentId, agentData] of Object.entries(improvementsByAgent)) {
      const result = await migrateAgentImprovements(agentId, agentData);
      if (result) {
        migrationResults.push(result);
      }
    }
    
    // Step 4: Link knowledge bases to agent LLMs
    console.log('\n🔗 Linking knowledge bases to agents...');
    for (const result of migrationResults) {
      const agent = currentAgents[result.agent_id] || 
                    Object.values(currentAgents).find(a => a.name === result.agent_name);
      
      if (agent && agent.llmId) {
        await kbManager.linkKnowledgeBaseToAgent(
          result.agent_id,
          agent.llmId,
          result.knowledge_base_id
        );
        console.log(`   ✅ Linked KB to ${result.agent_name}`);
      }
    }
    
    // Step 5: Save migration report
    const reportPath = path.join(LOGS_DIR, `migration-report-${new Date().toISOString()}.json`);
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        migration_date: new Date().toISOString(),
        total_logs_processed: allImprovements.length,
        agents_migrated: migrationResults.length,
        results: migrationResults
      }, null, 2)
    );
    
    console.log(`\n✅ Migration Complete!`);
    console.log(`   Agents migrated: ${migrationResults.length}`);
    console.log(`   Total documents: ${migrationResults.reduce((sum, r) => sum + r.documents_migrated, 0)}`);
    console.log(`   Report saved: ${reportPath}`);
    
    console.log('\n📝 Next Steps:');
    console.log('   1. Review the migration report');
    console.log('   2. Test with: USE_KNOWLEDGE_BASE=true npm run improve-prompts');
    console.log('   3. If successful, set USE_KNOWLEDGE_BASE=true in .env');
    console.log('   4. Optionally clean up old prompt improvements');
    
    return migrationResults;
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error(error.stack);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

export { runMigration, extractImprovementsFromLogs };

