#!/usr/bin/env node
/**
 * Test Script for Email Ticket System
 * Tests the refund and replacement ticket email functionality
 */

import dotenv from 'dotenv';
import { 
  initializeEmailService,
  sendRefundTicket,
  sendReplacementTicket 
} from './src/email-service.js';

dotenv.config();

async function testEmailTickets() {
  console.log('🧪 Testing Email Ticket System...\n');

  // Initialize email service
  console.log('📧 Initializing email service...');
  const initialized = await initializeEmailService();
  
  if (!initialized) {
    console.error('❌ Failed to initialize email service');
    console.log('\n📝 Make sure you have configured one of the following:');
    console.log('1. Google Service Account:');
    console.log('   - GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json');
    console.log('   - OR GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}');
    console.log('   - SEND_FROM_EMAIL=hello@themeatery.com');
    console.log('\n2. SMTP Fallback:');
    console.log('   - SMTP_HOST=smtp.gmail.com');
    console.log('   - SMTP_PORT=587');
    console.log('   - SMTP_USER=your-email@gmail.com');
    console.log('   - SMTP_PASS=your-app-password');
    process.exit(1);
  }

  // Get test parameters from command line or use defaults
  const args = process.argv.slice(2);
  const testType = args[0] || 'both';
  let customerEmail = args[1] || process.env.TEST_EMAIL || 'test@example.com';
  // Allow "none" to test missing email scenario
  if (customerEmail === 'none' || customerEmail === 'null' || customerEmail === '') {
    customerEmail = null;
  }
  const customerName = args[2] || 'Test Customer';
  const orderNumber = args[3] || '12345';

  console.log('\n📋 Test Configuration:');
  console.log(`- Customer: ${customerName}`);
  console.log(`- Email: ${customerEmail || '❌ NONE (Testing missing email scenario)'}`);
  console.log(`- Order: #${orderNumber}`);
  console.log(`- Test Type: ${testType}`);
  
  if (!customerEmail || customerEmail === 'test@example.com') {
    console.log('\n⚠️  WARNING: Testing without real customer email');
    console.log('   Tickets will show "NO CUSTOMER EMAIL" warnings');
    console.log('   This simulates the scenario where email must be collected');
  }
  console.log('');

  try {
    // Test replacement ticket
    if (testType === 'replacement' || testType === 'both') {
      console.log('📦 Sending replacement ticket...');
      const replacementResult = await sendReplacementTicket({
        orderNumber,
        customerName,
        customerEmail,
        customerPhone: '555-0123',
        itemTitle: 'Wagyu Ribeye (8oz)',
        quantity: 2,
        reason: 'Product arrived spoiled with broken vacuum seal',
        issueType: 'Quality issue'
      });
      console.log('✅ Replacement ticket sent successfully!');
      console.log(`   Message ID: ${replacementResult.messageId}`);
    }

    // Test refund ticket
    if (testType === 'refund' || testType === 'both') {
      console.log('\n💰 Sending refund ticket...');
      const refundResult = await sendRefundTicket({
        orderNumber,
        customerName,
        customerEmail,
        customerPhone: '555-0123',
        items: '2x Wagyu Ribeye, 1x Filet Mignon',
        reason: 'Multiple items arrived spoiled',
        preferredResolution: 'refund'
      });
      console.log('✅ Refund ticket sent successfully!');
      console.log(`   Message ID: ${refundResult.messageId}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📬 Check the following inboxes:');
    console.log('- hello@themeatery.com (should receive the ticket)');
    if (customerEmail && customerEmail !== 'test@example.com') {
      console.log(`- ${customerEmail} (should be CC'd)`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Show usage if help flag is provided
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test-email-tickets.js [type] [customer-email] [customer-name] [order-number]

Arguments:
  type           - 'refund', 'replacement', or 'both' (default: both)
  customer-email - Email to CC on the ticket (default: TEST_EMAIL env or test@example.com)
  customer-name  - Customer name for the ticket (default: Test Customer)
  order-number   - Order number for the ticket (default: 12345)

Examples:
  node test-email-tickets.js both john@example.com "John Doe" 54321
  node test-email-tickets.js refund
  node test-email-tickets.js replacement test@meatery.com
  
  Test missing email scenario (triggers warnings):
  node test-email-tickets.js both none "John Doe" 54321

Environment Variables:
  GOOGLE_SERVICE_ACCOUNT_PATH - Path to Google service account JSON file
  GOOGLE_SERVICE_ACCOUNT_KEY  - Service account JSON as string
  SEND_FROM_EMAIL            - Email address to send from
  TEST_EMAIL                 - Default customer email for testing
  
  OR for SMTP fallback:
  SMTP_HOST                  - SMTP server hostname
  SMTP_PORT                  - SMTP server port
  SMTP_USER                  - SMTP username
  SMTP_PASS                  - SMTP password
`);
  process.exit(0);
}

// Run the test
testEmailTickets().catch(console.error);
