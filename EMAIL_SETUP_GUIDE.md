# 📧 Email Ticket System Setup Guide

## Overview
The email ticket system sends automated tickets to your Commslayer system (hello@themeatery.com) and CCs the customer when handling refunds and replacements.

## ✅ What's Now Implemented

### 1. **Email Service Module** (`src/email-service.js`)
- Sends professional HTML/text emails to hello@themeatery.com
- Automatically CCs the customer (if email is available)
- Uses Google Service Account authentication for secure email sending
- Three ticket types: Refund, Replacement, and General Support

### 2. **Updated Endpoints**
- `/flow/request-replacement` - Files replacement tickets
- `/flow/request-refund` - Files refund tickets (NEW)
- Both endpoints now send emails AND update Shopify

### 3. **Customer Email Extraction**
- Automatically pulls customer email from Shopify order data
- Checks multiple sources: `order.customer.email`, `order.email`
- Falls back gracefully if no email is found

## 🔧 Required Environment Variables

Add these to your `.env` file:

### Google Service Account (Required)
```env
# Service account credentials
ANALYTICS_CLIENT_EMAIL=meatery-dashboard@theta-voyager-423706-t9.iam.gserviceaccount.com
ANALYTICS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# The email address to send from (must be a domain user)
GMAIL_IMPERSONATED_USER=nicholas@themeatery.com
SEND_FROM_EMAIL=hello@themeatery.com
```

## 📝 Setting Up Google Service Account

1. **Service Account Already Exists**: `meatery-dashboard@theta-voyager-423706-t9.iam.gserviceaccount.com`
2. **Ensure Domain-Wide Delegation is Enabled**:
   - Go to [Google Workspace Admin](https://admin.google.com)
   - Navigate to Security > API Controls > Domain-wide Delegation
   - Add the service account email with scope: `https://www.googleapis.com/auth/gmail.send`
3. **Verify Private Key Access**: Ensure the private key is available in your environment
4. **Test the Setup**: Run the test script to verify everything works

## 🧪 Testing the Email System

Run the test script:
```bash
# Install dependencies first
npm install

# Test both refund and replacement emails
node test-email-tickets.js both your-email@example.com "John Doe" 12345

# Test only refund
node test-email-tickets.js refund

# Test only replacement
node test-email-tickets.js replacement
```

## 📞 Updated Agent Language

The agent now uses proper "ticket filing" language:

**Instead of:** "I'll process your refund"
**Now says:** "I'll file a priority ticket with our support team for your refund. They'll process this and contact you within 24 hours."

**Instead of:** "I'll send out a replacement"
**Now says:** "I'll file a priority ticket with our support team for your replacement. They'll contact you within 24 hours with shipping details."

## 🎯 What Happens When Issues Are Reported

1. **Customer reports issue** → Agent asks diagnostic questions
2. **Agent determines resolution** → Refund or Replacement
3. **System automatically:**
   - Sends email ticket to hello@themeatery.com
   - CCs nicholas@themeatery.com (always)
   - CCs the customer (if email available)
   - Updates Shopify order with tags and notes
   - Confirms to customer that ticket was filed

## 📊 Email Ticket Contents

### Refund Tickets Include:
- Customer information (name, email, phone)
- Order number
- Items affected
- Reason for refund
- Customer's preferred resolution
- Timestamp of call

### Replacement Tickets Include:
- Customer information
- Order number
- Specific item and quantity
- Issue type and details
- Timestamp of call

## ⚠️ Important Notes

1. **Email Fallback**: If email sending fails, the system still:
   - Updates Shopify with tags/notes
   - Confirms to customer (agent continues normally)
   - Logs the error for manual follow-up

2. **No Customer Email**: If customer email isn't available:
   - Ticket still sends to hello@themeatery.com
   - No CC is added
   - Phone number is included for follow-up

3. **Testing**: Always test with a real email address you can check

## 🚀 Going Live Checklist

- [ ] Configure Google Service Account credentials
- [ ] Add environment variables to `.env`
- [ ] Run `npm install` to get dependencies
- [ ] Test email sending with `node test-email-tickets.js`
- [ ] Update agent prompt in Retell dashboard
- [ ] Verify hello@themeatery.com receives test tickets
- [ ] Confirm Commslayer can process these emails
- [ ] Monitor first few live calls for proper ticket creation

## 📈 Monitoring

Check server logs for:
- `✅ Replacement ticket emailed for order #XXXXX`
- `✅ Refund ticket emailed for order #XXXXX`
- `⚠️ Failed to send email ticket` (system continues, manual follow-up needed)

## 🆘 Troubleshooting

**"Email service not available"**
- Check environment variables are set correctly
- Verify service account JSON is valid
- Ensure Gmail API is enabled in Google Cloud

**"Invalid credentials"**
- Check ANALYTICS_PRIVATE_KEY is properly formatted
- Verify domain-wide delegation is set up correctly
- Ensure GMAIL_IMPERSONATED_USER has permission to send

**Emails not received**
- Check spam/junk folders
- Verify hello@themeatery.com is correct
- Test with a personal email first
- Check server logs for error messages

**Domain-wide delegation issues**
- Verify service account email is added to Workspace Admin
- Check scope includes `https://www.googleapis.com/auth/gmail.send`
- Ensure 24-48 hours have passed for changes to propagate
