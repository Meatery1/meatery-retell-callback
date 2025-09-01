#!/usr/bin/env node

import dotenv from 'dotenv';
import { Retell } from 'retell-sdk';

dotenv.config();

async function checkRetellConfig() {
  console.log('Checking Retell Configuration...\n');
  
  const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
  
  // Check environment variables
  console.log('1. Environment Variables:');
  console.log(`   RETELL_API_KEY: ${process.env.RETELL_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`   RETELL_AGENT_ID: ${process.env.RETELL_AGENT_ID || 'Not set'}`);
  console.log(`   RETELL_FROM_NUMBER: ${process.env.RETELL_FROM_NUMBER || 'Not set'}`);
  
  // List all agents
  console.log('\n2. Available Agents:');
  try {
    const agents = await retell.agent.list();
    console.log(`   Found ${agents.length} agents:`);
    agents.forEach(agent => {
      const isOutbound = agent.agent_name?.toLowerCase().includes('outbound');
      const marker = isOutbound ? ' (OUTBOUND)' : '';
      console.log(`   - ${agent.agent_id}: ${agent.agent_name || 'Unnamed'}${marker}`);
    });
    
    // Check if the default agent exists
    const defaultAgentId = 'agent_2f7a3254099b872da193df3133';
    const defaultAgent = agents.find(a => a.agent_id === defaultAgentId);
    if (defaultAgent) {
      console.log(`\n   ✓ Default outbound agent exists: ${defaultAgent.agent_name}`);
    } else {
      console.log(`\n   ✗ Default outbound agent NOT FOUND: ${defaultAgentId}`);
      // Find any outbound agent
      const outboundAgent = agents.find(a => a.agent_name?.toLowerCase().includes('outbound'));
      if (outboundAgent) {
        console.log(`   → Suggested replacement: ${outboundAgent.agent_id}`);
      }
    }
  } catch (error) {
    console.log(`   Error listing agents: ${error.message}`);
  }
  
  // List phone numbers
  console.log('\n3. Available Phone Numbers:');
  try {
    const phoneNumbers = await retell.phoneNumber.list();
    console.log(`   Found ${phoneNumbers.length} phone numbers:`);
    phoneNumbers.forEach(pn => {
      const agents = [];
      if (pn.inbound_agent_id) agents.push(`Inbound: ${pn.inbound_agent_id.substring(0, 12)}...`);
      if (pn.outbound_agent_id) agents.push(`Outbound: ${pn.outbound_agent_id.substring(0, 12)}...`);
      console.log(`   - ${pn.phone_number} (${pn.nickname || 'No nickname'})`);
      if (agents.length > 0) {
        console.log(`     ${agents.join(', ')}`);
      }
    });
    
    // Check if the configured from_number exists
    if (process.env.RETELL_FROM_NUMBER) {
      const configuredNumber = phoneNumbers.find(pn => 
        pn.phone_number === process.env.RETELL_FROM_NUMBER
      );
      if (configuredNumber) {
        console.log(`\n   ✓ Configured from_number exists: ${process.env.RETELL_FROM_NUMBER}`);
        if (configuredNumber.outbound_agent_id) {
          console.log(`     Has outbound agent: ${configuredNumber.outbound_agent_id}`);
        } else {
          console.log(`     ✗ WARNING: No outbound agent configured for this number!`);
        }
      } else {
        console.log(`\n   ✗ Configured from_number NOT FOUND: ${process.env.RETELL_FROM_NUMBER}`);
      }
    }
    
    // Suggest a phone number with outbound capability
    const outboundPhone = phoneNumbers.find(pn => pn.outbound_agent_id);
    if (outboundPhone) {
      console.log(`\n   Suggested phone for outbound calls: ${outboundPhone.phone_number}`);
      console.log(`   With agent: ${outboundPhone.outbound_agent_id}`);
    }
  } catch (error) {
    console.log(`   Error listing phone numbers: ${error.message}`);
  }
  
  // Test creating a call with current config
  console.log('\n4. Testing Call Creation:');
  const testPhone = '+16194587071'; // Nicholas's number from the dashboard
  const fromNumber = process.env.RETELL_FROM_NUMBER;
  const agentId = process.env.RETELL_AGENT_ID || 'agent_2f7a3254099b872da193df3133';
  
  console.log(`   Test call to: ${testPhone}`);
  console.log(`   From number: ${fromNumber || 'Not set'}`);
  console.log(`   Agent ID: ${agentId}`);
  
  if (!fromNumber) {
    console.log('\n   ✗ Cannot test call - RETELL_FROM_NUMBER not set in .env');
    console.log('   Add RETELL_FROM_NUMBER to your .env file with one of the phone numbers above');
    return;
  }
  
  try {
    console.log('\n   Attempting to create test call...');
    const call = await retell.call.createPhoneCall({
      to_number: testPhone,
      from_number: fromNumber,
      override_agent_id: agentId,
      metadata: { test: true }
    });
    console.log(`   ✓ Call created successfully! Call ID: ${call.call_id}`);
  } catch (error) {
    console.log(`   ✗ Failed to create call: ${error.message}`);
    if (error.response?.data) {
      console.log(`   Details: ${JSON.stringify(error.response.data)}`);
    }
  }
}

checkRetellConfig().catch(console.error);
