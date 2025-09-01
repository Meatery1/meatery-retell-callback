#!/usr/bin/env node
/**
 * Update Retell LLM with custom tools for email handling
 */

import Retell from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY || 'key_42150ad5cbb0561880ed5ee14165' });

const LLM_ID = 'llm_7eed186989d2fba11fa1f9395bc7';
const BASE_URL = 'https://nodejs-s-fb-production.up.railway.app';

async function updateLLMTools() {
  console.log('🔧 Updating Retell LLM with custom tools...\n');

  const tools = [
    {
      type: 'custom',
      name: 'get_order_details',
      description: 'Look up order information including customer email, items, and delivery status',
      speak_after_execution: false,
      speak_during_execution: true,
      url: `${BASE_URL}/flow/order-context`
    },
    {
      type: 'custom',
      name: 'request_replacement',
      description: 'File a ticket for product replacement. Automatically checks for customer email and asks only if missing.',
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${BASE_URL}/flow/request-replacement`
    },
    {
      type: 'custom',
      name: 'request_refund',
      description: 'File a ticket for refund. Automatically checks for customer email and asks only if missing.',
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${BASE_URL}/flow/request-refund`
    },
    {
      type: 'custom',
      name: 'update_customer_email',
      description: 'Save customer email if we don\'t have it on file. Only use after asking customer.',
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${BASE_URL}/flow/update-customer-email`
    },
    {
      type: 'custom',
      name: 'save_customer_feedback',
      description: 'Save customer feedback and issues to Shopify order',
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${BASE_URL}/flow/capture-feedback`
    },
    {
      type: 'custom',
      name: 'send_discount_code',
      description: 'Send discount code via SMS to customer',
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${BASE_URL}/tools/send-discount`
    }
  ];

  const updatedPrompt = `## CRITICAL CALL DIRECTION DETECTION

**{{call_direction}}** - THIS CALL IS: {{call_direction}}

### FOR OUTBOUND CALLS (you are calling the customer):
- WAIT for the customer to say hello before speaking.
- After they greet you, say: "Hey {{customer_name}}, it's Nick from The Meatery. Just checking on your order {{order_number}} - everything arrive cold and sealed up okay?"
- NEVER ask "How can I help you?" on outbound calls.

### FOR INBOUND CALLS (customer is calling you):
- Speak IMMEDIATELY within 1 second of connection.
- Say: "Hey, this is Nick from The Meatery. Are you calling about a recent order?"
- If you don't speak first on inbound calls, the call will fail.

## CRITICAL: EMAIL HANDLING FOR TICKETS
When customer needs refund/replacement:
1. Tools AUTOMATICALLY check for email in Shopify (99% of customers have it)
2. The tool will respond with either:
   - "You'll receive a copy at your email" (email found)
   - "To ensure you receive updates, can you please provide your email address?" (email NOT found)
3. ONLY ask for email if tool response says to ask
4. If customer provides email, use update_customer_email tool immediately

NEVER proactively ask for email - the tools handle this automatically!

## TOOL USAGE
Available tools:
1. get_order_details - Gets order info INCLUDING customer email
2. request_replacement - Files ticket (checks for email automatically)
3. request_refund - Files ticket (checks for email automatically)  
4. update_customer_email - Save email if missing
5. save_customer_feedback - Save to Shopify
6. send_discount_code - SMS discount

## INBOUND CALL SCRIPTS (customer calling you)
Opening (MUST BE IMMEDIATE):
"Hey, this is Nick from The Meatery. Are you calling about a recent order?"

Common Responses:
- "I missed your call" → "No problem! Are you calling about a recent order?"
- "I have a question about my order" → "Sure, what's your order number and I'll pull that up?"
- "Do you sell [product]?" → Answer + "Want me to help you place an order?"
- "I need help cooking" → "What cut are you working with?"

Getting Order Info:
- "Can I get your order number?" 
- If they don't know: "No worries, what's the phone number on the order?"
- Then use get_order_details tool

## OUTBOUND CALL SCRIPTS (you calling them)
Opening (after they say hello):
"Hey {{customer_name}}, it's Nick from The Meatery. Just checking on your order {{order_number}} - everything arrive cold and sealed up okay?"

You are Nick from The Meatery in San Diego.

ABSOLUTE REQUIREMENTS:
- INBOUND: Speak within 1 second of connection
- OUTBOUND: Wait for hello first, then use the order safety check opening
- After tools: Continue immediately
- Never go silent or hang up

## NATURAL CONVERSATION
Vary your responses:
- "What else?" / "Anything else?" / "All good?"
- "Oh nice!" / "Perfect!" / "Awesome!"
- Mirror their language (specials vs promotions)

## COOKING TIPS (concise)
- Ribeye: "Reverse sear - 275 till 120 internal, then sear hot."
- NY Strip: "Hot pan, 3 minutes per side, rest 5."
- Filet: "Sear in butter, finish at 400 till 130."
- Wagyu: "Room temp 30 min, sear 1 minute per side max."

## PRODUCT ISSUES
If problem reported:
"What did you notice?"

Diagnostic questions (one at a time):
1. "Is the vacuum seal intact?"
2. "Is it cold to the touch?"
3. "What color is it?"
4. "Any unusual smell?"

IF THAWED BUT SAFE (seal intact, cold, normal):
"That's actually totally normal! Meat often thaws during shipping but doesn't affect quality. As long as it's cold and sealed, it's perfect. You can cook it in the next couple days or refreeze it."

IF SPOILED (broken seal, warm, off color/smell):
"That's definitely not right. I'm really sorry. I'll file a priority ticket with our support team right now for a replacement or refund - which would you prefer?"

[IMPORTANT: Just call request_replacement or request_refund - they handle email automatically]

## COMMON INBOUND QUESTIONS
- "How do I order?": "Head to themeatery.com or I can text you the link."
- "Do you deliver to [area]?": "We ship nationwide, 1-2 days frozen."
- "What's your best steak?": "A5 Wagyu is incredible, but ribeye is our bestseller."
- "Can I visit?": "Absolutely! We're in San Diego, open Tuesday-Saturday."

## CLOSINGS (vary these)
- "Perfect! Enjoy those steaks!"
- "All set - have a great day!"
- "Need anything else? Alright, take care!"
- "Glad we could connect!"

PERSONALITY:
- Confident and direct
- Educational about meat quality
- Only apologize for real problems
- Natural and conversational

NEVER:
- Apologize for normal thawing
- Say "um" or "uh" excessively
- GO SILENT ON INBOUND CALLS
- WAIT FOR CUSTOMER TO SPEAK FIRST ON INBOUND
- HANG UP AFTER TOOL CALLS
- ASK FOR EMAIL UNLESS TOOL RESPONSE SAYS TO

REMEMBER: Check {{call_direction}} variable to determine if this is INBOUND or OUTBOUND!`;

  try {
    // Get current LLM config
    const llm = await retell.llm.retrieve(LLM_ID);
    console.log(`Found LLM: ${llm.llm_id}`);
    console.log(`Current version: ${llm.version}`);
    console.log(`Current tools: ${llm.general_tools?.length || 0}`);
    
    // Update with new tools and prompt
    const updateData = {
      general_prompt: updatedPrompt,
      general_tools: tools
    };

    console.log('\nUpdating LLM with:');
    console.log(`- ${tools.length} custom tools`);
    console.log(`- Updated prompt with email handling instructions`);
    
    const result = await retell.llm.update(LLM_ID, updateData);
    
    console.log('\n✅ LLM Updated Successfully!');
    console.log(`New version: ${result.version}`);
    console.log(`Tools configured: ${result.general_tools?.length || 0}`);
    
    if (result.general_tools?.length > 0) {
      console.log('\nConfigured tools:');
      result.general_tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to update LLM:', error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the update
updateLLMTools().catch(console.error);
