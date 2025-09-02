#!/usr/bin/env node

import dotenv from 'dotenv';
import { sendKlaviyoDiscountEmail, sendKlaviyoDiscountSMS } from './src/klaviyo-email-service-fixed.js';

dotenv.config();

/**
 * Test the fixed Klaviyo campaign sending
 */
async function testKlaviyoCampaigns() {
  console.log('🚀 Testing Fixed Klaviyo Campaign Sending...\n');
  
  // Test configuration
  const discountCode = `TEST${Date.now().toString().slice(-6)}`;
  const testConfig = {
    customerEmail: 'NickyFiorentino@gmail.com', // Your test email
    customerPhone: '+16194587071',              // Your test phone
    customerName: 'Nicky',
    discountCode: discountCode,
    discountValue: 15,
    discountType: 'percentage',
    recoveryUrl: `https://themeatery.com/checkout?discount=${discountCode}`
  };

  console.log('Test Configuration:', testConfig);
  console.log('\n' + '='.repeat(50) + '\n');

  // Test 1: Send Email Campaign
  console.log('📧 Test 1: Sending Email Campaign...');
  try {
    const emailResult = await sendKlaviyoDiscountEmail({
      customerEmail: testConfig.customerEmail,
      customerName: testConfig.customerName,
      discountValue: testConfig.discountValue,
      discountType: testConfig.discountType,
      discountCode: testConfig.discountCode,
      recoveryUrl: testConfig.recoveryUrl
    });
    
    console.log('✅ Email campaign sent successfully!');
    console.log('Result:', emailResult);
    console.log(`Campaign ID: ${emailResult.campaignId}`);
    console.log(`Check campaign at: https://www.klaviyo.com/campaign/${emailResult.campaignId}/content`);
  } catch (error) {
    console.error('❌ Email campaign failed:', error.response?.data || error.message);
    if (error.response?.data?.errors) {
      console.error('Detailed errors:', JSON.stringify(error.response.data.errors, null, 2));
    }
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Send SMS Campaign
  console.log('📱 Test 2: Sending SMS Campaign...');
  try {
    const smsResult = await sendKlaviyoDiscountSMS({
      customerPhone: testConfig.customerPhone,
      customerName: testConfig.customerName,
      discountValue: testConfig.discountValue,
      discountType: testConfig.discountType,
      discountCode: testConfig.discountCode + '_SMS',
      recoveryUrl: testConfig.recoveryUrl
    });
    
    console.log('✅ SMS campaign sent successfully!');
    console.log('Result:', smsResult);
    console.log(`Campaign ID: ${smsResult.campaignId}`);
    console.log(`Check campaign at: https://www.klaviyo.com/campaign/${smsResult.campaignId}/content`);
  } catch (error) {
    console.error('❌ SMS campaign failed:', error.response?.data || error.message);
    if (error.response?.data?.errors) {
      console.error('Detailed errors:', JSON.stringify(error.response.data.errors, null, 2));
    }
  }

  console.log('\n' + '='.repeat(50) + '\n');
  console.log('🏁 Test Complete!');
  console.log('\n📌 Key fixes implemented:');
  console.log('1. Campaign messages created separately, not in attributes');
  console.log('2. Profile added to list BEFORE campaign creation');
  console.log('3. Proper API field names and structure');
  console.log('4. Template assigned via correct endpoint');
  console.log('5. Campaign triggered via campaign-send-jobs');
}

// Run the test
testKlaviyoCampaigns().catch(console.error);
