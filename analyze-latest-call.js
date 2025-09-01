#!/usr/bin/env node

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function analyzeLatest() {
  const callId = 'call_3ebc8bdcb80a4d1c5b6300fe75d';
  
  console.log('🔍 Analyzing latest call...\n');
  
  try {
    const call = await retell.call.retrieve(callId);
    
    console.log('Call Status:', call.status);
    console.log('Duration:', call.end_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : 'Still active', 'seconds');
    console.log('Disconnection:', call.disconnection_reason);
    
    if (call.transcript) {
      console.log('\n📝 Transcript:');
      console.log('-'.repeat(50));
      console.log(call.transcript);
      console.log('-'.repeat(50));
    }
    
    // Check for tool calls
    if (call.tool_calls) {
      console.log('\n🔧 Tool Calls Made:');
      call.tool_calls.forEach(tc => {
        console.log(`  - ${tc.name}: ${JSON.stringify(tc.arguments)}`);
        console.log(`    Result: ${tc.result}`);
      });
    }
    
    // Check metadata
    console.log('\n📦 Metadata:');
    console.log(JSON.stringify(call.metadata, null, 2));
    
  } catch (error) {
    console.log('Error:', error.response?.data || error.message);
  }
}

analyzeLatest();
