# Critical Fix: Phone Number Lookup for Inbound/Outbound Calls

## Issue Identified
The agent was using the wrong phone number when looking up customer orders:
- **Problem**: For outbound calls, the system was using the Retell phone number (+16198212984) instead of the customer's phone number (+16194587071)
- **Impact**: Customers couldn't be identified by their phone number, causing failed order lookups

## Root Cause
The code wasn't accounting for call direction when determining which phone number belongs to the customer:
- **Outbound calls**: `from_number` = Retell, `to_number` = Customer
- **Inbound calls**: `from_number` = Customer, `to_number` = Retell

## Fixes Applied

### 1. Order Context Endpoint (`/flow/order-context`)
Fixed the logic to correctly identify customer phone based on call direction:
```javascript
// Determine the customer's phone number based on call direction
const direction = callData?.direction || 'unknown';
let customerPhoneFromCall = null;

if (direction === 'outbound') {
  // Outbound: we called the customer, so customer is to_number
  customerPhoneFromCall = callData?.to_number;
} else if (direction === 'inbound') {
  // Inbound: customer called us, so customer is from_number
  customerPhoneFromCall = callData?.from_number;
}
```

### 2. Webhook Handler (Discount SMS)
Fixed the discount SMS sending logic to use correct customer phone:
```javascript
// Determine correct customer phone based on call direction
let customerPhoneFromCall = null;
if (data?.direction === 'outbound') {
  customerPhoneFromCall = data?.to_number;  // Customer is the recipient
} else if (data?.direction === 'inbound') {
  customerPhoneFromCall = data?.from_number;  // Customer is the caller
}
```

## Testing
Created test script: `test-phone-lookup-fix.js`
- Tests both inbound and outbound call scenarios
- Verifies correct phone number is used for each direction
- Run with: `node test-phone-lookup-fix.js`

## Deployment Instructions

### 1. Deploy to Railway (Production)
```bash
# Commit and push the changes
git add src/server.js
git commit -m "Fix: Use correct customer phone based on call direction for order lookups"
git push origin master
```

Railway will automatically deploy the changes.

### 2. Verify the Fix
After deployment, monitor the logs for the improved behavior:
- Look for "Outbound call detected, using to_number: [customer_phone]"
- Look for "Inbound call detected, using from_number: [customer_phone]"

### 3. Test with Real Calls
1. **Test Outbound Call**:
   ```bash
   node call-nicky-now.js
   ```
   - When asked about the order, the agent should now correctly find it using the customer's phone

2. **Test Inbound Call**:
   ```bash
   node test-inbound-call.js
   ```
   - Customer calling in should have their order found by their phone number

## Impact Summary
✅ **Fixed**: Order lookups now work correctly for both inbound and outbound calls
✅ **Fixed**: Discount SMS will be sent to the correct customer phone number
✅ **Maintained**: All existing functionality remains intact
✅ **Added**: Better logging to track which phone number is being used

## Call ID Reference
The issue was discovered in call: `call_0cf21086482d321a950080a7df8`
- Agent was using +16198212984 (Retell) instead of +16194587071 (Customer)
- This fix ensures the correct phone number is used based on call direction
