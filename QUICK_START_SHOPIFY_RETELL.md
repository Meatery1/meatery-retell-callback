# 🚀 Quick Start: Connect Shopify to Retell AI

## What You Already Have ✅
Your server (`src/server.js`) is already set up with:
- Shopify API integration 
- Order lookup endpoints
- Customer data endpoints
- Discount code generation
- SMS sending capability

## What You Need to Do 📋

### 1. Set Environment Variables (2 min)
Add these to your `.env` file if not already present:
```env
# Shopify (get from Shopify Admin → Apps → Your App)
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxx

# Your server URL (ngrok, Railway, etc)
PUBLIC_BASE_URL=https://your-server-url.com
```

### 2. Run the Setup Script (5 min)
```bash
# Install dependencies if needed
npm install retell-sdk

# Run the automated setup
node setup-shopify-retell.js
```

This script will:
- ✅ Verify your Shopify connection
- ✅ Add 6 custom tools to your Retell LLM
- ✅ Create a test web call for verification

### 3. Update Your Agent Prompt (2 min)
Add the contents of `shopify-agent-prompt-addon.md` to your Retell agent's prompt in the Retell dashboard.

### 4. Test It Out! 🧪
The setup script creates a test web call. Try these:
- "What did I order?"
- "My meat was spoiled"
- "Can I get a discount?"
- "I need a replacement"

## How It Works 🔧

When a call starts:
1. **Your server** passes order info to Retell via dynamic variables
2. **Retell agent** can call your server's endpoints to:
   - Look up orders (`get_order_details`)
   - Check customer history (`lookup_customer_orders`)
   - Save feedback to Shopify (`save_customer_feedback`)
   - Send discount codes via SMS (`send_discount_code`)
   - Request replacements (`request_replacement`)
3. **Shopify** gets updated in real-time with tags, notes, and customer feedback

## The Data Flow
```
Call Starts → Dynamic Variables → Retell Agent
                                       ↓
                                  Custom Tools
                                       ↓
                                  Your Server
                                       ↓
                                  Shopify API
                                       ↓
                         Real-time Updates to Orders
```

## Files Created for You
1. **`setup-shopify-retell.js`** - Automated setup script
2. **`SHOPIFY_RETELL_INTEGRATION.md`** - Complete documentation
3. **`shopify-agent-prompt-addon.md`** - Prompt instructions for your agent
4. **`QUICK_START_SHOPIFY_RETELL.md`** - This file

## Troubleshooting 🔍

**"Order not found"**
- Check order number format (try with and without #)
- Verify order exists in Shopify
- Check date range in query

**Tools not working**
- Ensure PUBLIC_BASE_URL is accessible from internet
- Check server is running (`npm start`)
- Verify Retell can reach your endpoints

**No SMS received**
- Check Twilio credentials in `.env`
- Verify phone number format
- Check discount eligibility (may be blocked if recently used)

## Monitor Everything 📊
- **Call logs:** `GET /calls/recent-log`
- **Shopify orders:** Check order notes and tags in Shopify admin
- **Discount usage:** Track in Shopify discount codes section

## Need Help?
1. Check server logs for detailed errors
2. Test endpoints manually: `curl ${PUBLIC_BASE_URL}/health`
3. Verify webhooks are received: Check `/webhooks/retell` logs

---

**Ready to go!** Your Retell agent now has full access to Shopify data and can provide personalized customer service based on real order information. 🎉
