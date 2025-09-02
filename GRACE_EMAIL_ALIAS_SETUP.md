# 📧 Grace@TheMeatery.com Email Alias Setup Guide

## Overview
This guide explains how to set up Grace@TheMeatery.com as an email alias so that Grace can send discount emails from her own email address.

## ✅ What's Been Implemented

### 1. **New Email Discount Service** (`src/discount-email-service.js`)
- Replaces SMS-based discount delivery
- Sends professional HTML emails with discount codes
- Uses Grace@TheMeatery.com as the sender address
- Includes beautiful email templates with The Meatery branding

### 2. **Updated Server Configuration** (`src/server.js`)
- Switched from SMS to email for all discount deliveries
- Updated webhook handlers to use email service
- Modified agent responses to mention "email" instead of "text"

### 3. **Enhanced Email Service** (`src/email-service.js`)
- Supports custom sender addresses (Grace@TheMeatery.com)
- Automatically detects and formats sender names
- Maintains compatibility with existing email functionality

## 🔧 Setting Up Grace@TheMeatery.com Alias

### Option 1: Google Workspace Alias (Recommended)

1. **Go to Google Workspace Admin Console**
   - Visit [admin.google.com](https://admin.google.com)
   - Sign in with your admin account

2. **Navigate to Users**
   - Go to Directory > Users
   - Find and click on `nicholas@themeatery.com`

3. **Add Email Alias**
   - Click on "User information"
   - Scroll down to "Email aliases"
   - Click "Add an alias"
   - Enter: `grace@themeatery.com`
   - Click "Add"

4. **Verify the Alias**
   - The alias should now appear in the user's profile
   - Emails sent to `grace@themeatery.com` will be delivered to Nicholas's inbox
   - Emails can be sent FROM `grace@themeatery.com` using the service account

### Option 2: Gmail Forwarding (Alternative)

If you don't have Google Workspace admin access:

1. **Create a Gmail Account**
   - Sign up for `grace.themeatery@gmail.com`
   - Set up forwarding to `nicholas@themeatery.com`

2. **Update Environment Variables**
   ```env
   GMAIL_IMPERSONATED_USER=grace.themeatery@gmail.com
   ```

3. **Grant Service Account Access**
   - Add the service account email to the new Gmail account's permissions
   - Enable domain-wide delegation for the new account

## 🧪 Testing the Setup

### 1. **Test Email Alias**
```bash
# Test with your email
node test-grace-discount-email.js your-email@example.com "Your Name" "1234567890" "12345"
```

### 2. **Test Server Endpoint**
```bash
curl -X POST http://localhost:3000/tools/send-discount \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "your-email@example.com",
    "customer_name": "Test Customer",
    "customer_phone": "1234567890",
    "discount_value": 10,
    "reason": "testing"
  }'
```

### 3. **Check Email Delivery**
- Look for emails from "Grace <grace@themeatery.com>"
- Verify the discount code is included
- Check that the email template renders correctly

## 📧 Email Template Features

### Professional Design
- The Meatery branding and colors
- Responsive HTML layout
- Clear discount code display
- Call-to-action button

### Content Includes
- Personalized greeting
- Discount code prominently displayed
- Expiration date (30 days)
- Direct link to use the code
- Contact information
- Professional signature from Grace

### Example Email Content
```
Subject: Your 10% Off Discount Code from The Meatery 🥩

Hi [Customer Name]! 🎉

Thanks for being a valued Meatery customer! As promised during our call, here's your exclusive discount code:

Your 10% Off Discount Code: MEATERY10OFFABC123
Expires in 30 days

Use this code at checkout to save 10% on your next order of premium meats.

[Shop Now Button]

Best regards,
Grace
The Meatery Customer Experience Team
```

## 🔄 Migration from SMS to Email

### What Changed
- **Before**: Discounts sent via SMS using Twilio
- **After**: Discounts sent via email using Google service account
- **Sender**: Now appears as "Grace <grace@themeatery.com>"
- **Delivery**: More reliable than SMS, better formatting

### Agent Behavior Changes
- **Before**: "I'll text you a discount code"
- **After**: "I'll email you a discount code"
- **Timing**: "You should receive it within a few minutes" (instead of "seconds")

### Benefits of Email Approach
1. **Better Deliverability**: Email is more reliable than SMS
2. **Rich Formatting**: HTML emails with branding and styling
3. **Professional Appearance**: Emails from Grace@TheMeatery.com
4. **No SMS Costs**: Eliminates Twilio SMS charges
5. **Better Tracking**: Email delivery confirmations
6. **Larger Content**: Can include more information and instructions

## 🚨 Important Notes

### Email Requirements
- **Customer Email Required**: The system now requires a customer email address
- **Fallback Handling**: If no email is available, the system will log an error
- **Grace's Email**: All discount emails will appear to come from Grace@TheMeatery.com

### Service Account Permissions
- The existing service account (`meatery-dashboard@theta-voyager-423706-t9.iam.gserviceaccount.com`) can send emails
- Domain-wide delegation allows sending from any email in the domain
- Grace@TheMeatery.com alias must be set up in Google Workspace

### Testing Checklist
- [ ] Grace@TheMeatery.com alias is created
- [ ] Service account can send emails
- [ ] Test email is received
- [ ] Discount code is valid in Shopify
- [ ] Email template renders correctly
- [ ] Agent responses mention "email" instead of "text"

## 🆘 Troubleshooting

### "Email service not available"
- Check Google service account credentials
- Verify domain-wide delegation is enabled
- Ensure Gmail API is enabled in Google Cloud

### "Grace@TheMeatery.com not found"
- Verify the email alias is created in Google Workspace
- Check that the alias is properly configured
- Test sending a manual email from the alias

### Emails not received
- Check spam/junk folders
- Verify the recipient email address is correct
- Check server logs for error messages
- Test with a different email address

### Discount codes not working
- Verify the code was created in Shopify
- Check the expiration date
- Ensure the code hasn't been used already
- Verify the customer email matches the discount code

## 📞 Support

For issues with the email discount system:
1. Check server logs for error messages
2. Verify Google service account configuration
3. Test the email alias setup
4. Check Shopify discount code creation
5. Review the email template rendering

---

**Note**: This system replaces the previous SMS-based discount delivery. All new discount offers will be sent via email from Grace@TheMeatery.com.
