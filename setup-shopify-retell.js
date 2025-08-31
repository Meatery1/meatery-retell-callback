#!/usr/bin/env node

/**
 * Setup script to integrate Shopify with Retell AI
 * This script adds custom tools to your Retell LLM to access Shopify data
 */

import { Retell } from 'retell-sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkEnvironmentVariables() {
  log('\n🔍 Checking environment variables...', 'cyan');
  
  const required = [
    'SHOPIFY_STORE_DOMAIN',
    'SHOPIFY_ADMIN_TOKEN',
    'RETELL_API_KEY',
    'RETELL_LLM_ID',
    'PUBLIC_BASE_URL'
  ];
  
  const missing = [];
  const found = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    } else {
      found.push(key);
    }
  }
  
  if (found.length > 0) {
    log(`✅ Found: ${found.join(', ')}`, 'green');
  }
  
  if (missing.length > 0) {
    log(`❌ Missing: ${missing.join(', ')}`, 'red');
    log('\nPlease add the missing variables to your .env file and try again.', 'yellow');
    return false;
  }
  
  return true;
}

async function testShopifyConnection() {
  log('\n🏪 Testing Shopify API connection...', 'cyan');
  
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`;
    const response = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      timeout: 5000
    });
    
    const shopName = response.data.shop.name;
    const email = response.data.shop.email;
    
    log(`✅ Connected to Shopify store: ${shopName}`, 'green');
    log(`   Email: ${email}`, 'green');
    
    // Get order count
    const ordersUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders/count.json`;
    const ordersResponse = await axios.get(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN }
    });
    
    log(`   Total orders: ${ordersResponse.data.count}`, 'green');
    
    return true;
  } catch (error) {
    log(`❌ Failed to connect to Shopify: ${error.message}`, 'red');
    
    if (error.response?.status === 401) {
      log('   Check your SHOPIFY_ADMIN_TOKEN', 'yellow');
    } else if (error.response?.status === 404) {
      log('   Check your SHOPIFY_STORE_DOMAIN', 'yellow');
    }
    
    return false;
  }
}

async function testServerConnection() {
  log('\n🖥️  Testing server connection...', 'cyan');
  
  try {
    const response = await axios.get(`${process.env.PUBLIC_BASE_URL}/health`, {
      timeout: 5000
    });
    
    if (response.data.ok) {
      log(`✅ Server is running at: ${process.env.PUBLIC_BASE_URL}`, 'green');
      return true;
    }
  } catch (error) {
    log(`❌ Cannot reach server at: ${process.env.PUBLIC_BASE_URL}`, 'red');
    log(`   Error: ${error.message}`, 'yellow');
    log('\n   Make sure your server is running and PUBLIC_BASE_URL is correct.', 'yellow');
    return false;
  }
  
  return false;
}

async function getCurrentLLMConfig() {
  log('\n📋 Fetching current LLM configuration...', 'cyan');
  
  try {
    const llm = await retell.llm.retrieve(process.env.RETELL_LLM_ID);
    
    log(`✅ Found LLM: ${process.env.RETELL_LLM_ID}`, 'green');
    log(`   Model: ${llm.model || 'default'}`, 'green');
    log(`   Current tools: ${(llm.general_tools || []).length} tools configured`, 'green');
    
    return llm;
  } catch (error) {
    log(`❌ Failed to retrieve LLM: ${error.message}`, 'red');
    return null;
  }
}

async function addShopifyTools(llm) {
  log('\n🔧 Adding Shopify custom tools to Retell LLM...', 'cyan');
  
  const serverUrl = process.env.PUBLIC_BASE_URL;
  
  const shopifyTools = [
    {
      type: "custom",
      name: "get_order_details",
      description: "Retrieve detailed information about a specific order using order number or customer phone number. Returns order items, delivery status, customer name, and total.",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/flow/order-context`
    },
    {
      type: "custom",
      name: "lookup_customer_orders",
      description: "Look up all orders for a customer by their phone number to see their complete purchase history",
      speak_after_execution: false,
      speak_during_execution: true,
      url: `${serverUrl}/shopify/orders`
    },
    {
      type: "custom",
      name: "save_customer_feedback",
      description: "Save customer satisfaction score, issue details, and contact preferences to their order for follow-up",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/flow/capture-feedback`
    },
    {
      type: "custom",
      name: "send_discount_code",
      description: "Send a discount code to the customer via SMS as an apology for issues or poor experience. Automatically checks eligibility and creates unique code.",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/tools/send-discount`
    },
    {
      type: "custom",
      name: "check_discount_eligibility",
      description: "Check if a customer is eligible for a discount based on their order history and previous discounts used",
      speak_after_execution: false,
      speak_during_execution: false,
      url: `${serverUrl}/tools/check-discount-eligibility`
    },
    {
      type: "custom",
      name: "request_replacement",
      description: "Flag an order for replacement when customer reports damaged, spoiled, or missing items",
      speak_after_execution: true,
      speak_during_execution: false,
      url: `${serverUrl}/flow/request-replacement`
    }
  ];
  
  try {
    // Get existing tools
    const existingTools = llm.general_tools || [];
    
    // Filter out any existing Shopify tools to avoid duplicates
    const nonShopifyTools = existingTools.filter(tool => 
      !tool.name?.includes('order') && 
      !tool.name?.includes('customer') && 
      !tool.name?.includes('discount') &&
      !tool.name?.includes('replacement')
    );
    
    // Combine with new Shopify tools
    const updatedTools = [...nonShopifyTools, ...shopifyTools];
    
    // Update the LLM
    await retell.llm.update(process.env.RETELL_LLM_ID, {
      general_tools: updatedTools
    });
    
    log(`✅ Successfully added ${shopifyTools.length} Shopify tools to Retell LLM`, 'green');
    log(`   Total tools now: ${updatedTools.length}`, 'green');
    
    return true;
  } catch (error) {
    log(`❌ Failed to update LLM: ${error.message}`, 'red');
    return false;
  }
}

async function testIntegration() {
  log('\n🧪 Would you like to create a test web call to verify the integration?', 'cyan');
  
  const answer = await question('Create test call? (y/n): ');
  
  if (answer.toLowerCase() !== 'y') {
    return;
  }
  
  log('\n📞 Creating test web call...', 'cyan');
  
  try {
    // First, get a sample order to use for testing
    const ordersUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/orders.json`;
    const ordersResponse = await axios.get(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
      params: { limit: 1, status: 'any' }
    });
    
    let testOrderNumber = '1234';
    let testCustomerName = 'Test Customer';
    let testItemsSummary = '2x Ribeye Steak, 1x Ground Beef';
    
    if (ordersResponse.data.orders.length > 0) {
      const order = ordersResponse.data.orders[0];
      testOrderNumber = String(order.order_number || order.name || '1234');
      testCustomerName = order.customer?.first_name || 'Customer';
      
      if (order.line_items && order.line_items.length > 0) {
        testItemsSummary = order.line_items
          .slice(0, 3)
          .map(item => `${item.quantity}x ${item.title}`)
          .join(', ');
      }
    }
    
    // Create the web call (ensure all variables are strings)
    // Use the correct agent ID (the one with llm_7eed186989d2fba11fa1f9395bc7)
    const agentId = process.env.RETELL_AGENT_ID || 'agent_2f7a3254099b872da193df3133';
    const webCall = await retell.call.createWebCall({
      agent_id: agentId,
      metadata: {
        test_call: true,
        source: 'shopify-integration-test'
      },
      retell_llm_dynamic_variables: {
        customer_name: String(testCustomerName),
        order_number: String(testOrderNumber),
        items_summary: String(testItemsSummary),
        test_mode: "true"
      }
    });
    
    log('\n✅ Test web call created successfully!', 'green');
    
    // The URL might be in different properties depending on the response
    const accessUrl = webCall.access_url || webCall.url || webCall.web_call_url || webCall.call_url;
    
    if (!accessUrl) {
      log('\n⚠️  Web call created but URL not found in response:', 'yellow');
      log(JSON.stringify(webCall, null, 2), 'yellow');
    } else {
      log(`\n📱 Access URL: ${colors.bright}${accessUrl}${colors.reset}`, 'blue');
    }
    log('\n🎯 Test these scenarios:', 'yellow');
    log(`   1. Ask about order #${testOrderNumber}`, 'yellow');
    log('   2. Say "I received spoiled meat in my order"', 'yellow');
    log('   3. Ask for a discount code for the inconvenience', 'yellow');
    log('   4. Ask about your previous orders', 'yellow');
    log('   5. Request a replacement for damaged items', 'yellow');
    
    log('\n💡 The agent should be able to:', 'cyan');
    log('   • Retrieve the order details automatically', 'cyan');
    log('   • Save your feedback to the order', 'cyan');
    log('   • Send you a discount code via SMS', 'cyan');
    log('   • Flag the order for replacement', 'cyan');
    
  } catch (error) {
    log(`❌ Failed to create test call: ${error.response?.status || ''} ${JSON.stringify(error.response?.data) || error.message}`, 'red');
    log('\n💡 Tips:', 'yellow');
    log('   1. Make sure your RETELL_AGENT_ID in .env is correct', 'yellow');
    log('   2. Ensure the agent is configured with the correct LLM', 'yellow');
    log('   3. Try running: node -r dotenv/config setup-shopify-retell.js', 'yellow');
  }
}

async function main() {
  log('\n' + '='.repeat(60), 'bright');
  log('🚀 Shopify-Retell Integration Setup', 'bright');
  log('='.repeat(60) + '\n', 'bright');
  
  // Step 1: Check environment variables
  if (!await checkEnvironmentVariables()) {
    rl.close();
    process.exit(1);
  }
  
  // Step 2: Test Shopify connection
  if (!await testShopifyConnection()) {
    const proceed = await question('\nShopify connection failed. Continue anyway? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 3: Test server connection
  if (!await testServerConnection()) {
    const proceed = await question('\nServer connection failed. Continue anyway? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 4: Get current LLM configuration
  const llm = await getCurrentLLMConfig();
  if (!llm) {
    log('\nCannot proceed without valid LLM configuration.', 'red');
    rl.close();
    process.exit(1);
  }
  
  // Step 5: Add Shopify tools
  const toolsAdded = await addShopifyTools(llm);
  if (!toolsAdded) {
    log('\nFailed to add Shopify tools. Please check the errors above.', 'red');
    rl.close();
    process.exit(1);
  }
  
  // Step 6: Test the integration
  await testIntegration();
  
  log('\n' + '='.repeat(60), 'bright');
  log('✨ Setup Complete!', 'bright');
  log('='.repeat(60) + '\n', 'bright');
  
  log('📚 Next steps:', 'cyan');
  log('   1. Update your agent prompt to mention the new tools', 'cyan');
  log('   2. Test with real customer calls', 'cyan');
  log('   3. Monitor webhook logs at /calls/recent-log', 'cyan');
  log('   4. Check order updates in Shopify admin', 'cyan');
  
  rl.close();
}

// Run the setup
main().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});
