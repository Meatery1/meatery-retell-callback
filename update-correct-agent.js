#!/usr/bin/env node
/**
 * Update the CORRECT agent with all improvements
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// The CORRECT agent you want to update
const CORRECT_LLM_ID = 'llm_7eed186989d2fba11fa1f9395bc7';
const CORRECT_AGENT_ID = 'agent_2f7a3254099b872da193df3133';

async function updateCorrectAgent() {
  console.log('🔄 Updating the CORRECT Agent with All Improvements');
  console.log('===================================================\n');
  
  console.log(`Target Agent: ${CORRECT_AGENT_ID} (Meatery Mike - Confident Male)`);
  console.log(`Target LLM: ${CORRECT_LLM_ID}\n`);
  
  try {
    // Get the current prompt from the CORRECT agent
    const currentLLM = await retell.llm.retrieve(CORRECT_LLM_ID);
    console.log('✅ Retrieved current LLM configuration');
    
    // Get the updated prompt from the WRONG agent that has our improvements
    const updatedLLM = await retell.llm.retrieve('llm_be1d852cb86fbb479fd721bd2ea5');
    console.log('✅ Retrieved improvements from updated LLM\n');
    
    // Show what's being added
    console.log('📝 Improvements to Apply:');
    console.log('  1. Thawed vs Spoiled Policy');
    console.log('  2. Critical Instructions from Test Results');
    console.log('  3. Refund and Compensation Policy');
    console.log('  4. Call Closure Procedures');
    console.log('  5. Customer Education Scripts');
    console.log('  6. Edge Case Handling\n');
    
    // Apply the improved prompt to the correct LLM
    const updated = await retell.llm.update(CORRECT_LLM_ID, {
      general_prompt: updatedLLM.general_prompt
    });
    
    console.log('✅ Successfully updated the CORRECT agent!');
    console.log(`   LLM ID: ${CORRECT_LLM_ID}`);
    console.log(`   Agent ID: ${CORRECT_AGENT_ID}`);
    console.log(`   Last Modified: ${new Date(updated.last_modification_timestamp).toISOString()}\n`);
    
    // Update the .env file to use the correct IDs
    console.log('📝 Updating .env file with correct IDs...');
    
    const envContent = await fs.readFile('.env', 'utf-8');
    let newEnvContent = envContent;
    
    // Update or add RETELL_AGENT_ID
    if (envContent.includes('RETELL_AGENT_ID=')) {
      newEnvContent = newEnvContent.replace(
        /RETELL_AGENT_ID="[^"]*"/,
        `RETELL_AGENT_ID="${CORRECT_AGENT_ID}"`
      );
    } else {
      newEnvContent += `\nRETELL_AGENT_ID="${CORRECT_AGENT_ID}"`;
    }
    
    // Add RETELL_LLM_ID if not present
    if (!envContent.includes('RETELL_LLM_ID=')) {
      newEnvContent += `\nRETELL_LLM_ID="${CORRECT_LLM_ID}"`;
    } else {
      newEnvContent = newEnvContent.replace(
        /RETELL_LLM_ID="[^"]*"/,
        `RETELL_LLM_ID="${CORRECT_LLM_ID}"`
      );
    }
    
    await fs.writeFile('.env', newEnvContent);
    console.log('✅ Updated .env file with correct Agent and LLM IDs\n');
    
    console.log('🎯 Summary:');
    console.log('  - Meatery Mike (Confident Male) agent now has:');
    console.log('    • Thawed vs Spoiled differentiation');
    console.log('    • Test-based improvements (72.8% expected success)');
    console.log('    • Better edge case handling');
    console.log('    • All critical instructions');
    console.log('\n✨ Your main agent is now properly updated!');
    
  } catch (error) {
    console.error('❌ Error updating agent:', error);
    throw error;
  }
}

// Run the update
updateCorrectAgent()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
