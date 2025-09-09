# Current Offer Settings - The Meatery Win-Back Campaign

## Offer Details
- **Discount**: 20% off (changed from 30%)
- **Minimum Order**: $200 required
- **Validity**: Today only (creates urgency)
- **Target**: Customers who haven't ordered in 90+ days

## How It's Presented

### Opening Pitch:
"As one of our valued customers, I'm authorized to offer you 20% off your entire order when you stock up with $200 or more."

### Value Framing:
- "Stock up and save" - positions as smart bulk buying
- "Fill your freezer" - practical benefit
- "Quarterly stock-up" - suggests regular pattern
- "$40-50 savings" - concrete value on $200+ order
- "3-4 premium steaks" - tangible quantity reference

## Product Pricing Examples (with 20% discount):
- **A5 Wagyu Ribeye** (14-16 oz): $130 → $104 
- **Prime Ribeye**: $45-60 → $36-48
- **Dry-Aged NY Strip**: $55 → $44
- **Ground Beef/Burgers**: Lower price points to help reach $200

## Objection Handling

### "$200 is too much":
- Emphasize freezer storage (6+ months)
- Suggest splitting with friends/family
- Mention quarterly shopping pattern
- Highlight everyday items + special occasion mix

### "I don't need that much meat":
- Flash-frozen at -40°F keeps for months
- Plan ahead for summer grilling/holidays
- Mix everyday and premium items

### "Just want one item":
- Acknowledge $200 minimum is for exclusive discount
- Can order individual items at regular price online
- This is special offer for best customers

## Tools Configuration
When agent calls tools:
- `send_discount_code`: Will send 20% off code with $200 minimum
- `send_winback_draft_order`: Creates cart with 20% off, $200 minimum
- `get_customer_order_history`: Fetches real Shopify data to personalize

## Key Rules
1. ALWAYS mention both 20% discount AND $200 minimum together
2. Frame positively (stock up opportunity, not restriction)
3. Use knowledge bases to suggest product combinations
4. Help customers build orders to reach $200
5. Be transparent about the requirements

## Dynamic Variables
- discount_value: "20"
- minimum_order: "200"

## Note for Testing
Make sure your webhook server (dashboard.themeatery.com) is configured to:
- Apply 20% discount (not 30%)
- Enforce $200 minimum on discount codes
- Reject orders under $200 for this promotion
