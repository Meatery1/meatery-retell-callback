# ⚠️ CRITICAL EMAIL REQUIREMENTS

## MANDATORY: Customer MUST Be CC'd

**This is a REQUIREMENT, not optional.** Every ticket sent to hello@themeatery.com MUST CC the customer.

## System Behavior

### When Customer Email IS Found:
1. ✅ Ticket sent to: hello@themeatery.com
2. ✅ Customer CC'd automatically
3. ✅ Agent confirms: "You'll receive a copy of this ticket at your email"
4. ✅ Normal priority (P2) ticket

### When Customer Email is NOT Found:
1. ⚠️ Ticket still sent to: hello@themeatery.com
2. ❌ Customer CANNOT be CC'd
3. 🔴 Email subject includes: "- NO CUSTOMER EMAIL"
4. 🔴 Email body has RED WARNING banner at top
5. 🔴 Priority elevated to P1 (HIGHEST)
6. 🔴 Agent asks: "To ensure you receive updates, can you please provide your email address?"

## Email Extraction Sources

The system attempts to find customer email from these Shopify fields (in order):
1. `order.customer.email` - Primary customer email
2. `order.email` - Order-level email
3. `order.contact_email` - Contact email field
4. `order.billing_address.email` - Billing address email

## Visual Indicators When Email Missing

### In Email Subject:
```
[Refund Request] Order #12345 - John Doe - NO CUSTOMER EMAIL
```

### In Email Body:
```html
<div style="background: #ffcccc; padding: 10px; border: 2px solid red;">
  <strong>⚠️ URGENT: Customer email missing - Cannot CC customer. 
  Please obtain email and communicate directly.</strong>
</div>
```

### In Customer Information:
```html
Email: ❌ MISSING - MUST OBTAIN
```

## Agent Flow for Missing Email

1. **Initial Request:** Customer asks for refund/replacement
2. **System Check:** No email found in Shopify
3. **Agent Response:** 
   - "I've filed a priority ticket with our support team for your [refund/replacement]."
   - "To ensure you receive updates, can you please provide your email address?"
4. **Customer Provides Email:** 
   - Agent calls `/flow/update-customer-email` endpoint
   - Email saved to Shopify order notes
   - Tagged with "email-collected"
5. **Confirmation:** "Perfect, I've got your email. You'll receive a confirmation of this ticket shortly."

## New Endpoint: Update Customer Email

```javascript
POST /flow/update-customer-email
{
  "order_number": "12345",
  "customer_email": "customer@example.com"
}
```

This endpoint:
- Validates email format
- Updates Shopify order notes
- Adds "email-collected" tag
- Returns confirmation for agent to speak

## Server Logs

### Success with Email:
```
✅ Replacement ticket emailed for order #12345
```

### Warning without Email:
```
❌ CRITICAL: No customer email found for order #12345 - Customer CANNOT be CC'd on ticket
⚠️ WARNING: No customer email for order #12345 - Cannot CC customer (REQUIRED)
✅ Replacement ticket emailed for order #12345
```

## Testing Commands

### Test with email (customer gets CC'd):
```bash
node test-email-tickets.js both customer@example.com "John Doe" 12345
```

### Test without email (triggers warnings):
```bash
node test-email-tickets.js both "" "John Doe" 12345
```

## Commslayer Team Action Required

When tickets arrive with "NO CUSTOMER EMAIL" in subject:
1. **IMMEDIATE ACTION:** Contact customer via phone
2. Obtain email address
3. Manually forward ticket confirmation to customer
4. Update Shopify with email for future reference

## Why This Matters

- **Legal Compliance:** Customer must have record of service requests
- **Transparency:** Customer needs confirmation of what was promised
- **Follow-up:** Customer needs to be in the loop on resolution
- **Trust:** Shows professionalism and accountability

## Summary

**NEVER** process a refund or replacement without ensuring the customer receives confirmation. If the system can't CC them automatically, the support team MUST manually ensure they get the information.
