# Connecting Your Custom ElevenLabs Voice to Retell

## The Issue
Your custom voice ID `lju5ySDHU1CyTvjMSghg` is not yet recognized by Retell. This is because custom ElevenLabs voices need to be properly connected first.

## Steps to Connect Your Custom Voice

### Option 1: Through Retell Dashboard (Recommended)

1. **Go to Retell Dashboard**
   - Navigate to https://dashboard.retellai.com
   - Go to "Voices" or "Voice Library" section

2. **Connect ElevenLabs Account**
   - Look for "Add Custom Voice" or "Import Voice" option
   - Select "ElevenLabs" as the provider
   - You'll need to provide your ElevenLabs API key

3. **Import Your Custom Voice**
   - Once connected, you should see your ElevenLabs voices
   - Find your cloned voice (ID: `lju5ySDHU1CyTvjMSghg`)
   - Import/Add it to your Retell voice library

4. **Get the Retell Voice ID**
   - After importing, Retell will assign its own voice ID
   - This might look like: `elevenlabs_custom_[some_id]`
   - Use this new ID in your agents

### Option 2: Use Direct ElevenLabs Integration

If Retell supports direct ElevenLabs voice IDs, you might need to:

1. **Format the Voice ID Correctly**
   Try these formats:
   - `elevenlabs:lju5ySDHU1CyTvjMSghg`
   - `elevenlabs_lju5ySDHU1CyTvjMSghg`
   - `11labs-custom-lju5ySDHU1CyTvjMSghg`

2. **Ensure ElevenLabs API Key is Connected**
   Add to your `.env` file:
   ```
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   ```

3. **Verify Voice Permissions in ElevenLabs**
   - Go to ElevenLabs dashboard
   - Find your cloned voice
   - Ensure it's set to "Public" or has API access enabled
   - Check "Sharing" settings

### Option 3: Contact Support

If the above doesn't work:

1. **Retell Support**
   - Email: support@retellai.com
   - Ask: "How do I use a custom ElevenLabs cloned voice with voice ID lju5ySDHU1CyTvjMSghg?"

2. **Information to Provide**
   - Your ElevenLabs voice ID: `lju5ySDHU1CyTvjMSghg`
   - Your Retell Agent ID: `agent_2f7a3254099b872da193df3133`
   - That you want to use a custom cloned voice from ElevenLabs

## Temporary Workaround

While setting up the custom voice, you can:

1. **Use a Similar Pre-made Voice**
   Current voice options that might sound similar:
   - `11labs-Brian` (current)
   - `11labs-Anthony`
   - `11labs-Lucas`
   - `11labs-Jason`

2. **Test Different Voices**
   ```bash
   # Update to test different voices
   node test-different-voices.js
   ```

## Quick Test Script

Once you have the correct voice ID format, test it:
