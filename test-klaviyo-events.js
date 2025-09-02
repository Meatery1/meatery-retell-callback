#!/usr/bin/env node

import dotenv from 'dotenv';
import { sendDiscountViaEvent } from './src/klaviyo-events-service.js';

dotenv.config();

/**
 * Test the Klaviyo Events API approach
 */
async function testKlaviyoEvents() {
  console.log('🚀 Testing Klaviyo Events API (Reliable Alternative)...\n');
  
  // Test configuration
  const discountCode = `GRACE${Date.now().toString().slice(-6)}`;
  const testConfig = {
    customerEmail: 'NickyFiorentino@gmail.com',
    customerPhone: '+16194587071',
    customerName: 'Nicky',
    discountCode: discountCode,
    discountValue: 15,
    discountType: 'percentage',
    recoveryUrl: `https://themeatery.com/checkout?discount=${discountCode}`,
    abandonedCheckoutId: 'gid://shopify/AbandonedCheckout/123456' // Would come from Shopify
  };

  console.log('Test Configuration:', testConfig);
  console.log('\n' + '='.repeat(50) + '\n');

  // Test 1: Send Email Event
  console.log('📧 Test 1: Sending Email Event...');
  try {
    const emailResult = await sendDiscountViaEvent({
      ...testConfig,
      channel: 'email'
    });
    
    console.log('✅ Email event sent successfully!');
    console.log('Result:', emailResult);
    console.log('\n⚠️  Note: This triggers a Klaviyo Flow. You need to:');
    console.log('1. Create a flow in Klaviyo triggered by "Grace Discount Offered" event');
    console.log('2. Add an email action with your template');
    console.log('3. Set the flow to Live');
  } catch (error) {
    console.error('❌ Email event failed:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Send SMS Event
  console.log('📱 Test 2: Sending SMS Event...');
  try {
    const smsResult = await sendDiscountViaEvent({
      ...testConfig,
      channel: 'sms'
    });
    
    console.log('✅ SMS event sent successfully!');
    console.log('Result:', smsResult);
    console.log('\n⚠️  Note: This triggers a Klaviyo Flow for SMS');
  } catch (error) {
    console.error('❌ SMS event failed:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');
  console.log('🏁 Test Complete!');
  console.log('\n📌 Why Events API is Better:');
  console.log('1. No "Queued without Recipients" issues');
  console.log('2. Immediate triggering');
  console.log('3. Works with existing subscribed profiles');
  console.log('4. No list management needed');
  console.log('5. Designed for transactional messages');
}

// Run the test
testKlaviyoEvents().catch(console.error);
