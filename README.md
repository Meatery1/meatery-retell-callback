# 🥩 The Meatery Post-Delivery Concierge

An intelligent Retell AI agent that checks on customer orders, handles issues, and can send discount codes via SMS.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Start server
npm start

# Test discount system
npm run test-discount 5551234567 "Customer Name"
```

## 📱 Features

- **Smart Follow-ups** - Calls customers after delivery to ensure satisfaction
- **Issue Resolution** - Handles problems with replacements or refunds
- **Instant Discounts** - Creates and texts Shopify discount codes in real-time
- **Cooking Tips** - Provides expert advice for different cuts of meat
- **Self-Improving** - Learns from every call to get better

## 💰 Discount Policy

| Customer Tier | Spend History | Discount | 
|--------------|---------------|----------|
| Standard | < $500 | 10% |
| Valued | $500-999 | 12% |
| VIP | $1000+ | 15% (MAX) |

**Hard cap at 15%** - System enforces this at multiple levels

## 🛡️ Safety Features

- **Adversarial Protection** - Filters manipulation attempts
- **Anomaly Detection** - Blocks coordinated attacks
- **Content Validation** - Prevents harmful responses
- **Core Behavior Lock** - Essential functions cannot be modified
- **Discount Cap** - Maximum 15% discount enforced

## 📞 Agent Configuration

**Production Agent ID:** `agent_566475088bf8231175ddfb1899`

### Key Behaviors:
- Never repeats greeting
- Detects voicemail
- Starts discounts at 10%
- Maximum discount 15%
- Texts codes instantly

## 🔧 Environment Variables

```bash
# Retell AI
RETELL_API_KEY=your_key
RETELL_AGENT_ID=agent_566475088bf8231175ddfb1899
RETELL_FROM_NUMBER=+15551234567

# Shopify
SHOPIFY_STORE_DOMAIN=store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxx

# Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+15559876543

# OpenAI (Improvements)
OPENAI_API_KEY=sk-xxxxx
```

## 📁 Project Structure

```
├── src/
│   ├── server.js                 # Main server
│   ├── discount-sms-service.js   # Discount & SMS logic
│   ├── prompt-improvement-loop.js # AI self-improvement
│   └── agent-prompt.md           # Agent instructions
├── data/
│   └── dnc.json                  # Do-not-call list
├── improvement-logs/             # Prompt change history
└── public/
    └── index.html               # Web interface
```

## 🧪 Testing

```bash
# Test discount eligibility and SMS
npm run test-discount 5551234567 "John Doe"

# Run improvement analysis
npm run improve

# Start improvement scheduler (daily)
npm run scheduler
```

## 📊 Monitoring

### Key Metrics:
- Success rate of calls
- Average discount given (~10-11%)
- SMS delivery rate
- Discount redemption rate

### Logs:
- `calls.jsonl` - All call records
- `improvement-logs/` - Prompt changes
- Server console - Real-time activity

## 🚨 Troubleshooting

### SMS Not Sending:
1. Check Twilio credentials
2. Verify phone format (+1 prefix)
3. Check Twilio balance

### Discount Errors:
1. Verify Shopify API token
2. Check API permissions
3. Review duplicate code conflicts

### Agent Issues:
1. Check webhook URL in Retell
2. Verify agent ID matches
3. Review recent prompt changes

## 📝 Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with auto-reload |
| `npm run improve` | Run prompt improvement |
| `npm run approve` | Review pending changes |
| `npm run scheduler` | Start daily improvements |
| `npm run test-discount` | Test discount system |

## 🔐 Security

- API keys in environment variables only
- Discount cap enforced at multiple levels
- Adversarial input filtering
- Rate limiting on improvements
- Audit trail for all changes

## 📈 Performance

- Handles 100+ calls/hour
- SMS delivery < 2 seconds
- Discount creation < 1 second
- 99.9% uptime target

## 🤝 Support

For issues:
1. Check logs in `improvement-logs/`
2. Review `calls.jsonl` for patterns
3. Test with `npm run test-discount`
4. Check Retell webhook responses

---

Built with ❤️ for The Meatery by [Your Team]