#!/usr/bin/env node

/**
 * Test Email Sender Configuration
 * Quick test to verify Grace@TheMeatery.com is being used as sender
 */

import { initializeEmailService, transporter } from './src/email-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailSender() {
  console.log('🧪 Testing Email Sender Configuration\n');
  
  // Check environment variables
  console.log('Environment Variables:');
  console.log(`  GMAIL_IMPERSONATED_USER: ${process.env.GMAIL_IMPERSONATED_USER || 'NOT SET'}`);
  console.log(`  ANALYTICS_CLIENT_EMAIL: ${process.env.ANALYTICS_CLIENT_EMAIL || 'NOT SET'}`);
  console.log(`  ANALYTICS_PRIVATE_KEY: ${process.env.ANALYTICS_PRIVATE_KEY ? 'SET' : 'NOT SET'}\n`);
  
  try {
    // Initialize email service
    console.log('1️⃣ Initializing email service...');
    await initializeEmailService();
    
    if (!transporter) {
      console.log('❌ Email service not available');
      return;
    }
    
    console.log('✅ Email service initialized successfully\n');
    
    // Test sending a simple email
    console.log('2️⃣ Sending test email...');
    const testEmail = process.argv[2] || 'nickyfiorentino@gmail.com';
    
    const mailOptions = {
      from: 'Grace@TheMeatery.com',
      to: testEmail,
      subject: 'Test Email from Grace - Sender Verification',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email from Grace</h2>
          <p>This is a test email to verify the sender configuration.</p>
          <p><strong>Expected Sender:</strong> Grace@TheMeatery.com</p>
          <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `,
      text: `Test Email from Grace\n\nThis is a test email to verify the sender configuration.\nExpected Sender: Grace@TheMeatery.com\nSent at: ${new Date().toLocaleString()}`
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   To: ${testEmail}`);
    console.log(`   From: Grace@TheMeatery.com`);
    console.log(`   Subject: ${mailOptions.subject}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testEmailSender().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
