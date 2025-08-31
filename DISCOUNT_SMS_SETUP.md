# 📱 Discount Code SMS Integration Setup

## Overview
This system allows your Retell AI agent to create Shopify discount codes and text them to customers in real-time during calls.

## 🚀 Features
- **Real-time discount generation** - Agent creates unique codes on demand
- **SMS delivery** - Codes texted instantly to customer's phone
- **Eligibility checking** - Prevents abuse by checking recent discount usage
- **Automatic tracking** - Discounts logged in Shopify order notes
- **Smart authorization** - Agent knows when to offer discounts

## 📋 Prerequisites

### 1. Shopify Admin API Access
You need a Shopify Admin API token with these permissions:
- `write_price_rules` - Create discount codes
- `write_discounts` - Manage discounts
- `read_customers` - Check customer history
- `write_orders` - Add notes to orders

### 2. Twilio Account
Sign up at [twilio.com](https://www.twilio.com) and get:
- Account SID
- Auth Token
- Phone number for sending SMS

### 3. Environment Variables
Add these to your `.env` file:

```bash
# Shopify Configuration
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxx

# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567

# Retell Configuration
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=agent_566475088bf8231175ddfb1899
```

## 🔧 Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Deploy your server:**
```bash
npm start
```

3. **Update webhook URL in Retell:**
Make sure your agent's webhook is set to:
```
https://your-server.com/webhooks/retell
```

## 💬 How It Works

### Agent Conversation Flow

1. **Customer asks for discount:**
   - Customer: "Do you have any discounts?"
   - Agent: "Since you're a valued customer, I can text you a 10% off code. Can you confirm your phone number?"

2. **Service recovery scenario:**
   - Customer: "My steak wasn't frozen"
   - Agent: "I'm sorry about that. Let me make this right with a 10% discount code..."

3. **Agent sends the code:**
   - Agent confirms phone number
   - Sets internal flag: `send_discount_sms=true`
   - Webhook triggers SMS sending
   - Customer receives text within seconds

### Discount Code Format
```
MEATERY10OFFABC123
```
- Prefix: MEATERY
- Value: 10OFF
- Unique suffix: ABC123

### SMS Message Template
```
Hi [Name]! Thanks for being a valued Meatery customer. 
Here's your exclusive 10% off discount code: MEATERY10OFFABC123

Shop now: https://themeatery.com/discount/MEATERY10OFFABC123

Code expires in 30 days. Enjoy your premium meats! 🥩
```

## 🛡️ Security Features

### Eligibility Checking
System checks:
- Recent discount usage (last 30 days)
- Customer purchase history
- Total spend amount

### Discount Tiers (Capped at 15%)
- Standard customers: 10% off (default)
- Valued customers ($500+ spent): 12% off
- VIP customers ($1000+ spent): 15% off (maximum)
- Service recovery: 10-15% based on severity

### Abuse Prevention
- One-time use codes
- 30-day expiration
- Customer-specific tracking
- Rate limiting

## 📊 Tracking & Analytics

### Shopify Order Notes
Automatically added:
```
Discount sent via SMS: MEATERY10OFFABC123 (10% off)
```

### Post-Call Analysis
Tracks:
- `send_discount_sms`: Whether discount was offered
- `discount_value`: Percentage given (10, 15, 20)
- `discount_reason`: Why it was offered
- `customer_phone`: Where SMS was sent

## 🎯 Agent Authorization

The agent is authorized to offer discounts for:
1. **Service recovery** - When there's a problem with the order
2. **Customer retention** - When customer threatens to cancel
3. **Direct requests** - When customer asks for a discount
4. **Valued customers** - As a thank you (use sparingly)

## 🧪 Testing

### Test the SMS endpoint:
```bash
curl -X POST http://localhost:3000/tools/send-discount \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "5551234567",
    "customer_name": "Test Customer",
    "discount_value": 10,
    "reason": "testing"
  }'
```

### Test eligibility check:
```bash
curl -X POST http://localhost:3000/tools/check-discount-eligibility \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "5551234567"
  }'
```

## 🐛 Troubleshooting

### SMS not sending:
1. Check Twilio credentials in `.env`
2. Verify phone number format (+1 for US)
3. Check Twilio account balance
4. Review server logs for errors

### Discount code errors:
1. Verify Shopify API permissions
2. Check for duplicate code conflicts
3. Ensure price rule creation succeeded
4. Review Shopify API version compatibility

### Agent not offering discounts:
1. Check agent prompt includes discount instructions
2. Verify webhook is receiving calls
3. Check post-call analysis fields
4. Review transcript for trigger phrases

## 📝 Customization

### Modify discount values:
Edit in `discount-sms-service.js`:
```javascript
discountValue: 15  // Change from 10% to 15%
```

### Change expiration period:
```javascript
expiresInDays: 60  // Change from 30 to 60 days
```

### Customize SMS message:
Edit the message template in `sendDiscountSMS()` function

## 🚀 Production Checklist

- [ ] Twilio account funded and verified
- [ ] Shopify API credentials secured
- [ ] Environment variables set
- [ ] Webhook URL configured in Retell
- [ ] Agent prompt updated with discount flow
- [ ] Test SMS successfully sent
- [ ] Discount code created in Shopify
- [ ] Order notes updating correctly
- [ ] Rate limiting configured
- [ ] Error handling tested

## 📞 Support

For issues or questions:
1. Check server logs: `npm run dev`
2. Review Retell webhook responses
3. Verify Twilio SMS logs
4. Check Shopify discount codes admin

---

**Note:** Always test in development before deploying to production!
