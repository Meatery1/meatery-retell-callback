# 📧 Email Ticket System Setup Guide

## Overview
The email ticket system sends automated tickets to your Commslayer system (hello@themeatery.com) and CCs the customer when handling refunds and replacements.

## ✅ What's Now Implemented

### 1. **Email Service Module** (`src/email-service.js`)
- Sends professional HTML/text emails to hello@themeatery.com
- Automatically CCs the customer (if email is available)
- Supports both Google Service Account and SMTP authentication
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

### Option 1: Google Service Account (Recommended)
```env
# Path to your service account JSON file
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account-key.json

# OR provide the JSON directly (better for deployment)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"..."}'

# The email address to send from
SEND_FROM_EMAIL=hello@themeatery.com
```

### Option 2: SMTP Fallback
```env
# For Gmail, Outlook, or other SMTP services
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use App Password, not regular password
```

## 📝 Setting Up Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create a Service Account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Name it (e.g., "meatery-email-sender")
   - Grant role: "Service Account User"
5. Create and download JSON key:
   - Click on the service account
   - Go to "Keys" tab
   - Add Key > Create New Key > JSON
   - Save the file securely
6. Enable Domain-Wide Delegation (if using Google Workspace)
7. Add the service account email to your Gmail/Workspace with send permissions

## 🧪 Testing the Email System

Run the test script:
```bash
# Install new dependencies first
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

- [ ] Configure Google Service Account or SMTP
- [ ] Add environment variables to `.env`
- [ ] Run `npm install` to get new dependencies
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
- For Gmail: Use App Password, not regular password
- For Service Account: Check JSON key is complete
- Verify SEND_FROM_EMAIL has permission to send

**Emails not received**
- Check spam/junk folders
- Verify hello@themeatery.com is correct
- Test with a personal email first
- Check server logs for error messages
