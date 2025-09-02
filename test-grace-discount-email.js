#!/usr/bin/env node

/**
 * Test Grace's Email Discount Service
 * Tests the new email-based discount system for Grace
 */

import { createAndSendDiscountEmail, checkDiscountEligibility } from './src/discount-email-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testGraceDiscountEmail() {
  console.log('🧪 Testing Grace\'s Email Discount Service\n');
  
  // Test parameters
  const testEmail = process.argv[2] || 'nickyfiorentino@gmail.com';
  const testName = process.argv[3] || 'Test Customer';
  const testPhone = process.argv[4] || '3015203812';
  const testOrder = process.argv[5] || '12345';
  
  console.log('Test Parameters:');
  console.log(`  Email: ${testEmail}`);
  console.log(`  Name: ${testName}`);
  console.log(`  Phone: ${testPhone}`);
  console.log(`  Order: ${testOrder}\n`);
  
  try {
    // Test 1: Check eligibility
    console.log('1️⃣ Testing discount eligibility...');
    const eligibility = await checkDiscountEligibility({
      customerEmail: testEmail,
      customerPhone: testPhone,
      orderNumber: testOrder
    });
    
    console.log('✅ Eligibility check result:', eligibility);
    
    if (!eligibility.eligible) {
      console.log('❌ Customer not eligible for discount:', eligibility.reason);
      return;
    }
    
    // Test 2: Create and send discount email
    console.log('\n2️⃣ Creating and sending discount email...');
    const result = await createAndSendDiscountEmail({
      customerEmail: testEmail,
      customerName: testName,
      customerPhone: testPhone,
      discountType: 'percentage',
      discountValue: eligibility.discount_value || 10,
      reason: 'test_email_discount',
      orderNumber: testOrder
    });
    
    if (result.success) {
      console.log('✅ Discount email sent successfully!');
      console.log(`   Discount Code: ${result.discount.code}`);
      console.log(`   Value: ${result.discount.value}%`);
      console.log(`   Expires: ${new Date(result.discount.expires_at).toLocaleDateString()}`);
      console.log(`   Email Message ID: ${result.email.messageId}`);
      console.log(`   Summary: ${result.summary}`);
    } else {
      console.log('❌ Failed to send discount email:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testGraceDiscountEmail().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
