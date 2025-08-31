#!/usr/bin/env node
/**
 * Analyze a single call through the improvement loop
 */

import Retell from 'retell-sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { generatePromptImprovements } from './src/prompt-improvement-loop.js';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  AGENT_ID: process.env.RETELL_AGENT_ID || 'agent_566475088bf8231175ddfb1899',
  LLM_ID: process.env.RETELL_LLM_ID || 'llm_be1d852cb86fbb479fd721bd2ea5',
  IMPROVEMENT_MODEL: 'gpt-4o'
};

/**
 * Analyze a single call
 */
async function analyzeCall(callId) {
  console.log(`\n🔍 Fetching call: ${callId}\n`);
  
  try {
    // Fetch the specific call
    const call = await retell.call.retrieve(callId);
    
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }
    
    console.log('📞 Call Details:');
    console.log(`   - Call ID: ${call.call_id}`);
    console.log(`   - Duration: ${Math.round(call.end_timestamp - call.start_timestamp) / 1000}s`);
    console.log(`   - Status: ${call.call_status}`);
    console.log(`   - Call Type: ${call.call_type}`);
    console.log(`   - Agent ID: ${call.agent_id}`);
    
    if (call.call_analysis) {
      console.log('\n📊 Call Analysis:');
      console.log(`   - Successful: ${call.call_analysis.call_successful}`);
      console.log(`   - In Voicemail: ${call.call_analysis.in_voicemail}`);
      console.log(`   - User Sentiment: ${call.call_analysis.user_sentiment}`);
      console.log(`   - Call Summary: ${call.call_analysis.call_summary}`);
      
      if (call.call_analysis.custom_analysis_data) {
        console.log('\n📋 Custom Analysis:');
        for (const [key, value] of Object.entries(call.call_analysis.custom_analysis_data)) {
          console.log(`   - ${key}: ${value}`);
        }
      }
    }
    
    // Analyze transcript for patterns
    const analysis = analyzeSingleCallTranscript(call);
    
    console.log('\n🔎 Transcript Analysis:');
    console.log(`   - Issues Found: ${analysis.issues.length}`);
    console.log(`   - Unhandled Requests: ${analysis.unhandled_requests.length}`);
    console.log(`   - Edge Cases: ${analysis.edge_cases.length}`);
    
    if (analysis.issues.length > 0) {
      console.log('\n❗ Issues Detected:');
      analysis.issues.forEach(issue => {
        console.log(`   - ${issue.type}: ${issue.description}`);
        if (issue.context) {
          console.log(`     Context: "${issue.context.substring(0, 100)}..."`);
        }
      });
    }
    
    if (analysis.unhandled_requests.length > 0) {
      console.log('\n🚫 Unhandled Requests:');
      analysis.unhandled_requests.forEach(req => {
        console.log(`   - ${req.type}: "${req.excerpt.substring(0, 100)}..."`);
      });
    }
    
    // Generate improvements based on this call
    console.log('\n🤖 Generating Prompt Improvements...\n');
    
    // Get current LLM configuration
    const currentLLM = await retell.llm.retrieve(CONFIG.LLM_ID);
    
    // Create analysis structure similar to the batch analysis
    const singleCallAnalysis = {
      total: 1,
      successful: call.call_analysis?.call_successful ? [call] : [],
      failed: !call.call_analysis?.call_successful ? [call] : [],
      voicemail: call.call_analysis?.in_voicemail ? [call] : [],
      edge_cases: analysis.edge_cases,
      common_issues: analysis.issues.reduce((acc, issue) => {
        acc[issue.type] = { count: 1, examples: [call.call_id] };
        return acc;
      }, {}),
      unhandled_requests: analysis.unhandled_requests
    };
    
    const improvements = await generatePromptImprovements(singleCallAnalysis, currentLLM.general_prompt);
    
    console.log('💡 Suggested Improvements:');
    
    if (improvements.priority_fixes && improvements.priority_fixes.length > 0) {
      console.log('\n🎯 Priority Fixes:');
      improvements.priority_fixes.forEach((fix, i) => {
        console.log(`   ${i + 1}. ${fix}`);
      });
    }
    
    if (improvements.new_sections && Object.keys(improvements.new_sections).length > 0) {
      console.log('\n📝 New Sections to Add:');
      for (const [section, content] of Object.entries(improvements.new_sections)) {
        console.log(`\n   ${section}:`);
        console.log(`   ${content.substring(0, 200)}...`);
      }
    }
    
    if (improvements.modifications && Object.keys(improvements.modifications).length > 0) {
      console.log('\n✏️  Modifications:');
      for (const [section, modification] of Object.entries(improvements.modifications)) {
        console.log(`   - ${section}: ${modification}`);
      }
    }
    
    if (improvements.expected_improvement) {
      console.log(`\n📈 Expected Improvement: ${improvements.expected_improvement}`);
    }
    
    // Show raw transcript if there are issues
    if (analysis.issues.length > 0 || analysis.unhandled_requests.length > 0) {
      console.log('\n📜 Call Transcript Excerpt:');
      const transcriptLines = call.transcript.split('\n').slice(0, 30);
      transcriptLines.forEach(line => {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      });
      if (call.transcript.split('\n').length > 30) {
        console.log('   ... (transcript truncated)');
      }
    }
    
    return { call, analysis, improvements };
    
  } catch (error) {
    console.error('❌ Error analyzing call:', error);
    throw error;
  }
}

/**
 * Analyze transcript for patterns and issues
 */
function analyzeSingleCallTranscript(call) {
  const transcript = call.transcript || '';
  const analysis = {
    issues: [],
    unhandled_requests: [],
    edge_cases: []
  };
  
  // Check for repeated greetings
  if (transcript.match(/Hi .*this is The Meatery.*Hi .*this is The Meatery/s)) {
    analysis.issues.push({
      type: 'repeated_greeting',
      description: 'Agent repeated the greeting multiple times',
      context: extractContext(transcript, /Hi .*this is The Meatery/i)
    });
  }
  
  // Check for voicemail mishandling
  if (transcript.match(/leave a message|press \d|mailbox|after the tone/i) &&
      transcript.length > 500) { // Long transcript after voicemail prompt
    analysis.issues.push({
      type: 'voicemail_mishandling',
      description: 'Agent continued talking to voicemail system',
      context: extractContext(transcript, /leave a message|press \d/i)
    });
  }
  
  // Check for unhandled requests
  const unhandledPatterns = [
    { pattern: /how do i (re)?order/i, type: 'reorder_request' },
    { pattern: /discount|coupon|promo/i, type: 'discount_request' },
    { pattern: /cancel/i, type: 'cancellation' },
    { pattern: /speak to (a )?human|manager|supervisor/i, type: 'escalation_request' },
    { pattern: /when.*deliver|shipping|track/i, type: 'delivery_inquiry' },
    { pattern: /allergen|gluten|dietary/i, type: 'dietary_inquiry' },
    { pattern: /return|refund|exchange/i, type: 'return_request' },
    { pattern: /complaint|problem|issue/i, type: 'complaint' }
  ];
  
  for (const { pattern, type } of unhandledPatterns) {
    if (transcript.match(pattern)) {
      analysis.unhandled_requests.push({
        call_id: call.call_id,
        type,
        excerpt: extractContext(transcript, pattern, 150),
        sentiment: call.call_analysis?.user_sentiment
      });
    }
  }
  
  // Check for negative sentiment
  if (call.call_analysis?.user_sentiment === 'Negative' || 
      call.call_analysis?.user_sentiment === 'very_dissatisfied') {
    analysis.edge_cases.push({
      call_id: call.call_id,
      issue: extractMainIssue(transcript),
      sentiment: call.call_analysis.user_sentiment,
      resolution: call.call_analysis?.custom_analysis_data?.resolution_preference
    });
  }
  
  // Check for confusion patterns
  if (transcript.match(/what\?|huh\?|i don't understand|can you repeat/i)) {
    analysis.issues.push({
      type: 'customer_confusion',
      description: 'Customer seemed confused during the call',
      context: extractContext(transcript, /what\?|huh\?|i don't understand/i)
    });
  }
  
  return analysis;
}

function extractContext(transcript, pattern, contextChars = 100) {
  const match = transcript.match(pattern);
  if (!match) return '';
  
  const index = match.index;
  const start = Math.max(0, index - contextChars);
  const end = Math.min(transcript.length, index + match[0].length + contextChars);
  
  return transcript.substring(start, end).replace(/\n/g, ' ').trim();
}

function extractMainIssue(transcript) {
  const lines = transcript.split('\n');
  for (const line of lines) {
    if (line.includes('problem') || line.includes('issue') || 
        line.includes('wrong') || line.includes('not')) {
      return line.trim();
    }
  }
  return 'General dissatisfaction';
}

// Run the analysis
const callId = process.argv[2] || 'call_91fc6ea6441f35f5cf8f8d7e75b';

console.log('🚀 Starting Single Call Analysis');
console.log('================================\n');

analyzeCall(callId)
  .then(result => {
    console.log('\n✅ Analysis Complete!');
    console.log('====================\n');
    
    // Optionally save the results
    if (result.improvements.priority_fixes && result.improvements.priority_fixes.length > 0) {
      console.log('💭 Next Steps:');
      console.log('   1. Review the suggested improvements above');
      console.log('   2. Run "npm run approve-improvements" to apply them');
      console.log('   3. Or manually update the agent prompt with the suggestions\n');
    }
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error.message);
    process.exit(1);
  });
