#!/usr/bin/env node

/**
 * Test Klaviyo Campaign Service
 * Tests sending discount emails and SMS via Klaviyo campaigns with Shopify integration
 */

import { createAndSendKlaviyoDiscount, testKlaviyoConnection } from './src/klaviyo-email-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testKlaviyoDiscount() {
  console.log('🧪 Testing Klaviyo Campaign Service with Shopify Integration\n');
  
  // Test parameters
  const testEmail = process.argv[2] || 'nickyfiorentino@gmail.com';
  const testName = process.argv[3] || 'Test Customer';
  const testPhone = process.argv[4] || '3015203812';
  const testOrder = process.argv[5] || '12345';
  const testChannel = process.argv[6] || 'email'; // 'email' or 'sms'
  const testDiscountValue = parseInt(process.argv[7]) || 12; // Test discount percentage
  
  console.log('Test Parameters:');
  console.log(`  Email: ${testEmail}`);
  console.log(`  Name: ${testName}`);
  console.log(`  Phone: ${testPhone}`);
  console.log(`  Order: ${testOrder}`);
  console.log(`  Channel: ${testChannel}`);
  console.log(`  Discount Value: ${testDiscountValue}%\n`);
  
  try {
    // Test 1: Check Klaviyo connection
    console.log('1️⃣ Testing Klaviyo connection...');
    const connectionTest = await testKlaviyoConnection();
    
    if (!connectionTest.success) {
      console.log('❌ Klaviyo connection failed:', connectionTest.error);
      console.log('\n📋 Setup Instructions:');
      console.log('1. Get your Klaviyo API key from: https://www.klaviyo.com/account#api-keys-tab');
      console.log('2. Set environment variable: KLAVIYO_API_KEY=your_api_key');
      console.log('3. Restart your application');
      return;
    }
    
    console.log('✅ Klaviyo connection successful!');
    if (connectionTest.account) {
      console.log(`   Account: ${connectionTest.account.name || 'Connected'}\n`);
    } else {
      console.log(`   Account: Connected\n`);
    }
    
    // Test 2: Send discount via preferred channel with Shopify integration
    console.log(`2️⃣ Testing discount ${testChannel} creation and sending with Shopify integration...`);
    const result = await createAndSendKlaviyoDiscount({
      customerEmail: testEmail,
      customerName: testName,
      customerPhone: testPhone,
      discountType: 'percentage',
      discountValue: testDiscountValue,
      reason: 'test_discount',
      orderNumber: testOrder,
      preferredChannel: testChannel
    });
    
    if (result.success) {
      console.log(`✅ Discount ${testChannel} sent successfully!`);
      console.log(`   Discount Code: ${result.discount.code}`);
      console.log(`   Discount Value: ${result.discount.value}%`);
      console.log(`   Expires: ${result.discount.expires_at}`);
      console.log(`   Campaign ID: ${result.message.campaignId}`);
      console.log(`   Platform: ${result.message.platform}`);
      console.log(`   UTM Tracking: ${result.utmTracking}`);
      if (result.abandonedCheckoutUrl) {
        console.log(`   Abandoned Checkout URL: ${result.abandonedCheckoutUrl}`);
      }
      console.log(`   Summary: ${result.summary}`);
    } else {
      console.log(`❌ Failed to send discount ${testChannel}:`, result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testKlaviyoDiscount();