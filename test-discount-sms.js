#!/usr/bin/env node
/**
 * Test script for discount SMS functionality
 */

import dotenv from 'dotenv';
import { createAndSendDiscount, checkDiscountEligibility } from './src/discount-sms-service.js';

dotenv.config();

async function testDiscountSystem() {
  console.log('🧪 Testing Discount SMS System\n');
  console.log('=' .repeat(50));
  
  // Test phone number (replace with your test number)
  const testPhone = process.argv[2] || '5551234567';
  const testName = process.argv[3] || 'Test Customer';
  
  console.log(`📱 Test Phone: ${testPhone}`);
  console.log(`👤 Test Name: ${testName}\n`);
  
  try {
    // Step 1: Check eligibility
    console.log('1️⃣  Checking discount eligibility...');
    const eligibility = await checkDiscountEligibility({
      customerPhone: testPhone,
      customerEmail: null,
      orderNumber: null
    });
    
    console.log('   Eligible:', eligibility.eligible ? '✅ Yes' : '❌ No');
    console.log('   Reason:', eligibility.reason);
    if (eligibility.discount_value) {
      console.log('   Discount value:', eligibility.discount_value + '%');
      console.log('   Tier:', 
        eligibility.discount_value === 15 ? 'VIP (Maximum)' :
        eligibility.discount_value === 12 ? 'Valued Customer' :
        'Standard');
    }
    console.log();
    
    if (!eligibility.eligible) {
      console.log('⚠️  Customer not eligible for discount');
      console.log('   Last discount:', eligibility.last_discount_date);
      return;
    }
    
    // Step 2: Create and send discount
    console.log('2️⃣  Creating and sending discount...');
    const result = await createAndSendDiscount({
      customerPhone: testPhone,
      customerName: testName,
      customerEmail: null,
      discountType: 'percentage',
      discountValue: eligibility.discount_value || 10,
      reason: 'test',
      orderNumber: 'TEST-001'
    });
    
    if (result.success) {
      console.log('   ✅ Success!');
      console.log('   Discount Code:', result.discount.code);
      console.log('   Value:', result.discount.value + '%');
      console.log('   Expires:', new Date(result.discount.expires_at).toLocaleDateString());
      console.log('   Checkout URL:', result.discount.checkout_url);
      console.log('   SMS Status:', result.sms.status);
      console.log('   Message SID:', result.sms.message_sid);
    } else {
      console.log('   ❌ Failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nMake sure you have set:');
    console.error('- SHOPIFY_STORE_DOMAIN');
    console.error('- SHOPIFY_ADMIN_TOKEN');
    console.error('- TWILIO_ACCOUNT_SID');
    console.error('- TWILIO_AUTH_TOKEN');
    console.error('- TWILIO_PHONE_NUMBER');
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('Test complete!');
}

// Run test
testDiscountSystem().catch(console.error);
