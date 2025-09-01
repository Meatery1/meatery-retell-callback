# 🎙️ Setup Your Custom ElevenLabs Voice with Retell

## Current Status
Your custom voice ID (`lju5ySDHU1CyTvjMSghg`) cannot be used directly with Retell. You need to import it through the Retell Dashboard first.

## ✅ Solution: Import Voice Through Retell Dashboard

### Step 1: Go to Retell Dashboard
1. Open https://dashboard.retellai.com
2. Log in to your account

### Step 2: Navigate to Voice Library
1. Look for **"Voices"** or **"Voice Library"** in the sidebar
2. Or go directly to: https://dashboard.retellai.com/voices

### Step 3: Import Your Custom Voice
1. Click **"Import Custom Voice"** or **"Add Voice"** button
2. Select **"ElevenLabs"** as the provider
3. You'll be asked to either:
   - Connect your ElevenLabs account (OAuth)
   - Or provide your ElevenLabs API key

### Step 4: Find Your Cloned Voice
1. Once connected, you'll see a list of your ElevenLabs voices
2. Look for your custom voice (it might show the voice name you gave it in ElevenLabs)
3. The voice ID `lju5ySDHU1CyTvjMSghg` should be visible
4. Click **"Import"** or **"Add to Library"**

### Step 5: Get the Retell Voice ID
1. After importing, Retell will show the voice in your library
2. It will have a new Retell-specific ID (might look like `retell_custom_xxxxx` or similar)
3. Copy this new ID

### Step 6: Update Your Agent
Once you have the Retell voice ID, update your agent:

```javascript
// Update your agent with the new voice ID from Retell
await retell.agent.update('agent_2f7a3254099b872da193df3133', {
  voice_id: 'YOUR_NEW_RETELL_VOICE_ID_HERE',
  voice_model: 'eleven_turbo_v2_5'
});
```

## 🔧 Alternative: Direct API Integration

If Retell supports direct ElevenLabs API integration:

### 1. Get Your ElevenLabs API Key
1. Go to https://elevenlabs.io
2. Navigate to Profile → API Keys
3. Copy your API key

### 2. Add to Your .env File
```bash
# Add this line to your .env file
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=lju5ySDHU1CyTvjMSghg
```

### 3. Contact Retell Support
Send them this message:
```
Hi, I'm trying to use a custom ElevenLabs cloned voice with my Retell agent.

Details:
- ElevenLabs Voice ID: lju5ySDHU1CyTvjMSghg
- Retell Agent ID: agent_2f7a3254099b872da193df3133
- Current Voice: 11labs-Brian (working fine)

How can I import and use my custom cloned voice? Do I need to connect my ElevenLabs account through the dashboard or is there an API method?
```

## 📞 Quick Test Once Connected

After you've imported the voice and have the new ID:

```bash
# Update the voice ID in this command
node -e "
import Retell from 'retell-sdk';
import dotenv from 'dotenv';
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

retell.agent.update('agent_2f7a3254099b872da193df3133', {
  voice_id: 'YOUR_NEW_VOICE_ID_HERE',
  voice_model: 'eleven_turbo_v2_5'
}).then(agent => {
  console.log('✅ Voice updated to:', agent.voice_id);
}).catch(err => {
  console.error('❌ Failed:', err.message);
});
"
```

## 🎯 Current Workaround

While setting up the custom voice, you're using:
- **Voice**: `11labs-Brian`
- **Model**: `eleven_turbo_v2_5`
- **Settings**: Temperature 0.5, Speed 1.08

These settings are working well for your "Nick from The Meatery" persona.

## 📧 Support Contacts

**Retell Support**
- Email: support@retellai.com
- Discord: https://discord.gg/retell
- Docs: https://docs.retellai.com

**ElevenLabs Support**
- Email: support@elevenlabs.io
- Docs: https://elevenlabs.io/docs

## 🔍 What to Look For in Retell Dashboard

When you log into Retell, look for these sections:
1. **Integrations** - Where you connect external services
2. **Voice Library** or **Voices** - Where you manage voices
3. **Settings** → **Connected Accounts** - Where API connections are managed

The custom voice import feature is relatively new, so it might be under a "Beta" or "Labs" section.

---

**Your Voice ID**: `lju5ySDHU1CyTvjMSghg`
**Status**: Needs to be imported through Retell Dashboard
**Next Step**: Log into https://dashboard.retellai.com and look for voice import options
