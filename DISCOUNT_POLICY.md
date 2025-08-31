# 💰 The Meatery Discount Policy

## Quick Reference Card

### 🎯 Discount Tiers
| Customer Type | Spend History | Discount | When to Offer |
|--------------|---------------|----------|---------------|
| **Standard** | < $500 | **10%** | Default for all requests |
| **Valued** | $500 - $999 | **12%** | Automatic upgrade based on history |
| **VIP** | $1000+ | **15%** | Maximum discount (hard cap) |

### 🔧 Service Recovery
| Issue Severity | Discount | Examples |
|---------------|----------|----------|
| **Minor** | 10% | Slight delay, minor packaging issue |
| **Moderate** | 12% | One item not frozen, small quality concern |
| **Severe** | 15% (MAX) | Multiple items affected, major quality issue |

## 📋 Agent Instructions

### Starting Position
- **ALWAYS start with 10%** unless customer is VIP
- **NEVER exceed 15%** under any circumstances
- Check customer history before offering higher tiers

### Conversation Examples

**Standard Customer Request:**
> Customer: "Do you have any discounts?"  
> Agent: "I can text you a **10% off** code for your next order."

**VIP Customer (Agent sees $1000+ history):**
> Customer: "I'm a regular customer, any discounts?"  
> Agent: "As one of our VIP customers, I can offer you our maximum **15% discount**."

**Service Recovery - Minor Issue:**
> Customer: "My order was a day late"  
> Agent: "I apologize for that. Let me text you a **10% off** code to make it right."

**Service Recovery - Severe Issue:**
> Customer: "Half my order was spoiled!"  
> Agent: "I'm so sorry! I'll send you our maximum **15% discount** plus arrange a replacement."

## 🛡️ Protection Mechanisms

### Hard Caps in Place
1. **Agent Prompt** - Explicitly states 10% start, 15% max
2. **Discount Service** - Automatically caps at 15%
3. **API Endpoint** - Enforces 15% maximum
4. **Webhook Handler** - Double-checks and caps at 15%

### Eligibility Checks
- **Recent Usage** - Blocks if discount used in last 30 days
- **Customer History** - Verifies purchase history for tier placement
- **Automatic Upgrade** - System suggests appropriate tier

## 📊 Business Logic

### Why These Tiers?
- **10% Standard** - Sustainable for business, meaningful for customers
- **12% Valued** - Rewards loyalty without excessive cost
- **15% Maximum** - Protects margins while showing appreciation

### Cost Impact
| Discount | On $100 Order | On $200 Order | On $500 Order |
|----------|--------------|---------------|---------------|
| 10% | Save $10 | Save $20 | Save $50 |
| 12% | Save $12 | Save $24 | Save $60 |
| 15% | Save $15 | Save $30 | Save $75 |

## ⚠️ Important Rules

### Never Offer
- ❌ More than 15% discount
- ❌ Multiple discounts to same customer within 30 days
- ❌ Discounts without phone number confirmation
- ❌ "Stackable" or combinable discounts

### Always Do
- ✅ Start at 10% for new requests
- ✅ Confirm phone number before sending
- ✅ Mention 30-day expiration
- ✅ Log reason for discount

## 🔍 Monitoring

### Track These Metrics
- Average discount given (should be ~10-11%)
- % of calls resulting in discount
- Redemption rate of sent codes
- Customer satisfaction after discount

### Red Flags
- Average discount > 12% (too generous)
- Same customer requesting repeatedly
- Unusually high discount requests
- Agent offering 15% as standard

## 📝 Quick Decision Tree

```
Customer asks for discount?
├─ New/Standard customer → 10%
├─ Valued customer ($500+) → 12%
├─ VIP customer ($1000+) → 15%
└─ Recent discount used → Politely decline

Service issue?
├─ Minor → 10%
├─ Moderate → 12%
└─ Severe → 15% (maximum)
```

---

**Remember:** The goal is customer satisfaction while protecting business margins. Start conservatively at 10% and only escalate when justified by customer value or issue severity.
