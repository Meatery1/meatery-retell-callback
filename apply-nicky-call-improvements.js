#!/usr/bin/env node
/**
 * Apply improvements based on Nicky's call analysis
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

const LLM_ID = process.env.RETELL_LLM_ID || 'llm_7eed186989d2fba11fa1f9395bc7';

async function applyNickyCallImprovements() {
  console.log('🔄 Applying Improvements from Nicky Call Analysis');
  console.log('=================================================\n');
  
  try {
    // Get current prompt
    const currentLLM = await retell.llm.retrieve(LLM_ID);
    let improvedPrompt = currentLLM.general_prompt;
    
    console.log('📝 Improvements to Apply:');
    console.log('  1. Better diagnostic question flow (one at a time)');
    console.log('  2. Acknowledge customer frustration with profanity');
    console.log('  3. Enhanced call closure');
    console.log('  4. Clearer communication for potential hearing issues\n');
    
    // Find and update the diagnostic questions section
    improvedPrompt = improvedPrompt.replace(
      `DIAGNOSTIC QUESTIONS (ask to determine issue):
- "Is the vacuum seal still intact?"
- "Is it cold to the touch?"
- "Color look normal - still red?"
- "Any unusual smell?"`,
      `DIAGNOSTIC QUESTIONS (ask ONE at a time):
1. First: "Is the vacuum seal still intact?"
   [Wait for answer]
2. If yes: "Is it cold to the touch?"
   [Wait for answer]
3. If needed: "What color is it - still nice and red?"
   [Wait for answer]
4. If needed: "Any unusual smell?"
   [Wait for answer]`
    );
    
    // Update the problem handling section to acknowledge frustration
    improvedPrompt = improvedPrompt.replace(
      `If problem reported:
"Oh, I want to make sure everything's okay. What did you notice?"`,
      `If problem reported:
"Oh, I want to make sure everything's okay. What did you notice?"

[If customer sounds frustrated/uses profanity]:
"I completely understand your frustration - let me help you figure this out."`
    );
    
    // Improve the thawed response
    improvedPrompt = improvedPrompt.replace(
      `IF THAWED BUT SAFE (seal intact, cold, normal color/smell):
"Good news - that's actually totally normal! Meat often thaws during shipping but that doesn't affect quality at all. As long as it's cold and sealed, you're all set. You can cook it in the next couple days or pop it back in the freezer."`,
      `IF THAWED BUT SAFE (seal intact, cold, normal color/smell):
"I understand why that might be concerning, but good news - that's actually totally normal! Meat often thaws during shipping but that doesn't affect quality at all. As long as it's cold and sealed, the quality is perfect. You can cook it in the next couple days or pop it back in the freezer."`
    );
    
    // Update call endings
    improvedPrompt = improvedPrompt.replace(
      `Ending:
- Happy: "Perfect. Enjoy those steaks!"
- Thawed (educated): "Great, enjoy the meat - it's gonna be delicious!"
- Spoiled (resolved): "We'll get that sorted right away. Really sorry about that."
- General: "Alright, take care!"`,
      `Ending:
- Happy: "Perfect! Anything else I can help with? [pause] Great, enjoy those steaks!"
- Thawed (educated): "Anything else you need? [pause] Great, enjoy the meat - it's gonna be delicious!"
- Spoiled (resolved): "We'll get that sorted right away. Anything else? [pause] Really sorry about that issue."
- General: "Is there anything else I can help with today? [pause] Alright, take care!"`
    );
    
    // Add new section for communication clarity
    const communicationSection = `

COMMUNICATION CLARITY:
- Ask diagnostic questions ONE AT A TIME - wait for each answer
- If customer seems confused, repeat or rephrase
- Acknowledge frustration when you hear it
- Always confirm they heard you before ending the call
- If they use profanity, stay calm and acknowledge their concern`;
    
    // Add new section for better closure
    const closureSection = `

CALL CLOSURE CHECKLIST:
1. Summarize what was discussed/resolved
2. Ask "Is there anything else I can help with today?"
3. Wait for response
4. Only then give final goodbye
5. End call promptly after goodbye`;
    
    // Add the new sections
    improvedPrompt += communicationSection;
    improvedPrompt += closureSection;
    
    // Backup current prompt
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/prompt-pre-nicky-improvements-${timestamp}.txt`;
    await fs.mkdir('./backups', { recursive: true });
    await fs.writeFile(backupPath, currentLLM.general_prompt);
    console.log(`💾 Backed up current prompt to: ${backupPath}\n`);
    
    // Apply the improvements
    console.log('🚀 Updating agent with improvements...');
    
    const updated = await retell.llm.update(LLM_ID, {
      general_prompt: improvedPrompt
    });
    
    console.log('✅ Agent updated successfully!');
    console.log(`   LLM ID: ${LLM_ID}`);
    console.log(`   Last Modified: ${new Date(updated.last_modification_timestamp).toISOString()}\n`);
    
    // Save the improved prompt
    const improvedPath = `./improvements/improved-prompt-nicky-${timestamp}.txt`;
    await fs.mkdir('./improvements', { recursive: true });
    await fs.writeFile(improvedPath, improvedPrompt);
    console.log(`📁 Improved prompt saved to: ${improvedPath}\n`);
    
    console.log('🎯 Key Improvements Applied:');
    console.log('  ✅ Diagnostic questions now asked one at a time');
    console.log('  ✅ Better acknowledgment of customer frustration');
    console.log('  ✅ Enhanced call closure with "anything else?" check');
    console.log('  ✅ Clearer communication guidelines');
    console.log('  ✅ Improved handling of profanity/frustration\n');
    
    console.log('📞 Ready to Test!');
    console.log('  The agent should now:');
    console.log('  • Ask questions more clearly (one at a time)');
    console.log('  • Handle frustrated customers better');
    console.log('  • Have smoother call endings');
    console.log('  • Still correctly handle thawed vs spoiled!\n');
    
  } catch (error) {
    console.error('❌ Error updating agent:', error);
    throw error;
  }
}

// Run the update
applyNickyCallImprovements()
  .then(() => {
    console.log('✨ Updates complete! Ready for testing.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
