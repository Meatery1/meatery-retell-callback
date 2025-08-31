#!/usr/bin/env node

/**
 * Analyze the call that was just placed to Nicky
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function analyzeCall() {
  const callId = process.argv[2] || 'call_ec494fb06666b9a39d87e9e79c9';  // Latest call or pass as argument
  
  console.log('🔍 Analyzing your call with Mike...\n');
  console.log('Call ID:', callId);
  console.log('='.repeat(50));
  
  try {
    // Get call details
    const call = await retell.call.retrieve(callId);
    
    console.log('\n📞 Call Overview:');
    console.log(`   Status: ${call.status}`);
    console.log(`   Duration: ${call.end_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : 'Still active'} seconds`);
    console.log(`   Disconnection Reason: ${call.disconnection_reason || 'N/A'}`);
    
    if (call.transcript) {
      console.log('\n📝 Transcript:');
      console.log('-'.repeat(50));
      console.log(call.transcript);
      console.log('-'.repeat(50));
    }
    
    if (call.transcript_object) {
      console.log('\n💬 Conversation Flow:');
      call.transcript_object.forEach((turn, i) => {
        const speaker = turn.role === 'agent' ? '🤖 Mike' : '👤 You';
        console.log(`\n${speaker}: ${turn.content}`);
      });
    }
    
    if (call.analysis) {
      console.log('\n📊 Call Analysis:');
      console.log(`   User Sentiment: ${call.analysis.user_sentiment || 'N/A'}`);
      console.log(`   Call Summary: ${call.analysis.call_summary || 'N/A'}`);
      
      if (call.analysis.custom_analysis_data) {
        console.log('\n📋 Custom Analysis:');
        Object.entries(call.analysis.custom_analysis_data).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
    }
    
    // Check for common issues
    console.log('\n🔍 Potential Issues:');
    
    const transcript = call.transcript || '';
    const issues = [];
    
    if (transcript.includes("can't hear") || transcript.includes("hello?")) {
      issues.push('• Audio/connection issues detected');
    }
    
    if (transcript.includes("don't understand") || transcript.includes("what?")) {
      issues.push('• Comprehension issues detected');
    }
    
    if (!transcript.includes("Mike from The Meatery")) {
      issues.push('• Agent may not have introduced himself properly');
    }
    
    if (call.disconnection_reason === 'user_hangup' && call.end_timestamp - call.start_timestamp < 10000) {
      issues.push('• Call ended very quickly (possible immediate hangup)');
    }
    
    if (!transcript.includes("order")) {
      issues.push('• Order context may not have been mentioned');
    }
    
    if (issues.length > 0) {
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('   No obvious issues detected');
    }
    
    // Suggestions
    console.log('\n💡 Suggestions for Improvement:');
    console.log('   1. Ensure agent waits for customer to say hello first');
    console.log('   2. Speak more slowly and clearly');
    console.log('   3. Ask "Can you hear me okay?" if uncertain');
    console.log('   4. Be ready to handle "Who is this?" questions');
    console.log('   5. Have a clear value prop in first 5 seconds');
    
  } catch (error) {
    console.log('❌ Error retrieving call:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n⏳ Call may still be in progress or processing...');
      console.log('   Try again in 30 seconds');
    }
  }
}

// Analyze immediately
analyzeCall().catch(console.error);
