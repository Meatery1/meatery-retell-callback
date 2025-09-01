#!/usr/bin/env node

import Retell from 'retell-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Your custom ElevenLabs voice ID
const CUSTOM_VOICE_ID = 'lju5ySDHU1CyTvjMSghg';

// Agent to update (your main outbound agent)
const AGENT_ID = 'agent_2f7a3254099b872da193df3133';

async function updateAgentWithCustomVoice() {
  console.log('🎙️  Updating Retell Agent with Custom ElevenLabs Voice');
  console.log('================================================\n');
  
  try {
    // First, get the current agent configuration
    console.log('📋 Fetching current agent configuration...');
    const currentAgent = await retell.agent.retrieve(AGENT_ID);
    console.log(`Current voice: ${currentAgent.voice_id}`);
    console.log(`Current voice model: ${currentAgent.voice_model}\n`);
    
    // Update the agent with your custom voice
    console.log('🔄 Updating agent with custom voice...');
    const updatedAgent = await retell.agent.update(AGENT_ID, {
      voice_id: CUSTOM_VOICE_ID,
      voice_model: 'eleven_turbo_v2_5', // Keep the same high-quality model
      
      // You can also adjust these voice parameters to fine-tune the output:
      voice_temperature: 0.5,  // Controls variance (0.0 = less variance, 1.0 = more variance)
      voice_speed: 1.0,        // Speed of speech (0.5 = slower, 2.0 = faster)
      
      // Optional: Update the agent name to reflect the custom voice
      agent_name: 'Meatery Mike - Custom Voice'
    });
    
    console.log('✅ Agent updated successfully!\n');
    console.log('📊 Updated Configuration:');
    console.log(`- Voice ID: ${updatedAgent.voice_id}`);
    console.log(`- Voice Model: ${updatedAgent.voice_model}`);
    console.log(`- Voice Temperature: ${updatedAgent.voice_temperature}`);
    console.log(`- Voice Speed: ${updatedAgent.voice_speed}`);
    console.log(`- Agent Name: ${updatedAgent.agent_name}\n`);
    
    console.log('🎯 Next Steps:');
    console.log('1. Test the voice with: node place-outbound-call.js <phone_number>');
    console.log('2. Adjust voice_temperature and voice_speed if needed');
    console.log('3. The custom voice is now active for all calls using this agent\n');
    
    return updatedAgent;
    
  } catch (error) {
    console.error('❌ Error updating agent:', error);
    
    if (error.message?.includes('voice')) {
      console.log('\n💡 Troubleshooting Tips:');
      console.log('1. Ensure your ElevenLabs account is connected to Retell');
      console.log('2. Verify the voice ID is correct in your ElevenLabs dashboard');
      console.log('3. Check that your cloned voice is set to "Public" or properly shared');
      console.log('4. Make sure your Retell account has access to custom ElevenLabs voices\n');
    }
    
    throw error;
  }
}

// Also create a function to test different voice settings
async function testVoiceSettings(temperature, speed) {
  console.log(`\n🔬 Testing voice with temperature=${temperature}, speed=${speed}`);
  
  try {
    const updatedAgent = await retell.agent.update(AGENT_ID, {
      voice_id: CUSTOM_VOICE_ID,
      voice_model: 'eleven_turbo_v2_5',
      voice_temperature: temperature,
      voice_speed: speed
    });
    
    console.log('✅ Settings applied successfully');
    return updatedAgent;
  } catch (error) {
    console.error('❌ Failed to apply settings:', error.message);
  }
}

// Run the update
updateAgentWithCustomVoice()
  .then(() => {
    console.log('🎉 Custom voice integration complete!');
    
    // Optionally test different settings
    if (process.argv.includes('--test-settings')) {
      console.log('\n📊 Testing different voice settings...\n');
      
      const tests = [
        { temp: 0.3, speed: 1.0, desc: 'More consistent, normal speed' },
        { temp: 0.5, speed: 1.1, desc: 'Balanced variance, slightly faster' },
        { temp: 0.7, speed: 0.95, desc: 'More natural variance, slightly slower' }
      ];
      
      tests.forEach(async (test, index) => {
        setTimeout(async () => {
          console.log(`\nTest ${index + 1}: ${test.desc}`);
          await testVoiceSettings(test.temp, test.speed);
        }, index * 2000);
      });
    }
  })
  .catch(error => {
    console.error('Failed to update agent:', error);
    process.exit(1);
  });
