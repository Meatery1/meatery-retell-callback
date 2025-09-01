# Outbound Call Fix Documentation

## Problem Identified
The agent was saying "How can I help you?" on outbound calls instead of checking on the order directly.

## Root Causes
1. **Missing Dynamic Variables**: Calls weren't passing `customer_name` and `order_number` 
2. **Prompt Issue**: The prompt had conflicting instructions for inbound vs outbound
3. **Tool Context**: The order lookup tool couldn't find orders without proper variables

## Solution Applied

### 1. Updated LLM Prompt (via MCP)
```
OUTBOUND CALLS:
- Wait for customer to say hello
- Then say: "Hey {{customer_name}}, it's Nick from The Meatery. Just checking on your order {{order_number}} - everything arrive cold and sealed up okay?"
- NEVER ask "How can I help you?" on outbound calls
```

### 2. Pass Dynamic Variables
When creating phone calls, ALWAYS include:
```javascript
retell_llm_dynamic_variables: {
  customer_name: "Nicky",        // Or "there" if unknown
  order_number: "42507",          // Or "(your recent order)"
  customer_phone: "6194587071"   // For order lookups
}
```

### 3. Include Metadata
Also pass metadata for webhook/tool access:
```javascript
metadata: {
  customer_phone: "6194587071",
  order_number: "42507",
  customer_name: "Nicky"
}
```

## Usage

### Quick Test Call
```bash
# With all info
node place-outbound-call.js 6194587071 Nicky 42507

# Just phone (will use defaults)
node place-outbound-call.js 6194587071
```

### Via MCP in Claude
```javascript
mcp_retellai-mcp-server_create_phone_call({
  fromNumber: "+16198212984",
  toNumber: "+16194587071",
  overrideAgentId: "agent_2f7a3254099b872da193df3133",
  retellLlmDynamicVariables: {
    customer_name: "Nicky",
    order_number: "42507",
    customer_phone: "6194587071"
  },
  metadata: {
    customer_phone: "6194587071",
    order_number: "42507"
  }
})
```

## Verification
After placing a call, verify it worked:
```bash
# Get call details
node analyze-single-call.js call_554e3de58767bee79e9f3c1f946
```

## Key Lessons
1. **Always pass context**: Dynamic variables are critical for personalized openings
2. **Test with real data**: Use actual order numbers and customer names
3. **Monitor transcripts**: Check that the agent uses the right opening
4. **Metadata matters**: Tools need metadata to look up orders

## Agent IDs
- **Agent**: `agent_2f7a3254099b872da193df3133` (Meatery Nick - Outbound)
- **LLM**: `llm_7eed186989d2fba11fa1f9395bc7` (v8 with fixes)
- **Phone**: `+16198212984` (Retell number)
