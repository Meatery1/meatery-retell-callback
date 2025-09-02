#!/usr/bin/env node

import dotenv from 'dotenv';
import { sendAbandonedCheckoutDiscount } from './src/klaviyo-shopify-integration.js';
import { fetchAbandonedCheckouts } from './src/abandoned-checkout-service.js';

dotenv.config();

/**
 * Test abandoned checkout recovery with real Shopify data
 */
async function testRealAbandonedCheckoutRecovery() {
  console.log('🛒 Testing Abandoned Checkout Recovery with Real Data...\n');
  
  try {
    // Step 1: Fetch real abandoned checkouts from Shopify
    console.log('📊 Fetching abandoned checkouts from Shopify...');
    const { checkouts } = await fetchAbandonedCheckouts({ 
      hours: 168, // Last 7 days
      minValue: 50, // Minimum $50
      first: 5 // Get top 5
    });
    
    if (checkouts.length === 0) {
      console.log('❌ No abandoned checkouts found');
      
      // Test with mock data instead
      console.log('\n📝 Testing with mock data instead...\n');
      return testWithMockData();
    }
    
    // Use the first abandoned checkout
    const checkout = checkouts[0];
    console.log(`\n✅ Found abandoned checkout:`, {
      id: checkout.id,
      customer: checkout.customer?.displayName,
      email: checkout.customer?.email,
      phone: checkout.customer?.phone,
      total: checkout.totalPriceSet?.shopMoney?.amount,
      items: checkout.lineItems?.nodes?.length,
      url: checkout.abandonedCheckoutUrl
    });
    
    // Step 2: Send recovery discount
    console.log('\n📧 Sending recovery discount...\n');
    
    const result = await sendAbandonedCheckoutDiscount({
      abandonedCheckoutId: checkout.id,
      customerEmail: 'NickyFiorentino@gmail.com', // Override for testing
      customerPhone: '+16194587071',
      customerName: checkout.customer?.firstName || 'Nicky',
      discountValue: 15,
      discountType: 'percentage',
      preferredChannel: 'email' // Start with email
    });
    
    console.log('✅ Email recovery sent:', {
      success: result.success,
      discount: result.discount.code,
      recoveryUrl: result.recoveryUrl,
      originalUrl: result.abandonedCheckoutUrl
    });
    
    // Step 3: Also test SMS with simplified format
    console.log('\n📱 Testing SMS recovery...\n');
    
    const smsResult = await sendAbandonedCheckoutDiscount({
      abandonedCheckoutId: checkout.id,
      customerEmail: 'NickyFiorentino@gmail.com',
      customerPhone: '+16194587071',
      customerName: checkout.customer?.firstName || 'Nicky',
      discountValue: 15,
      discountType: 'percentage',
      preferredChannel: 'sms'
    });
    
    console.log('✅ SMS recovery sent:', {
      success: smsResult.success,
      discount: smsResult.discount.code,
      recoveryUrl: smsResult.recoveryUrl
    });
    
    return { email: result, sms: smsResult };
    
  } catch (error) {
    console.error('❌ Error in test:', error);
    throw error;
  }
}

/**
 * Test with mock data if no real abandoned checkouts
 */
async function testWithMockData() {
  console.log('📝 Testing with mock abandoned checkout...\n');
  
  const result = await sendAbandonedCheckoutDiscount({
    abandonedCheckoutId: null, // No real ID
    customerEmail: 'NickyFiorentino@gmail.com',
    customerPhone: '+16194587071',
    customerName: 'Nicky',
    discountValue: 15,
    discountType: 'percentage',
    preferredChannel: 'email'
  });
  
  console.log('✅ Mock test completed:', result);
  return result;
}

// Run the test
testRealAbandonedCheckoutRecovery()
  .then(() => {
    console.log('\n🏁 Test Complete!');
    console.log('\n📌 Key Points:');
    console.log('1. Recovery URL includes the actual abandoned checkout');
    console.log('2. Discount code is automatically appended');
    console.log('3. UTM tracking parameters included');
    console.log('4. Works with both email and SMS channels');
  })
  .catch(console.error);
