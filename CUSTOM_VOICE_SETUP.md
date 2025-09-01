# Custom ElevenLabs Voice Integration with Retell

## Your Custom Voice Details
- **Voice ID**: `lju5ySDHU1CyTvjMSghg`
- **Provider**: ElevenLabs
- **Integration Script**: `update-agent-custom-voice.js`

## Quick Start

1. **Update your agent with the custom voice:**
   ```bash
   node update-agent-custom-voice.js
   ```

2. **Test the voice with a call:**
   ```bash
   node place-outbound-call.js +1234567890 "Test Customer" "12345"
   ```

3. **Fine-tune voice settings (optional):**
   ```bash
   node update-agent-custom-voice.js --test-settings
   ```

## Voice Parameters

### Voice Model Options
- `eleven_turbo_v2_5` - Latest, fastest model (recommended)
- `eleven_turbo_v2` - Previous turbo version
- `eleven_flash_v2_5` - Optimized for speed
- `eleven_flash_v2` - Previous flash version
- `eleven_multilingual_v2` - For multiple languages

### Tunable Parameters

#### voice_temperature (0.0 - 1.0)
- **0.0-0.3**: Very consistent, less variation
- **0.4-0.6**: Balanced naturalness (recommended: 0.5)
- **0.7-1.0**: More expressive, higher variation

#### voice_speed (0.5 - 2.0)
- **0.5-0.8**: Slower, more deliberate
- **0.9-1.1**: Natural speed (recommended: 1.0)
- **1.2-2.0**: Faster speech

## Important Notes

### ElevenLabs Integration Requirements
1. **API Connection**: Your ElevenLabs account must be connected to Retell
2. **Voice Sharing**: The cloned voice should be set to "Public" or properly shared
3. **Subscription**: Ensure your ElevenLabs plan supports API access for cloned voices
4. **Credits**: Monitor your ElevenLabs character usage

### Voice ID Format
- **Pre-made ElevenLabs voices**: Use format `11labs-VoiceName`
- **Custom/Cloned voices**: Use the raw Voice ID directly (like your `lju5ySDHU1CyTvjMSghg`)

## Troubleshooting

### Voice Not Working?
1. **Verify Voice ID**: 
   - Go to ElevenLabs → Voices → Your cloned voice
   - Copy the Voice ID and ensure it matches

2. **Check Permissions**:
   - In ElevenLabs, ensure the voice is set to "Public" or "Shared"
   - Verify API access is enabled for the voice

3. **API Keys**:
   - Ensure your `.env` file has the correct `RETELL_API_KEY`
   - If using direct ElevenLabs integration, you might need `ELEVENLABS_API_KEY`

4. **Test with Default Voice**:
   - If custom voice fails, test with `11labs-Brian` to ensure the agent works
   - This helps isolate if it's a voice-specific issue

### Common Error Messages

- **"Invalid voice_id"**: The voice ID is not recognized. Check the ID and permissions.
- **"Voice not available"**: The voice might not be shared properly or your account lacks access.
- **"Rate limit exceeded"**: You've hit ElevenLabs API limits. Check your subscription.

## Testing Your Voice

### Basic Test Call
```javascript
// Quick test script
import Retell from 'retell-sdk';
import dotenv from 'dotenv';
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Create a test web call
const call = await retell.call.createWebCall({
  agent_id: 'agent_2f7a3254099b872da193df3133',
  metadata: { test: 'custom_voice' }
});

console.log('Web call URL:', call.access_token);
```

### Voice Comparison
To compare your custom voice with the original:

1. Keep a backup of the original voice settings
2. Switch between voices using the update script
3. Place test calls to hear the difference
4. Adjust parameters for optimal results

## Best Practices

1. **Start Conservative**: Begin with temperature=0.5, speed=1.0
2. **Test Thoroughly**: Make several test calls in different scenarios
3. **Monitor Performance**: Custom voices may have slightly different latency
4. **Document Settings**: Keep track of what settings work best
5. **Have a Fallback**: Keep the original voice ID as a backup option

## Integration with Your Current Setup

Your current agents using this custom voice:
- **Outbound Agent**: `agent_2f7a3254099b872da193df3133` (Meatery Mike)
- **Current Voice**: `11labs-Brian` → Will be updated to your custom voice

The custom voice will be used in:
- Outbound customer calls (`place-outbound-call.js`)
- Test calls (`call-nicky-final.js`, etc.)
- Web calls (`retell-web-call-tester.js`)
- All automated testing scenarios

## Additional Voice Customization

### In Your Agent Prompt
You can reference voice characteristics in your prompt:
```
You are Mike, speaking in a [describe your cloned voice style - e.g., warm, professional, friendly] tone.
```

### Dynamic Adjustments
You can adjust voice settings per call:
```javascript
await retell.call.createPhoneCall({
  // ... other params
  override_agent_id: AGENT_ID,
  // Future: May support per-call voice overrides
});
```

## Support Resources

- **Retell Documentation**: https://docs.retellai.com/api-references/create-agent
- **ElevenLabs Voice Settings**: https://elevenlabs.io/docs/voices/voice-settings
- **Your Test Scripts**: Use existing test infrastructure to validate voice quality

---

Last Updated: [Current Date]
Custom Voice ID: `lju5ySDHU1CyTvjMSghg`
