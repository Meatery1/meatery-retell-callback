#!/usr/bin/env node
import Retell from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function verify() {
  console.log('🔍 Verifying Grace\'s Knowledge Base...\n');
  
  try {
    // Check LLM
    const llm = await retell.llm.retrieve('llm_330631504f69f5507c481d3447bf');
    console.log('✅ Grace\'s LLM retrieved');
    console.log(`   Knowledge Base IDs: ${JSON.stringify(llm.knowledge_base_ids)}`);
    
    if (llm.knowledge_base_ids && llm.knowledge_base_ids.length > 0) {
      console.log('\n📚 Checking each KB:');
      for (const kbId of llm.knowledge_base_ids) {
        const kb = await retell.knowledgeBase.retrieve(kbId);
        console.log(`\n   KB: ${kb.knowledge_base_name}`);
        console.log(`   ID: ${kb.knowledge_base_id}`);
        console.log(`   Status: ${kb.status}`);
        console.log(`   Sources: ${kb.knowledge_base_sources?.length || 0}`);
      }
    } else {
      console.log('\n⚠️ No knowledge bases linked to Grace yet');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

verify();

