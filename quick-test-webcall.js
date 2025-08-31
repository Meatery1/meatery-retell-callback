#!/usr/bin/env node

/**
 * Quick test to see what properties are returned from createWebCall
 */

import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function quickTest() {
  console.log('🔍 Testing Web Call Creation\n');
  
  const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
  const AGENT_ID = 'agent_2f7a3254099b872da193df3133';  // Mike from The Meatery
  
  try {
    console.log('Creating web call...');
    const webCall = await retell.call.createWebCall({
      agent_id: AGENT_ID,
      metadata: {
        test: true
      },
      retell_llm_dynamic_variables: {
        customer_name: "Test Customer",
        order_number: "1234",
        customer_phone: "+15555551234"
      }
    });
    
    console.log('\n✅ Success! Response structure:\n');
    console.log(JSON.stringify(webCall, null, 2));
    
    console.log('\n📋 Available properties:');
    Object.keys(webCall).forEach(key => {
      console.log(`   - ${key}: ${typeof webCall[key] === 'string' ? webCall[key].substring(0, 100) : typeof webCall[key]}`);
    });
    
    // Try common property names
    const possibleUrls = [
      webCall.access_url,
      webCall.url,
      webCall.web_call_url,
      webCall.call_url,
      webCall.join_url,
      webCall.meeting_url
    ];
    
    console.log('\n🔗 Looking for URL in common properties:');
    possibleUrls.forEach((url, i) => {
      if (url) {
        console.log(`   ✅ Found URL: ${url}`);
      }
    });
    
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

quickTest();
