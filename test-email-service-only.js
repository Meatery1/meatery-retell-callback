#!/usr/bin/env node

/**
 * Test Email Service (Google Service Account Only)
 * 
 * This script tests the email service after removing SMTP integration.
 * It only uses the Google Service Account authentication.
 */

import dotenv from 'dotenv';
import { initializeEmailService, sendSupportTicket } from './src/email-service.js';

// Load environment variables
dotenv.config();

async function testEmailService() {
  console.log('🧪 Testing Email Service (Google Service Account Only)');
  console.log('==================================================');
  
  // Check required environment variables
  const requiredVars = [
    'ANALYTICS_CLIENT_EMAIL',
    'ANALYTICS_PRIVATE_KEY',
    'GMAIL_IMPERSONATED_USER'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease add these to your .env file and try again.');
    return;
  }
  
  console.log('✅ All required environment variables found');
  console.log(`   Service Account: ${process.env.ANALYTICS_CLIENT_EMAIL}`);
  console.log(`   Impersonating: ${process.env.GMAIL_IMPERSONATED_USER}`);
  console.log('');
  
  try {
    // Initialize the email service
    console.log('🔄 Initializing email service...');
    const initialized = await initializeEmailService();
    
    if (!initialized) {
      console.error('❌ Failed to initialize email service');
      return;
    }
    
    console.log('✅ Email service initialized successfully');
    console.log('');
    
    // Test sending a simple support ticket
    console.log('📧 Testing email sending...');
    const testResult = await sendSupportTicket({
      orderNumber: 'TEST-12345',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '+1234567890',
      subject: '[TEST] Email Service Verification',
      issueDetails: 'This is a test email to verify the Google Service Account integration is working correctly.',
      priority: 'low'
    });
    
    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${testResult.messageId}`);
    console.log(`   Ticket Type: ${testResult.ticketType}`);
    console.log(`   CC'd to: nicholas@themeatery.com + test@example.com`);
    console.log('');
    console.log('🎉 Email service is working correctly with Google Service Account!');
    console.log('📧 All emails now CC both nicholas@themeatery.com and the customer');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting tips:');
    console.error('   1. Verify ANALYTICS_PRIVATE_KEY is correctly formatted');
    console.error('   2. Check domain-wide delegation is set up in Google Workspace Admin');
    console.error('   3. Ensure the service account has Gmail API access');
    console.error('   4. Verify GMAIL_IMPERSONATED_USER has permission to send emails');
  }
}

// Run the test
testEmailService();
