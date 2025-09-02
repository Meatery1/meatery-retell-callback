# Grace's Klaviyo Discount Email Setup

This guide explains how to set up Grace to send discount emails using your existing Klaviyo template.

## 🎯 What This Does

Grace will now send discount emails using your professional Klaviyo template instead of the basic HTML email. This gives you:

- ✅ **Professional Design**: Uses your existing Klaviyo template
- ✅ **Better Deliverability**: Klaviyo's infrastructure
- ✅ **Analytics**: Track opens, clicks, and conversions
- ✅ **Consistent Branding**: Matches your other marketing emails
- ✅ **Mobile Optimized**: Responsive design

## 🔧 Setup Instructions

### 1. Get Your Klaviyo API Key

1. Go to [Klaviyo API Keys](https://www.klaviyo.com/account#api-keys-tab)
2. Create a new API key with the following permissions:
   - `profiles:write` - To create/update customer profiles
   - `flow-message-actions:write` - To trigger flow messages
3. Copy the API key

### 2. Set Environment Variables

Add these to your `.env` file:

```bash
# Klaviyo Configuration
KLAVIYO_API_KEY=your_klaviyo_api_key_here
KLAVIYO_DISCOUNT_FLOW_MESSAGE_ID=ViyTBY
```

### 3. Update Your Klaviyo Template

The template at `ViyTBY` will receive these variables:

- `{{ discount_code }}` - The discount code (e.g., "GRACE10")
- `{{ discount_value }}` - The discount value (e.g., "10")
- `{{ discount_type }}` - The discount type (e.g., "percentage")
- `{{ discount_text }}` - Formatted discount (e.g., "10%")
- `{{ checkout_url }}` - Direct link to apply the discount
- `{{ order_number }}` - The order number (if applicable)
- `{{ customer_name }}` - Customer's first name
- `{{ company_name }}` - "The Meatery"
- `{{ sender_name }}` - "Grace"
- `{{ sender_title }}` - "Customer Experience Team"

### 4. Test the Integration

Run the test script:

```bash
node test-klaviyo-discount.js your-email@example.com "Your Name" "3015203812" "12345"
```

## 📧 How It Works

1. **Customer calls Grace** and requests a discount
2. **Grace creates a Shopify discount** code
3. **Grace updates the customer profile** in Klaviyo with discount details
4. **Grace triggers your flow message** using the template
5. **Customer receives a professional email** with the discount code

## 🎨 Template Variables Available

Your Klaviyo template can use these variables:

```liquid
Hello {{ customer_name }},

Grace from The Meatery has created a special {{ discount_text }} discount just for you!

Your discount code: {{ discount_code }}
Expires: 30 days from now

Shop now: {{ checkout_url }}

Best regards,
{{ sender_name }}
{{ sender_title }}
{{ company_name }}
```

## 🔄 Switching Back

If you need to switch back to the basic email service:

1. Update `src/server.js` imports:
   ```javascript
   import { createAndSendDiscountEmail } from './discount-email-service.js';
   ```

2. Change the function calls back to `createAndSendDiscountEmail`

## 🚨 Troubleshooting

### "Flow message not found"
- Check that `ViyTBY` is the correct flow message ID
- Verify the flow message is active in Klaviyo

### "API key invalid"
- Verify your Klaviyo API key is correct
- Check that the API key has the required permissions

### "Profile creation failed"
- Ensure the customer email is valid
- Check Klaviyo API rate limits

## 📊 Benefits Over Basic Email

| Feature | Basic Email | Klaviyo |
|---------|-------------|---------|
| Design | Basic HTML | Professional Template |
| Deliverability | Gmail API | Klaviyo Infrastructure |
| Analytics | None | Opens, Clicks, Conversions |
| Mobile | Basic | Responsive |
| Branding | Limited | Full Brand Control |
| A/B Testing | No | Yes |
| Segmentation | No | Advanced |

## 🎯 Next Steps

1. **Test the integration** with the test script
2. **Customize your template** with The Meatery branding
3. **Set up analytics** to track discount email performance
4. **Consider A/B testing** different subject lines or designs

---

**Need Help?** Check the Klaviyo documentation or contact support.
