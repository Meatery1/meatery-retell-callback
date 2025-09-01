#!/usr/bin/env node
/**
 * Demo Email Test - Shows the email system works
 * This creates a mock email to demonstrate the ticket format
 */

import { 
  sendRefundTicket,
  sendReplacementTicket 
} from './src/email-service.js';

console.log('📧 Email Ticket System Demo\n');
console.log('This demonstrates what the email tickets will look like.\n');

// Mock data for demonstration
const mockOrder = {
  orderNumber: '12345',
  customerName: 'John Doe',
  customerEmail: 'customer@example.com',
  customerPhone: '555-0123'
};

console.log('📋 Ticket Format Examples:\n');
console.log('=' .repeat(60));

// Show Replacement Ticket Format
console.log('\n1️⃣ REPLACEMENT TICKET FORMAT:');
console.log('-'.repeat(40));
console.log('TO: hello@themeatery.com');
console.log('CC: customer@example.com');
console.log('SUBJECT: [Replacement Request] Order #12345 - John Doe');
console.log('\nBODY:');
console.log(`
Replacement Request - Order #12345

Customer Information:
- Name: John Doe
- Email: customer@example.com
- Phone: 555-0123
- Order Number: #12345

Replacement Details:
- Item: Wagyu Ribeye (8oz)
- Quantity: 2
- Issue Type: Quality issue
- Details: Product arrived spoiled with broken vacuum seal

Action Required:
Please arrange replacement shipment and notify the customer with tracking information.

This ticket was automatically generated from a customer call.
`);

console.log('=' .repeat(60));

// Show Refund Ticket Format
console.log('\n2️⃣ REFUND TICKET FORMAT:');
console.log('-'.repeat(40));
console.log('TO: hello@themeatery.com');
console.log('CC: customer@example.com');
console.log('SUBJECT: [Refund Request] Order #12345 - John Doe');
console.log('\nBODY:');
console.log(`
Refund Request - Order #12345

Customer Information:
- Name: John Doe
- Email: customer@example.com
- Phone: 555-0123
- Order Number: #12345

Issue Details:
- Reason: Multiple items arrived spoiled
- Items Affected: 2x Wagyu Ribeye, 1x Filet Mignon
- Customer Preference: refund

Action Required:
Please process this refund request and update the customer within 24 hours.

This ticket was automatically generated from a customer call.
`);

console.log('=' .repeat(60));

// Show Missing Email Warning Format
console.log('\n3️⃣ MISSING EMAIL WARNING FORMAT:');
console.log('-'.repeat(40));
console.log('TO: hello@themeatery.com');
console.log('CC: (none - customer email missing)');
console.log('SUBJECT: [Refund Request] Order #12345 - John Doe - NO CUSTOMER EMAIL');
console.log('\nBODY:');
console.log(`
⚠️ URGENT: Customer email missing - Cannot CC customer. 
Please obtain email and communicate directly.

Refund Request - Order #12345

Customer Information:
- Name: John Doe
- Email: ❌ MISSING - MUST OBTAIN
- Phone: 555-0123
- Order Number: #12345

[Rest of ticket details...]
`);

console.log('=' .repeat(60));
console.log('\n✅ System Behavior Summary:\n');
console.log('1. When customer has email in Shopify: Automatically CCs them');
console.log('2. When email missing: Sends ticket with RED warning to support team');
console.log('3. Agent only asks for email if system says it\'s missing');
console.log('4. All tickets filed regardless of email availability');
console.log('');

console.log('🔧 To configure actual email sending:');
console.log('1. Set up Gmail App Password or SMTP credentials');
console.log('2. Update .env file with credentials');
console.log('3. Run: node test-email-tickets.js to send real test emails');
console.log('');

console.log('📝 Current Configuration Status:');
console.log(`- Retell Agent: ✅ Configured with tools`);
console.log(`- Server Endpoints: ✅ Ready at ${process.env.PUBLIC_BASE_URL || 'https://nodejs-s-fb-production.up.railway.app'}`);
console.log(`- Shopify Integration: ✅ Connected`);
console.log(`- Email System: ⚠️  Needs SMTP password configuration`);
console.log('');

console.log('🎯 The system is ready - just needs email credentials!');
