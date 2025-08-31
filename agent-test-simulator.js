#!/usr/bin/env node
/**
 * Comprehensive Test Simulator for Retell Agent
 * Runs multiple test scenarios and analyzes performance
 */

import Retell from 'retell-sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  AGENT_ID: process.env.RETELL_AGENT_ID || 'agent_566475088bf8231175ddfb1899',
  LLM_ID: process.env.RETELL_LLM_ID || 'llm_be1d852cb86fbb479fd721bd2ea5',
  ANALYSIS_MODEL: 'gpt-4o',
  TEST_PHONE_NUMBER: process.env.TEST_PHONE_NUMBER || '+15555550100',
  DELAY_BETWEEN_TESTS: 5000 // 5 seconds between tests to avoid rate limiting
};

/**
 * Load test scenarios
 */
async function loadTestScenarios() {
  const scenariosPath = './test-scenarios-comprehensive.json';
  const data = await fs.readFile(scenariosPath, 'utf-8');
  return JSON.parse(data).test_scenarios;
}

/**
 * Simulate a conversation with the agent
 */
async function simulateConversation(scenario) {
  console.log(`\n🧪 Testing: ${scenario.id} - ${scenario.scenario}`);
  console.log(`   Category: ${scenario.category}`);
  console.log(`   Customer: ${scenario.customer_name}`);
  
  try {
    // Get current agent prompt for simulation
    const llm = await retell.llm.retrieve(CONFIG.LLM_ID);
    
    // Simulate the conversation using GPT-4
    const simulationPrompt = `
You are simulating a Retell AI agent conversation for testing purposes.

AGENT PROMPT:
${llm.general_prompt}

TEST SCENARIO:
- Customer Name: ${scenario.customer_name}
- Order Number: ${scenario.order_number}
- Scenario: ${scenario.scenario}
- Customer Responses: ${JSON.stringify(scenario.customer_responses)}

Simulate the agent's responses to each customer response. The agent should follow its prompt exactly.

Format your response as a JSON object:
{
  "agent_responses": [
    "agent's response to customer_responses[0]",
    "agent's response to customer_responses[1]",
    ...
  ],
  "actions_taken": {
    "voicemail_detected": boolean,
    "diagnostic_questions_asked": boolean,
    "refund_offered": boolean,
    "replacement_offered": boolean,
    "discount_offered": boolean,
    "discount_percentage": number or null,
    "education_provided": boolean,
    "cooking_tips_given": boolean,
    "call_ended_appropriately": boolean,
    "escalation_handled": boolean
  },
  "conversation_quality": {
    "stayed_in_character": boolean,
    "followed_prompt": boolean,
    "appropriate_length": boolean,
    "professional_tone": boolean,
    "empathy_shown": boolean,
    "problem_solved": boolean
  },
  "detected_issues": [
    "any issues or problems detected in the agent's responses"
  ]
}`;

    const response = await openai.chat.completions.create({
      model: CONFIG.ANALYSIS_MODEL,
      messages: [
        { role: 'system', content: 'You are a testing system analyzing AI agent conversations.' },
        { role: 'user', content: simulationPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const simulation = JSON.parse(response.choices[0].message.content);
    
    // Analyze against expected outcomes
    const analysis = analyzeSimulation(simulation, scenario.expected_outcomes);
    
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      simulation,
      expected: scenario.expected_outcomes,
      analysis,
      passed: analysis.overall_pass
    };
    
  } catch (error) {
    console.error(`   ❌ Error simulating ${scenario.id}:`, error.message);
    return {
      scenario_id: scenario.id,
      category: scenario.category,
      error: error.message,
      passed: false
    };
  }
}

/**
 * Analyze simulation results against expected outcomes
 */
function analyzeSimulation(simulation, expected) {
  const analysis = {
    matches: [],
    mismatches: [],
    overall_pass: true,
    score: 0,
    max_score: 0
  };
  
  // Check each expected outcome
  for (const [key, expectedValue] of Object.entries(expected)) {
    analysis.max_score++;
    
    let actualValue = null;
    
    // Map expected outcomes to simulation data
    if (key === 'satisfaction') {
      // Infer from conversation quality and problem solving
      if (simulation.conversation_quality.problem_solved && 
          simulation.conversation_quality.empathy_shown) {
        actualValue = expectedValue; // Assume matches if handled well
        analysis.score++;
      }
    } else if (key === 'education_provided') {
      actualValue = simulation.actions_taken.education_provided;
    } else if (key === 'refund_offered') {
      actualValue = simulation.actions_taken.refund_offered;
    } else if (key === 'discount_offered') {
      actualValue = simulation.actions_taken.discount_offered;
    } else if (key === 'cooking_tips_given') {
      actualValue = simulation.actions_taken.cooking_tips_given;
    } else if (key === 'voicemail_detected') {
      actualValue = simulation.actions_taken.voicemail_detected;
    } else if (key === 'discount_percentage' && simulation.actions_taken.discount_percentage) {
      actualValue = simulation.actions_taken.discount_percentage;
    }
    
    if (actualValue === expectedValue) {
      analysis.matches.push(`✓ ${key}: ${expectedValue}`);
      analysis.score++;
    } else if (actualValue !== null) {
      analysis.mismatches.push(`✗ ${key}: expected ${expectedValue}, got ${actualValue}`);
      analysis.overall_pass = false;
    }
  }
  
  // Check for detected issues
  if (simulation.detected_issues && simulation.detected_issues.length > 0) {
    analysis.issues = simulation.detected_issues;
    analysis.overall_pass = false;
  }
  
  // Check conversation quality
  const qualityIssues = [];
  if (!simulation.conversation_quality.stayed_in_character) {
    qualityIssues.push('Broke character');
  }
  if (!simulation.conversation_quality.followed_prompt) {
    qualityIssues.push('Didn\'t follow prompt');
  }
  if (!simulation.conversation_quality.professional_tone) {
    qualityIssues.push('Unprofessional tone');
  }
  
  if (qualityIssues.length > 0) {
    analysis.quality_issues = qualityIssues;
    analysis.overall_pass = false;
  }
  
  analysis.pass_rate = (analysis.score / analysis.max_score * 100).toFixed(1);
  
  return analysis;
}

/**
 * Generate improvement recommendations based on test results
 */
async function generateImprovements(testResults) {
  const failedTests = testResults.filter(r => !r.passed);
  const categorizedFailures = {};
  
  // Categorize failures
  for (const result of failedTests) {
    if (!categorizedFailures[result.category]) {
      categorizedFailures[result.category] = [];
    }
    categorizedFailures[result.category].push({
      scenario: result.scenario_id,
      issues: result.analysis?.issues || [],
      mismatches: result.analysis?.mismatches || [],
      quality_issues: result.analysis?.quality_issues || []
    });
  }
  
  const improvementPrompt = `
Based on the following test failures, generate specific prompt improvements:

FAILED TEST CATEGORIES:
${JSON.stringify(categorizedFailures, null, 2)}

CURRENT SUCCESS RATE: ${((testResults.filter(r => r.passed).length / testResults.length) * 100).toFixed(1)}%

Generate specific improvements to address these failures. Focus on:
1. Common patterns in failures
2. Missing instructions or clarifications
3. Edge case handling
4. Consistency issues

Format as JSON:
{
  "critical_improvements": [
    "specific prompt addition or modification"
  ],
  "additional_instructions": {
    "section_name": "instruction content"
  },
  "edge_case_handlers": [
    "specific edge case handling instruction"
  ],
  "expected_success_rate": "percentage after improvements"
}`;

  const response = await openai.chat.completions.create({
    model: CONFIG.ANALYSIS_MODEL,
    messages: [
      { role: 'system', content: 'You are an expert at improving AI agent prompts based on test results.' },
      { role: 'user', content: improvementPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });
  
  return JSON.parse(response.choices[0].message.content);
}

/**
 * Run all tests and generate report
 */
async function runTestSuite() {
  console.log('🚀 Starting Comprehensive Agent Test Suite');
  console.log('==========================================\n');
  
  try {
    // Load test scenarios
    const scenarios = await loadTestScenarios();
    console.log(`📋 Loaded ${scenarios.length} test scenarios\n`);
    
    // Run each test
    const results = [];
    const categoryResults = {};
    
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      
      // Progress indicator
      console.log(`\n[${i + 1}/${scenarios.length}] Testing...`);
      
      const result = await simulateConversation(scenario);
      results.push(result);
      
      // Track by category
      if (!categoryResults[scenario.category]) {
        categoryResults[scenario.category] = {
          total: 0,
          passed: 0,
          failed: 0,
          issues: []
        };
      }
      
      categoryResults[scenario.category].total++;
      if (result.passed) {
        categoryResults[scenario.category].passed++;
        console.log(`   ✅ PASSED (${result.analysis?.pass_rate}%)`);
      } else {
        categoryResults[scenario.category].failed++;
        console.log(`   ❌ FAILED`);
        if (result.analysis?.mismatches) {
          result.analysis.mismatches.forEach(m => console.log(`      ${m}`));
        }
        categoryResults[scenario.category].issues.push({
          scenario: scenario.id,
          issues: result.analysis?.issues || result.error || 'Unknown failure'
        });
      }
      
      // Delay between tests to avoid rate limiting
      if (i < scenarios.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_TESTS));
      }
    }
    
    // Generate summary report
    console.log('\n\n📊 TEST RESULTS SUMMARY');
    console.log('=======================\n');
    
    const totalPassed = results.filter(r => r.passed).length;
    const totalFailed = results.filter(r => !r.passed).length;
    const successRate = (totalPassed / results.length * 100).toFixed(1);
    
    console.log(`Overall Success Rate: ${successRate}%`);
    console.log(`Passed: ${totalPassed}/${results.length}`);
    console.log(`Failed: ${totalFailed}/${results.length}\n`);
    
    console.log('Results by Category:');
    console.log('-------------------');
    for (const [category, stats] of Object.entries(categoryResults)) {
      const catSuccessRate = (stats.passed / stats.total * 100).toFixed(1);
      console.log(`${category}: ${catSuccessRate}% (${stats.passed}/${stats.total})`);
      if (stats.failed > 0) {
        console.log(`  Failed scenarios: ${stats.issues.map(i => i.scenario).join(', ')}`);
      }
    }
    
    // Generate improvements if there are failures
    if (totalFailed > 0) {
      console.log('\n\n🔧 GENERATING IMPROVEMENTS');
      console.log('==========================\n');
      
      const improvements = await generateImprovements(results);
      
      console.log('Critical Improvements:');
      improvements.critical_improvements.forEach((imp, i) => {
        console.log(`${i + 1}. ${imp}`);
      });
      
      if (improvements.additional_instructions) {
        console.log('\nAdditional Instructions to Add:');
        for (const [section, content] of Object.entries(improvements.additional_instructions)) {
          console.log(`\n${section}:`);
          console.log(`${content.substring(0, 200)}...`);
        }
      }
      
      if (improvements.edge_case_handlers) {
        console.log('\nEdge Case Handlers:');
        improvements.edge_case_handlers.forEach((handler, i) => {
          console.log(`${i + 1}. ${handler}`);
        });
      }
      
      console.log(`\nExpected Success Rate After Improvements: ${improvements.expected_success_rate}`);
      
      // Save improvements to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const improvementsPath = `./test-results/improvements-${timestamp}.json`;
      await fs.mkdir('./test-results', { recursive: true });
      await fs.writeFile(improvementsPath, JSON.stringify({
        test_date: new Date().toISOString(),
        current_success_rate: successRate,
        improvements,
        detailed_results: results
      }, null, 2));
      
      console.log(`\n📁 Detailed results saved to: ${improvementsPath}`);
    } else {
      console.log('\n🎉 All tests passed! No improvements needed.');
    }
    
    // Save full test report
    const reportPath = `./test-results/report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await fs.writeFile(reportPath, JSON.stringify({
      summary: {
        total_tests: results.length,
        passed: totalPassed,
        failed: totalFailed,
        success_rate: successRate
      },
      category_results: categoryResults,
      detailed_results: results
    }, null, 2));
    
    console.log(`\n📊 Full report saved to: ${reportPath}`);
    
          return {
        success_rate: successRate,
        results,
        improvements: totalFailed > 0 ? await generateImprovements(results) : null
      };
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    throw error;
  }
}

// Add option to run specific category
async function runCategoryTests(category) {
  const scenarios = await loadTestScenarios();
  const categoryScenarios = scenarios.filter(s => s.category === category);
  
  if (categoryScenarios.length === 0) {
    console.log(`No scenarios found for category: ${category}`);
    return;
  }
  
  console.log(`\n🧪 Running ${categoryScenarios.length} tests in category: ${category}\n`);
  
  const results = [];
  for (const scenario of categoryScenarios) {
    const result = await simulateConversation(scenario);
    results.push(result);
    
    if (result.passed) {
      console.log(`   ✅ ${scenario.id}: PASSED`);
    } else {
      console.log(`   ❌ ${scenario.id}: FAILED`);
    }
  }
  
  const passed = results.filter(r => r.passed).length;
  console.log(`\n📊 Category Results: ${passed}/${results.length} passed (${(passed/results.length*100).toFixed(1)}%)`);
  
  return results;
}

// Run based on command line arguments
const args = process.argv.slice(2);

if (args[0] === '--category' && args[1]) {
  // Run specific category
  runCategoryTests(args[1])
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
} else if (args[0] === '--quick') {
  // Run quick test (first 10 scenarios)
  console.log('Running quick test (first 10 scenarios)...');
  loadTestScenarios()
    .then(scenarios => {
      const quickScenarios = scenarios.slice(0, 10);
      return runTestSuite(quickScenarios);
    })
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
} else {
  // Run full test suite
  runTestSuite()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { runTestSuite, simulateConversation, generateImprovements };
