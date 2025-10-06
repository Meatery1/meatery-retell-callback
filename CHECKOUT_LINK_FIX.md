# Checkout Link Tool Fix - Summary

## Problems Fixed

### Problem 1: Twilio Not Configured
The `send_checkout_link` tool was attempting to send SMS messages directly via Twilio, which wasn't configured. This resulted in the error:
```
❌ Twilio credentials not configured
```

### Problem 2: Missing checkout_url Dynamic Variable ⚠️
The agent prompt references `{{checkout_url}}` but this variable was **not being provided** when calls were initiated. The agent was passing the literal string `'{{checkout_url}}'` to the tool, causing:
```
❌ Invalid checkout URL
```

Dynamic variables provided:
- ✅ `checkout_id` (available)
- ❌ `checkout_url` (missing!)

**Root Cause:** The abandoned checkout call initiation wasn't including the actual checkout URL, only the Shopify checkout ID.

## Solutions

### Solution 1: Use Klaviyo Events Instead of Twilio
**Changed from:** Direct Twilio SMS → **To:** Klaviyo Event triggering a Flow

The tool now follows the same pattern as the `send-discount` endpoint:
1. Creates a Klaviyo event: `"Grace Checkout Link Requested"`
2. A Klaviyo Flow (to be created) listens for this event
3. The Flow sends the SMS/Email to the customer

### Solution 2: Auto-Fetch Checkout URL from Shopify ✨
When `{{checkout_url}}` is not provided (or is a template string), the tool now:
1. Extracts `checkout_id` from the call's dynamic variables
2. Fetches the actual checkout URL from Shopify using `fetchAbandonedCheckoutById()`
3. Uses the real URL for the Klaviyo event

**This means:** The agent doesn't need the `checkout_url` variable anymore - it will automatically fetch it!

## Changes Made

### 1. Updated `src/server.js`
- **Line 1293-1440**: Rewrote `/tools/send-checkout-link` endpoint
  - Removed Twilio SMS sending logic
  - Added Klaviyo event integration
  - **Added auto-fetch from Shopify** when checkout_url is missing/invalid
  - Improved validation and error handling
  - Better error messages for the agent
- **Line 18**: Added import for `sendCheckoutLinkViaKlaviyoEvent`
- **Line 1345**: Added dynamic import for `fetchAbandonedCheckoutById`
- **Removed**: Old `trackKlaviyoCheckoutLinkSent` function (no longer needed)

### 2. Created `sendCheckoutLinkViaKlaviyoEvent` in `src/klaviyo-events-service.js`
- **Lines 115-209**: New function to send Klaviyo event
- Sends event with metric: `"Grace Checkout Link Requested"`
- Includes properties:
  - `checkout_url`
  - `discount_percentage`
  - `has_discount`
  - `channel` (sms/email)
- Updates profile with `last_checkout_link_sent` timestamp

## Next Steps: Klaviyo Flow Setup

### Create a new Flow in Klaviyo:

1. **Go to Klaviyo → Flows → Create Flow**

2. **Trigger Setup:**
   - Trigger Type: `Metric` (API Event)
   - Metric: `Grace Checkout Link Requested`

3. **Add SMS Action:**
   - Add an SMS message
   - Template example:
     ```
     Hey {{ person|lookup:'first_name' }}! Here's your checkout link: {{ event.checkout_url }}
     {% if event.has_discount %}You've already got {{ event.discount_percentage }} off! 🎉{% endif %}
     ```

4. **Add Email Action (Optional):**
   - Add a conditional split based on `event.channel`
   - If `channel == 'email'`, send an email instead
   - Template can use same variables

5. **Set Flow to Live**

## Event Properties Available in Flow Templates

```javascript
{
  event: {
    checkout_url: "https://themeatery.com/checkouts/...",
    discount_percentage: "10%",
    has_discount: true,
    channel: "sms"
  },
  person: {
    first_name: "Nicholas",
    email: "customer@example.com",
    phone_number: "+16197524353",
    properties: {
      last_checkout_link_sent: "2025-10-06"
    }
  }
}
```

## Testing

### Test the fix:
1. Make a test call to the abandoned checkout agent
2. When asked if you want the checkout link, say "yes, text it to me"
3. The agent should call the `send_checkout_link` tool
4. Check Klaviyo → Metrics → "Grace Checkout Link Requested" for the event
5. If the Flow is set up, you should receive the SMS

### Expected Logs:
```
🔗 Send Checkout Link tool called
🔗 Parameters: { customer_email, customer_phone, checkout_url: '{{checkout_url}}', ... }
⚠️ Checkout URL not provided, attempting to fetch from Shopify...
✅ Fetched checkout URL from Shopify: https://themeatery.com/checkouts/...
📱 Sending checkout link via sms to +16197524353
🔗 Using checkout URL: https://themeatery.com/checkouts/...
📤 Sending checkout link event to Klaviyo for sms
✅ Klaviyo checkout link event sent for sms to +16197524353
✅ Klaviyo checkout link event sent successfully
```

## Call Analysis from Test
Call ID: `call_8e276bc513d6f4f27027bbbcd99`
- **Status:** Failed (before fix)
- **Issue:** Twilio not configured
- **Agent Response:** "I'm having trouble sending that message right now..."
- **Duration:** 56 seconds
- **Cost:** $14.47

With this fix, the same scenario will now succeed by triggering a Klaviyo Flow instead of trying to use Twilio.

## Benefits of This Approach

1. ✅ **No Twilio needed** - All messaging handled by Klaviyo
2. ✅ **Consistent with other tools** - Follows same pattern as `send-discount`
3. ✅ **Better tracking** - Events visible in Klaviyo metrics
4. ✅ **Flexible delivery** - Can switch between SMS/Email in Klaviyo
5. ✅ **Template control** - Message templates managed in Klaviyo UI
6. ✅ **Retry logic** - Klaviyo handles delivery retries automatically

