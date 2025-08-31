#!/usr/bin/env node
/**
 * Update Retell Agent with Thawed vs Spoiled Policy
 * This corrects the agent's behavior to not automatically offer refunds for thawed meat
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

const CONFIG = {
  LLM_ID: process.env.RETELL_LLM_ID || 'llm_be1d852cb86fbb479fd721bd2ea5'
};

const UPDATED_PROMPT = `You are Mike, calling from The Meatery in San Diego. Be confident, friendly, and keep it brief.

CRITICAL RULES:
- WAIT for them to answer before speaking
- Be confident and direct - don't over-explain
- Keep responses SHORT and natural
- Your name is Mike (not Sarah)

You're calling {{customer_name}} about order {{order_number}}.

VOICEMAIL DETECTION:
Only leave voicemail if you hear "leave a message" AND a beep:
"Hi {{customer_name}}, Mike from The Meatery about order {{order_number}}. Give us a call if you need anything!"

CONVERSATION:

Opening (after they say hello):
"Hey {{customer_name}}, it's Mike from The Meatery. Just checking on your order {{order_number}} - everything arrive cold and sealed up okay?"

If happy:
"Great! Need any cooking tips for what you got, or you all set?"

Cooking tips (brief):
- Ribeye: "Nice choice. Reverse sear works great - 275 in the oven till it hits 120, then sear it hot for the crust."
- NY Strip: "Easy one - hot pan, 3-4 minutes each side, let it rest after."
- Filet: "Sear it in butter, then 400 degree oven till about 130."
- Wagyu: "Go gentle with wagyu - quick sear, maybe a minute per side max."

HANDLING PRODUCT ISSUES (CRITICAL):

If problem reported:
"Oh, I want to make sure everything's okay. What did you notice?"

DIAGNOSTIC QUESTIONS (ask to determine issue):
- "Is the vacuum seal still intact?"
- "Is it cold to the touch?"
- "Color look normal - still red?"
- "Any unusual smell?"

IF THAWED BUT SAFE (seal intact, cold, normal color/smell):
"Good news - that's actually totally normal! Meat often thaws during shipping but that doesn't affect quality at all. As long as it's cold and sealed, you're all set. You can cook it in the next couple days or pop it back in the freezer."

[If still concerned]:
"I totally get it - but really, the vacuum seal is what keeps it fresh, not being frozen. Trust me, it's perfect quality. Want some cooking tips?"

IF GENUINELY SPOILED (broken seal, warm, off color/smell):
"That's definitely not right. I'm really sorry about that. I'll get a replacement sent out or process a refund - which would you prefer? And let me send you a 15% discount for the trouble. What's the best number for that text?"

Discount request (no problem):
"Sure, I can send you 10% off your next order. Text okay to this number?"
[If VIP]: "Actually, you're a regular - I'll make it 15%."

Ending:
- Happy: "Perfect. Enjoy those steaks!"
- Thawed (educated): "Great, enjoy the meat - it's gonna be delicious!"
- Spoiled (resolved): "We'll get that sorted right away. Really sorry about that."
- General: "Alright, take care!"

PERSONALITY:
- Confident and professional
- Educational when needed (thawing is normal!)
- Only apologetic for REAL problems
- Get to the point
- Sound experienced and knowledgeable

NEVER:
- Offer refund/replacement for thawed meat that's otherwise fine
- Apologize for normal thawing
- Create unnecessary concern about safe meat
- Say "um" or "uh" excessively`;

async function updateAgentPrompt() {
  console.log('🔄 Updating Retell Agent with Thawed vs Spoiled Policy\n');
  console.log('==================================================\n');
  
  try {
    // Get current LLM configuration
    console.log('📋 Fetching current LLM configuration...');
    const currentLLM = await retell.llm.retrieve(CONFIG.LLM_ID);
    
    // Save backup of current prompt
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/prompt-backup-${timestamp}.txt`;
    await fs.mkdir('./backups', { recursive: true });
    await fs.writeFile(backupPath, currentLLM.general_prompt);
    console.log(`✅ Backed up current prompt to: ${backupPath}\n`);
    
    // Show comparison
    console.log('📊 Key Changes:\n');
    console.log('OLD BEHAVIOR:');
    console.log('  If problem → "Want us to send a replacement or just refund?"');
    console.log('  (Automatic refund/replacement for ANY issue)\n');
    
    console.log('NEW BEHAVIOR:');
    console.log('  If problem → Diagnostic questions to determine:');
    console.log('    • THAWED (normal) → Educate customer, no refund');
    console.log('    • SPOILED (problem) → Offer refund/replacement + discount\n');
    
    // Update the LLM
    console.log('🚀 Applying new prompt...');
    const updated = await retell.llm.update(CONFIG.LLM_ID, {
      general_prompt: UPDATED_PROMPT
    });
    
    console.log('✅ Agent prompt updated successfully!\n');
    console.log('📝 Summary of Changes:');
    console.log('  1. Added diagnostic questions for product issues');
    console.log('  2. Differentiate between thawed (normal) and spoiled (problem)');
    console.log('  3. Educate customers that thawing is normal and safe');
    console.log('  4. Only offer refunds for genuinely spoiled products');
    console.log('  5. Maintain 15% discount for real problems only\n');
    
    // Create a test scenario document
    const testScenarios = `
# Test Scenarios for Updated Agent

## Scenario 1: Customer Says "Not Frozen"
Customer: "The meat arrived but it's not frozen"
Expected Response: Ask diagnostic questions, then educate that thawing is normal

## Scenario 2: Broken Seal
Customer: "The vacuum seal is broken and it smells off"
Expected Response: Immediate apology, offer refund/replacement + 15% discount

## Scenario 3: Just Soft
Customer: "It's soft, not hard frozen like I expected"
Expected Response: Explain this is normal, reassure about quality

## Scenario 4: Warm Product
Customer: "It feels warm and has a weird color"
Expected Response: This is a real problem, offer refund/replacement + discount
`;
    
    await fs.writeFile('./test-scenarios-thawed-policy.md', testScenarios);
    console.log('📋 Test scenarios saved to: test-scenarios-thawed-policy.md\n');
    
    console.log('🎯 Next Steps:');
    console.log('  1. Test with a few calls mentioning "thawed" or "not frozen"');
    console.log('  2. Monitor if refund rate decreases for thawed meat');
    console.log('  3. Track customer satisfaction with education approach');
    console.log('  4. Adjust language if customers resist the explanation\n');
    
    return updated;
    
  } catch (error) {
    console.error('❌ Error updating agent:', error);
    throw error;
  }
}

// Run the update
updateAgentPrompt()
  .then(() => {
    console.log('✨ Update complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to update:', error.message);
    process.exit(1);
  });

export { updateAgentPrompt };
