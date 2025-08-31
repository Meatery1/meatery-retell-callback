# Complete Shopify-Retell Integration Guide

## Prerequisites

### 1. Environment Variables
Ensure these are set in your `.env` file:

```env
# Shopify Configuration
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxx

# Retell Configuration  
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=agent_xxxxxxxxxxxxx
RETELL_LLM_ID=llm_xxxxxxxxxxxxx
RETELL_FROM_NUMBER=+1xxxxxxxxxx

# Your Server URL (for webhooks and custom tools)
PUBLIC_BASE_URL=https://your-server-url.com
```

### 2. Shopify Admin API Access Token
1. Go to your Shopify Admin → Settings → Apps and sales channels
2. Click "Develop apps" → Create an app
3. Configure Admin API scopes:
   - `read_orders` - Access order history
   - `write_orders` - Update order notes/tags
   - `read_customers` - Access customer data
   - `read_products` - Access product information
   - `write_price_rules` - Create discounts (if using discount feature)
   - `write_discounts` - Create discount codes
4. Install the app and get your Admin API access token

## Available Shopify Data Endpoints

Your server already exposes these Shopify endpoints that the Retell agent can use:

### Order Management
- `GET /shopify/orders` - List orders with filters
- `GET /shopify/orders/:id` - Get specific order details
- `GET /shopify/order-by-number?order_number=1234` - Find order by number
- `GET /flow/order-context?order_number=1234&phone=+1xxx` - Get order context for a call

### Customer Management  
- `GET /shopify/customers` - List customers
- `GET /shopify/customers?email=customer@email.com` - Find customer by email
- `GET /shopify/customers/:id` - Get specific customer

### Product Information
- `GET /shopify/products` - List products
- `GET /shopify/products/:id` - Get specific product

### Call Actions
- `POST /flow/capture-feedback` - Save customer feedback to order
- `POST /flow/request-replacement` - Tag order for replacement
- `POST /tools/send-discount` - Send discount code via SMS

## Retell Agent Configuration

### Step 1: Update Your Retell LLM with Custom Tools

Here's how to configure custom tools in your Retell LLM to access Shopify data:

```javascript
// Use this script to update your Retell LLM with Shopify tools
import { Retell } from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function updateLLMWithShopifyTools() {
  const llmId = process.env.RETELL_LLM_ID;
  const serverUrl = process.env.PUBLIC_BASE_URL;
  
  const shopifyTools = [
    {
      type: "custom",
      name: "get_order_details",
      description: "Get details about a customer's order by order number or phone number",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/flow/order-context`
    },
    {
      type: "custom", 
      name: "lookup_customer_history",
      description: "Look up a customer's order history by phone number to see all their past orders",
      speak_after_execution: false,
      speak_during_execution: true,
      url: `${serverUrl}/shopify/customers`
    },
    {
      type: "custom",
      name: "save_customer_feedback",
      description: "Save customer satisfaction score and feedback to their order",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/flow/capture-feedback`
    },
    {
      type: "custom",
      name: "send_discount_code",
      description: "Send a discount code to the customer via SMS when they had a bad experience",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/tools/send-discount`
    },
    {
      type: "custom",
      name: "request_replacement",
      description: "Request a replacement for damaged or missing items",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/flow/request-replacement`
    }
  ];

  try {
    // Get current LLM configuration
    const llm = await retell.llm.retrieve(llmId);
    
    // Merge existing tools with new Shopify tools
    const existingTools = llm.general_tools || [];
    const updatedTools = [...existingTools, ...shopifyTools];
    
    // Update the LLM
    await retell.llm.update(llmId, {
      general_tools: updatedTools
    });
    
    console.log('✅ Successfully added Shopify tools to Retell LLM');
  } catch (error) {
    console.error('❌ Error updating LLM:', error);
  }
}

updateLLMWithShopifyTools();
```

### Step 2: Update Your Agent Prompt

Add these instructions to your agent's prompt to enable Shopify data access:

```markdown
## Available Customer Data Tools

You have access to the following tools to retrieve and manage customer information:

1. **get_order_details** - Use this to retrieve order information when a customer mentions their order number or when you have their phone number. This will give you:
   - Order items and quantities
   - Delivery status
   - Customer name
   - Order total

2. **lookup_customer_history** - Use this to see all past orders for a customer when you need to understand their purchase history or check for patterns.

3. **save_customer_feedback** - Always use this after collecting satisfaction scores or issue details to save them to the customer's order for follow-up.

4. **send_discount_code** - Use this when offering a discount to apologize for issues. The system will automatically:
   - Check discount eligibility
   - Create a unique code
   - Send it via SMS
   - Track usage

5. **request_replacement** - Use this when a customer reports damaged, spoiled, or missing items to flag the order for replacement.

## How to Use Customer Data

When a call starts:
1. If you have the order_number from dynamic variables, immediately call get_order_details to retrieve the order information
2. Use the customer's name from the order data to personalize the greeting
3. Reference specific items from their order during the conversation

Example flow:
- Customer mentions order #1234 → Call get_order_details with order_number=1234
- Customer can't remember order number → Call get_order_details with their phone number
- Customer reports an issue → Call save_customer_feedback with details
- Customer had bad experience → Call send_discount_code to make it right
```

### Step 3: Configure Dynamic Variables

When placing calls, pass order context as dynamic variables:

```javascript
// In your server.js placeConfirmationCall function
const dynamicVars = {
  customer_name: customerName,
  order_number: orderNumber,
  primary_item: metadata?.primary_item,
  items_summary: metadata?.items_summary,
  delivered_at: metadata?.delivered_at,
  customer_phone: phone  // Add this for tool use
};
```

## Implementation Example

Here's a complete example of how to set up and test the integration:

```javascript
// File: setup-shopify-retell.js
import { Retell } from 'retell-sdk';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function testShopifyIntegration() {
  console.log('🔧 Testing Shopify-Retell Integration...\n');
  
  // Step 1: Test Shopify connection
  console.log('1️⃣ Testing Shopify API connection...');
  try {
    const shopResponse = await axios.get(
      `${process.env.PUBLIC_BASE_URL}/shopify/shop`,
      { timeout: 5000 }
    );
    console.log(`✅ Connected to Shopify store: ${shopResponse.data.shop.name}`);
  } catch (error) {
    console.error('❌ Failed to connect to Shopify:', error.message);
    return;
  }
  
  // Step 2: Test order lookup
  console.log('\n2️⃣ Testing order lookup...');
  try {
    const ordersResponse = await axios.get(
      `${process.env.PUBLIC_BASE_URL}/shopify/orders`,
      { params: { limit: 1 } }
    );
    
    if (ordersResponse.data.orders.length > 0) {
      const testOrder = ordersResponse.data.orders[0];
      console.log(`✅ Found test order: #${testOrder.order_number}`);
      
      // Test order context endpoint
      const contextResponse = await axios.get(
        `${process.env.PUBLIC_BASE_URL}/flow/order-context`,
        { params: { order_number: testOrder.order_number } }
      );
      console.log('✅ Order context retrieved:', {
        customer: contextResponse.data.customer_name,
        items: contextResponse.data.items_summary
      });
    }
  } catch (error) {
    console.error('❌ Failed to test order lookup:', error.message);
  }
  
  // Step 3: Create a test web call with order context
  console.log('\n3️⃣ Creating test web call with Shopify data...');
  try {
    const webCall = await retell.call.createWebCall({
      agent_id: process.env.RETELL_AGENT_ID,
      metadata: {
        test_call: true,
        source: 'shopify-integration-test'
      },
      retell_llm_dynamic_variables: {
        customer_name: "Test Customer",
        order_number: "1234",
        items_summary: "2x Ribeye Steak, 1x Ground Beef",
        test_mode: "true"
      }
    });
    
    console.log('✅ Web call created with Shopify context');
    console.log(`📞 Access URL: ${webCall.access_url}`);
    console.log('\n🎯 Test the following scenarios:');
    console.log('   1. Ask the agent about order #1234');
    console.log('   2. Report an issue with the meat quality');
    console.log('   3. Request a discount for the bad experience');
    console.log('   4. Ask about previous orders');
    
  } catch (error) {
    console.error('❌ Failed to create test call:', error.message);
  }
}

// Run the test
testShopifyIntegration();
```

## Testing the Integration

1. **Manual Testing via Web Call:**
   ```bash
   node setup-shopify-retell.js
   ```
   This will create a web call URL where you can test the agent's ability to access Shopify data.

2. **Test with Real Order Data:**
   ```javascript
   // Test with an actual order from your Shopify store
   const testOrder = await axios.get(
     `${process.env.PUBLIC_BASE_URL}/shopify/order-by-number?order_number=1234`
   );
   
   const call = await retell.call.createPhoneCall({
     to_number: "+1xxxxxxxxxx",
     from_number: process.env.RETELL_FROM_NUMBER,
     override_agent_id: process.env.RETELL_AGENT_ID,
     retell_llm_dynamic_variables: {
       order_number: testOrder.data.orders[0].order_number,
       customer_name: testOrder.data.orders[0].customer.first_name,
       // ... other order details
     }
   });
   ```

## Webhook Integration

Your server already handles Retell webhooks at `/webhooks/retell`. When calls end, it:
1. Extracts structured data from the call analysis
2. Updates Shopify orders with feedback and tags
3. Sends discount codes if promised during the call
4. Manages opt-out requests

## Troubleshooting

### Common Issues and Solutions

1. **"Order not found" errors:**
   - Verify order number format (with or without #)
   - Check if order exists in Shopify
   - Ensure proper date range in queries

2. **Tool calls failing:**
   - Verify PUBLIC_BASE_URL is accessible from internet
   - Check server logs for API errors
   - Ensure Shopify API token has correct permissions

3. **Dynamic variables not working:**
   - Check variable names match exactly in prompt
   - Verify variables are passed in retell_llm_dynamic_variables
   - Look for typos in variable references

## Security Best Practices

1. **API Authentication:**
   - Never expose Shopify API tokens to the Retell agent directly
   - All Shopify API calls should go through your server
   - Implement rate limiting on your endpoints

2. **Data Validation:**
   - Validate all input from Retell tools
   - Sanitize data before sending to Shopify
   - Log all tool calls for audit trail

3. **Discount Limits:**
   - Your server already caps discounts at 15%
   - Implements eligibility checking
   - Tracks discount usage

## Next Steps

1. Run the setup script to add custom tools to your Retell LLM
2. Test with a web call to verify Shopify data access
3. Update your agent prompt with the Shopify tool instructions
4. Monitor webhook logs to ensure data is being saved correctly
5. Test with real customer scenarios

## Support Resources

- [Shopify Admin API Documentation](https://shopify.dev/docs/api/admin-rest)
- [Retell Custom Tools Documentation](https://docs.retellai.com/api-references/create-retell-llm)
- Your server logs at `/calls/recent-log` for debugging
