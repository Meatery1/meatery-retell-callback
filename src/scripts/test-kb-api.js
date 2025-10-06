#!/usr/bin/env node
import Retell from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ 
  apiKey: process.env.RETELL_API_KEY,
  timeout: 300000
});

console.log('🧪 Testing Retell KB API...\n');

async function test() {
  try {
    // Test 1: List KBs
    console.log('1️⃣ Testing list()...');
    const list = await retell.knowledgeBase.list();
    console.log(`✅ List works! Found ${list.length} existing KBs`);
    list.forEach(kb => console.log(`   - ${kb.knowledge_base_name} (${kb.knowledge_base_id})`));
    
    // Test 2: Create KB
    console.log('\n2️⃣ Testing create()...');
    const kb = await retell.knowledgeBase.create({
      knowledge_base_name: 'Test KB',
      text_sources: [{
        title: 'Test Doc',
        text: 'This is a test'
      }]
    });
    console.log(`✅ Create works! KB ID: ${kb.knowledge_base_id}`);
    
    // Test 3: Retrieve KB
    console.log('\n3️⃣ Testing retrieve()...');
    const retrieved = await retell.knowledgeBase.retrieve(kb.knowledge_base_id);
    console.log(`✅ Retrieve works! Name: ${retrieved.knowledge_base_name}`);
    
    // Test 4: Delete KB
    console.log('\n4️⃣ Testing delete()...');
    await retell.knowledgeBase.delete(kb.knowledge_base_id);
    console.log(`✅ Delete works!`);
    
    console.log('\n✅ All KB API methods work!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

test();

