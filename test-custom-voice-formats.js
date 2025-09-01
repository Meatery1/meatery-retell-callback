#!/usr/bin/env node

import Retell from 'retell-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Your custom ElevenLabs voice ID
const VOICE_ID = 'lju5ySDHU1CyTvjMSghg';
const AGENT_ID = 'agent_2f7a3254099b872da193df3133';

// Different formats to try
const voiceFormats = [
  { format: VOICE_ID, description: 'Raw voice ID' },
  { format: `elevenlabs:${VOICE_ID}`, description: 'With elevenlabs: prefix' },
  { format: `elevenlabs_${VOICE_ID}`, description: 'With elevenlabs_ prefix' },
  { format: `11labs-${VOICE_ID}`, description: 'With 11labs- prefix' },
  { format: `11labs-custom-${VOICE_ID}`, description: 'With 11labs-custom- prefix' },
  { format: `custom_${VOICE_ID}`, description: 'With custom_ prefix' },
];

async function testVoiceFormat(voiceId, description) {
  console.log(`\n🔍 Testing: ${description}`);
  console.log(`   Voice ID: ${voiceId}`);
  
  try {
    const updatedAgent = await retell.agent.update(AGENT_ID, {
      voice_id: voiceId,
      voice_model: 'eleven_turbo_v2_5'
    });
    
    console.log(`   ✅ SUCCESS! Voice accepted`);
    console.log(`   Updated voice_id: ${updatedAgent.voice_id}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return false;
  }
}

async function findWorkingFormat() {
  console.log('🎯 Testing Custom ElevenLabs Voice Integration');
  console.log('============================================\n');
  console.log(`Original Voice ID: ${VOICE_ID}\n`);
  
  // First, get current agent state
  try {
    const currentAgent = await retell.agent.retrieve(AGENT_ID);
    console.log(`Current Voice: ${currentAgent.voice_id}`);
    console.log(`Current Model: ${currentAgent.voice_model}\n`);
  } catch (error) {
    console.error('Failed to retrieve agent:', error.message);
  }
  
  // Test each format
  let successfulFormat = null;
  for (const { format, description } of voiceFormats) {
    const success = await testVoiceFormat(format, description);
    if (success) {
      successfulFormat = format;
      break;
    }
    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (successfulFormat) {
    console.log('\n🎉 Success! Working format found:');
    console.log(`   Use this voice_id: ${successfulFormat}`);
    console.log('\n📝 Update your scripts with this voice ID');
  } else {
    console.log('\n⚠️  No working format found');
    console.log('\n📋 Next Steps:');
    console.log('1. Check Retell Dashboard for voice import options');
    console.log('2. Ensure your ElevenLabs API is connected to Retell');
    console.log('3. Verify the voice is set to "Public" in ElevenLabs');
    console.log('4. Contact Retell support with voice ID: ' + VOICE_ID);
    
    // Try to list all available voices to see the pattern
    console.log('\n📊 Available ElevenLabs voices in your account:');
    try {
      const agents = await retell.agent.list();
      const elevenVoices = new Set();
      
      agents.forEach(agent => {
        if (agent.voice_id?.includes('11labs') || agent.voice_id?.includes('eleven')) {
          elevenVoices.add(agent.voice_id);
        }
      });
      
      if (elevenVoices.size > 0) {
        console.log('Found these ElevenLabs voice formats:');
        elevenVoices.forEach(v => console.log(`   - ${v}`));
      } else {
        console.log('No ElevenLabs voices found in existing agents');
      }
    } catch (error) {
      console.log('Could not list agents:', error.message);
    }
  }
}

// Additional function to check if ElevenLabs is properly connected
async function checkElevenLabsConnection() {
  console.log('\n🔗 Checking ElevenLabs Connection Status');
  console.log('========================================\n');
  
  // Check if we have ElevenLabs API key
  if (process.env.ELEVENLABS_API_KEY) {
    console.log('✅ ElevenLabs API key found in environment');
  } else {
    console.log('⚠️  No ELEVENLABS_API_KEY in .env file');
    console.log('   You might need to add: ELEVENLABS_API_KEY=your_key_here');
  }
  
  // Try to use a known ElevenLabs voice to confirm integration works
  console.log('\n🧪 Testing with known ElevenLabs voice...');
  try {
    await retell.agent.update(AGENT_ID, {
      voice_id: '11labs-Brian',
      voice_model: 'eleven_turbo_v2_5'
    });
    console.log('✅ Standard ElevenLabs voices work correctly');
  } catch (error) {
    console.log('❌ Even standard ElevenLabs voices failing:', error.message);
  }
}

// Run the tests
(async () => {
  await findWorkingFormat();
  await checkElevenLabsConnection();
  
  console.log('\n📚 Documentation:');
  console.log('- Retell Voices: https://docs.retellai.com/get-started/voices');
  console.log('- ElevenLabs API: https://elevenlabs.io/docs/api-reference/text-to-speech');
})();
