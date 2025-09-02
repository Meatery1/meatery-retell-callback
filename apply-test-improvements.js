#!/usr/bin/env node
/**
 * Automatically apply improvements based on test results
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

const CONFIG = {
  LLM_ID: process.env.RETELL_LLM_ID || 'llm_7eed186989d2fba11fa1f9395bc7',
  MIN_SUCCESS_RATE: 80, // Minimum acceptable success rate
  AUTO_APPLY_THRESHOLD: 95 // Auto-apply if current success rate is below this
};

/**
 * Load the latest test results
 */
async function loadLatestTestResults() {
  const resultsDir = './test-results';
  const files = await fs.readdir(resultsDir);
  
  // Find the latest improvements file
  const improvementFiles = files.filter(f => f.startsWith('improvements-'));
  if (improvementFiles.length === 0) {
    throw new Error('No test results found. Run the test suite first.');
  }
  
  improvementFiles.sort().reverse();
  const latestFile = improvementFiles[0];
  
  const data = await fs.readFile(path.join(resultsDir, latestFile), 'utf-8');
  return JSON.parse(data);
}

/**
 * Apply improvements to the agent prompt
 */
async function applyImprovements(testResults) {
  console.log('\n🔧 Applying Test-Based Improvements');
  console.log('====================================\n');
  
  const currentSuccessRate = parseFloat(testResults.current_success_rate);
  console.log(`📊 Current Success Rate: ${currentSuccessRate}%\n`);
  
  if (currentSuccessRate >= CONFIG.AUTO_APPLY_THRESHOLD) {
    console.log(`✅ Success rate is excellent! No improvements needed.`);
    return;
  }
  
  // Get current prompt
  const currentLLM = await retell.llm.retrieve(CONFIG.LLM_ID);
  let improvedPrompt = currentLLM.general_prompt;
  
  // Apply critical improvements
  if (testResults.improvements.critical_improvements) {
    console.log('📝 Applying Critical Improvements:');
    
    // Add critical improvements as a new section
    const criticalSection = `

CRITICAL INSTRUCTIONS (Based on Test Results):
${testResults.improvements.critical_improvements.map((imp, i) => `${i + 1}. ${imp}`).join('\n')}
`;
    improvedPrompt += criticalSection;
    
    testResults.improvements.critical_improvements.forEach((imp, i) => {
      console.log(`   ${i + 1}. ${imp}`);
    });
  }
  
  // Add additional instructions
  if (testResults.improvements.additional_instructions) {
    console.log('\n📚 Adding Additional Instructions:');
    
    for (const [section, content] of Object.entries(testResults.improvements.additional_instructions)) {
      improvedPrompt += `\n\n${section.toUpperCase()}:\n${content}`;
      console.log(`   - ${section}`);
    }
  }
  
  // Add edge case handlers
  if (testResults.improvements.edge_case_handlers && testResults.improvements.edge_case_handlers.length > 0) {
    console.log('\n🛡️ Adding Edge Case Handlers:');
    
    const edgeCaseSection = `

EDGE CASE HANDLING:
${testResults.improvements.edge_case_handlers.map((handler, i) => `${i + 1}. ${handler}`).join('\n')}
`;
    improvedPrompt += edgeCaseSection;
    
    testResults.improvements.edge_case_handlers.forEach((handler, i) => {
      console.log(`   ${i + 1}. ${handler}`);
    });
  }
  
  // Backup current prompt
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `./backups/prompt-pre-test-improvements-${timestamp}.txt`;
  await fs.mkdir('./backups', { recursive: true });
  await fs.writeFile(backupPath, currentLLM.general_prompt);
  console.log(`\n💾 Backed up current prompt to: ${backupPath}`);
  
  // Apply the improvements
  console.log('\n🚀 Updating agent with improvements...');
  
  const updated = await retell.llm.update(CONFIG.LLM_ID, {
    general_prompt: improvedPrompt
  });
  
  console.log('✅ Agent updated successfully!');
  console.log(`\n📈 Expected Success Rate: ${testResults.improvements.expected_success_rate}`);
  
  // Save the improved prompt
  const improvedPath = `./improvements/improved-prompt-${timestamp}.txt`;
  await fs.mkdir('./improvements', { recursive: true });
  await fs.writeFile(improvedPath, improvedPrompt);
  console.log(`📁 Improved prompt saved to: ${improvedPath}`);
  
  // Create a summary of changes
  const summary = {
    date: new Date().toISOString(),
    previous_success_rate: currentSuccessRate,
    expected_success_rate: testResults.improvements.expected_success_rate,
    improvements_applied: {
      critical: testResults.improvements.critical_improvements || [],
      additional_sections: Object.keys(testResults.improvements.additional_instructions || {}),
      edge_cases: testResults.improvements.edge_case_handlers || []
    },
    backup_location: backupPath,
    improved_prompt_location: improvedPath
  };
  
  const summaryPath = `./improvements/summary-${timestamp}.json`;
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📋 Summary saved to: ${summaryPath}`);
  
  return summary;
}

/**
 * Rollback to a previous prompt version
 */
async function rollbackPrompt(backupPath) {
  console.log('\n⏮️ Rolling back to previous prompt version...');
  
  const backupPrompt = await fs.readFile(backupPath, 'utf-8');
  
  await retell.llm.update(CONFIG.LLM_ID, {
    general_prompt: backupPrompt
  });
  
  console.log('✅ Rollback successful!');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--rollback' && args[1]) {
    // Rollback to specific backup
    await rollbackPrompt(args[1]);
    return;
  }
  
  try {
    // Load latest test results
    const testResults = await loadLatestTestResults();
    
    console.log('📊 Test Results Summary:');
    console.log(`   Test Date: ${testResults.test_date}`);
    console.log(`   Success Rate: ${testResults.current_success_rate}%`);
    
    if (parseFloat(testResults.current_success_rate) < CONFIG.MIN_SUCCESS_RATE) {
      console.log(`\n⚠️  Success rate is below minimum threshold (${CONFIG.MIN_SUCCESS_RATE}%)`);
      console.log('   Improvements are strongly recommended.');
      
      if (args[0] === '--force' || args[0] === '--auto') {
        console.log('\n🤖 Auto-applying improvements...');
        await applyImprovements(testResults);
      } else {
        console.log('\n💡 To apply improvements, run:');
        console.log('   npm run apply-improvements -- --auto');
        console.log('\n📝 Review improvements in the test results file first.');
      }
    } else {
      console.log(`\n✅ Success rate is acceptable (>= ${CONFIG.MIN_SUCCESS_RATE}%)`);
      
      if (args[0] === '--force') {
        console.log('\n🔧 Force-applying improvements anyway...');
        await applyImprovements(testResults);
      } else {
        console.log('\n💡 To force improvements anyway, run:');
        console.log('   npm run apply-improvements -- --force');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });

export { applyImprovements, rollbackPrompt };
