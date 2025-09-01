#!/usr/bin/env node

/**
 * Test script to verify calls work after fixing the RETELL_FROM_NUMBER
 * Run this after updating the Railway environment variable
 */

async function testCallAfterFix() {
  const baseURL = 'https://nodejs-s-fb-production.up.railway.app';
  
  console.log('Testing Meatery Retell Dashboard after fix...\n');
  console.log('Dashboard URL:', baseURL);
  console.log('=====================================\n');
  
  // Test data
  const testCall = {
    phone: '+16194587071',  // Nicholas's number
    name: 'Test Nicholas',
    orderNumber: 'TEST-' + Date.now(),
    agentId: 'agent_2f7a3254099b872da193df3133',  // Outbound agent
    metadata: {
      test_call: true,
      test_reason: 'verify_fix'
    }
  };
  
  console.log('Test Call Parameters:');
  console.log(`  To: ${testCall.phone} (${testCall.name})`);
  console.log(`  Order: ${testCall.orderNumber}`);
  console.log(`  Agent: ${testCall.agentId.substring(0, 20)}...`);
  console.log('\nAttempting to place call...\n');
  
  try {
    const response = await fetch(`${baseURL}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testCall)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SUCCESS! Call placed successfully!');
      console.log('\nCall Details:');
      console.log(`  Call ID: ${data.call_id}`);
      console.log(`  Status: ${data.status || 'initiated'}`);
      console.log(`  To: ${data.to_number || testCall.phone}`);
      console.log('\nFull Response:');
      console.log(JSON.stringify(data, null, 2));
      
      console.log('\n🎉 The fix worked! Your dashboard should now be fully functional.');
      console.log('You can now use the dashboard at:', baseURL);
    } else {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      console.log('❌ Call still failing. Status:', response.status);
      console.log('Error:', errorData);
      
      if (errorText.includes('404')) {
        console.log('\n⚠️  The RETELL_FROM_NUMBER may not be updated on Railway yet.');
        console.log('Please ensure you\'ve updated it to: +16198212984');
      }
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    console.log('\nPlease check:');
    console.log('1. Railway deployment is running');
    console.log('2. You have internet connection');
  }
  
  // Also test if agents endpoint works
  console.log('\n=====================================');
  console.log('Testing /agents endpoint...');
  try {
    const agentsRes = await fetch(`${baseURL}/agents`);
    if (agentsRes.ok) {
      const agents = await agentsRes.json();
      console.log(`✅ Found ${agents.length} agents - API is accessible`);
    } else {
      console.log('⚠️  /agents endpoint returned:', agentsRes.status);
    }
  } catch (error) {
    console.log('❌ Could not reach /agents:', error.message);
  }
}

// Run the test
console.log('🔧 Meatery Retell - Post-Fix Test\n');
testCallAfterFix().catch(console.error);
