# The Meatery Abandoned Checkout Recovery System

## Overview

This system uses **Grace**, a specialized AI agent, to recover abandoned checkouts through strategic outbound calls. The agent combines psychological techniques with discount strategies to maximize conversion rates.

## 🎯 Key Features

- **Grace Agent**: Specialized for abandoned checkout recovery (not Nick)
- **Strategic Psychology**: "Was something wrong with the website?" approach
- **Smart Discounting**: Tiered discounts based on customer history
- **Recovery Cart Links**: SMS with discounted cart links (24-hour expiration)
- **Customer Filtering**: Avoids calling recent successful buyers

## 🚀 Quick Start

### 1. Test the Agent
```bash
# Test a single call
node test-abandoned-checkout-agent.js

# Test batch processing
node place-abandoned-checkout-call.js batch 24 50 5
```

### 2. API Endpoints
```bash
# Process abandoned checkouts
curl -X POST http://localhost:3000/call/abandoned-checkout \
  -H "Content-Type: application/json" \
  -d '{"hours": 24, "minValue": 50, "maxCalls": 5}'

# Single abandoned checkout call
curl -X POST http://localhost:3000/call/abandoned-checkout/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "6194587071",
    "customerName": "John",
    "itemsSummary": "2x Wagyu Ribeye, 1x Bacon",
    "totalPrice": 189.99,
    "currency": "USD"
  }'
```

## 🎭 Grace Agent Details

### Agent ID
- **ID**: `agent_e2636fcbe1c89a7f6bd0731e11`
- **Voice**: Grace (11labs-Grace)
- **Specialty**: Abandoned checkout recovery
- **Personality**: Strategic, confident, helpful

### Key Psychological Techniques

#### 1. Website Difficulty Questioning
**When**: Customer seems hesitant or says "just browsing"
**Technique**: "Was something wrong with the website? Sometimes people run into issues with the checkout process..."
**Why it works**: Implies their cart was perfect, only technical issues would prevent purchase

#### 2. Strategic Discounting
**New customers**: 10-12% (encourage trial)
**Return customers**: 8-10% (reward interest)  
**Recent customers**: 0-8% (avoid cannibalization)
**Urgency**: "Expires in one day"

#### 3. Recovery Cart Links
- SMS with discounted cart link
- 24-hour expiration
- One-click completion
- Automatic discount application

## 📊 Call Flow Examples

### Successful Recovery
**Grace**: "Hey John, it's Grace from The Meatery. I noticed you were looking at 2x Wagyu Ribeye, 1x Kurobuta Bacon on our site earlier - did you have any questions about those cuts?"

**Customer**: "Oh yeah, I was looking at that! The ribeye looked amazing but I wasn't sure about the price."

**Grace**: "I hear you! Let me check what I can do to help make this work for you... I can offer you a 12% discount on that order. That'll save you about $23 on those steaks and bacon. Here's the thing though - this discount link expires in one day, so you'll want to use it soon if you're interested."

### Website Difficulty Approach
**Customer**: "I was just looking around."

**Grace**: "Got it. Was something wrong with the website? Sometimes people run into issues with the checkout process or have trouble finding what they're looking for."

**Customer**: "No, it was fine. I just wasn't ready."

**Grace**: "Ah, I see. Well, you had some really nice cuts picked out there. That A5 Wagyu ribeye is one of our bestsellers. Since you had such good taste in picking that out, I can send you a special offer - a recovery link with a discount, but it expires in one day. Want me to send that over?"

## 🔧 Technical Implementation

### Files Created
- `src/abandoned-checkout-service.js` - Core service functions
- `place-abandoned-checkout-call.js` - Call placement script
- `test-abandoned-checkout-agent.js` - Testing script
- Server endpoints in `src/server.js`

### Environment Variables Required
```bash
RETELL_API_KEY=your_retell_api_key
RETELL_FROM_NUMBER=+16198212984
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=your_admin_token
```

### Shopify Integration
- Fetches abandoned checkouts via Admin API
- Filters by minimum value and phone availability
- Checks customer history to avoid repeat calls
- Generates recovery cart links with discounts

## 📈 Success Metrics

### Key Performance Indicators
- **Recovery Rate**: Target 15-25%
- **Discount Acceptance**: Track by tier
- **Time to Conversion**: After discount offer
- **Customer Satisfaction**: 4.5+ stars
- **Repeat Purchase Rate**: 60%+ after recovery

### Tracking
- Call outcomes logged in server
- Customer responses recorded
- Discount usage tracked
- Conversion rates monitored

## 🎯 Best Practices

### 1. Timing
- Call within 24-48 hours of abandonment
- Respect calling windows (9 AM - 7:30 PM PST)
- Avoid weekends for initial calls

### 2. Personalization
- Reference specific cart items
- Use customer's first name
- Mention total value
- Acknowledge their taste

### 3. Discount Strategy
- Start with lower offers
- Increase based on response
- Always include urgency
- Never exceed 15%

### 4. Follow-up
- Send recovery link immediately
- Follow up with SMS if needed
- Track link usage
- Monitor conversion

## 🚨 Troubleshooting

### Common Issues

#### Agent Not Responding
- Check agent ID is correct
- Verify Retell API key
- Ensure calling window is open

#### Calls Not Placing
- Check phone number format
- Verify customer eligibility
- Check rate limiting

#### Shopify Integration Issues
- Verify admin token permissions
- Check store domain
- Ensure API version compatibility

### Debug Commands
```bash
# Check agent status
curl -X GET "https://api.retellai.com/agent/agent_e2636fcbe1c89a7f6bd0731e11" \
  -H "Authorization: Bearer $RETELL_API_KEY"

# Test single call
node test-abandoned-checkout-agent.js

# Check server logs
tail -f logs/server.log
```

## 🔮 Future Enhancements

### Planned Features
- **A/B Testing**: Different discount strategies
- **Predictive Analytics**: Customer behavior modeling
- **Multi-channel Recovery**: Email + SMS + Phone
- **Dynamic Pricing**: Real-time discount optimization
- **Customer Segmentation**: Personalized approaches

### Integration Opportunities
- **Shopify Flow**: Automated triggers
- **Klaviyo**: Email sequence integration
- **Zapier**: Workflow automation
- **Analytics**: Conversion tracking

## 📞 Support

### Getting Help
- Check server logs for errors
- Verify environment variables
- Test with single call first
- Monitor agent performance

### Contact
- Technical issues: Check server logs
- Agent behavior: Review prompt in Retell
- Integration problems: Verify Shopify setup

---

**Remember**: Grace is designed to be confident, helpful, and strategic - not pushy. The goal is to make customers feel like they're getting a special deal for having good taste, not like you're desperate to make a sale.
