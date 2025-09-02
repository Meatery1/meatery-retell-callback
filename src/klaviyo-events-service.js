import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Send transactional emails via Klaviyo Events API
 * This is more reliable for immediate sending than campaigns
 */
export async function sendDiscountViaEvent({
  customerEmail,
  customerPhone,
  customerName,
  discountValue,
  discountType = 'percentage',
  discountCode,
  recoveryUrl,
  abandonedCheckoutId = null,
  channel = 'email' // 'email' or 'sms'
}) {
  const klaviyoApiKey = process.env.KLAVIYO_API_KEY || process.env.KLAVIYO_PRIVATE_KEY;
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured');
  }

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;

  // Ensure discount code is appended to recovery URL
  let finalRecoveryUrl = recoveryUrl || 'https://themeatery.com/checkout';
  if (discountCode && !finalRecoveryUrl.includes(`discount=${discountCode}`)) {
    const url = new URL(finalRecoveryUrl);
    url.searchParams.set('discount', discountCode);
    url.searchParams.set('utm_source', 'grace_ai');
    url.searchParams.set('utm_medium', channel);
    url.searchParams.set('utm_campaign', abandonedCheckoutId ? 'abandoned_cart_recovery' : 'discount_recovery');
    finalRecoveryUrl = url.toString();
  }

  try {
    // Send event to trigger flow
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          properties: {
            discount_code: discountCode,
            discount_value: discountValue,
            discount_type: discountType,
            discount_text: discountText,
            checkout_url: finalRecoveryUrl,
            abandoned_checkout_id: abandonedCheckoutId,
            channel: channel
          },
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Grace Discount Offered'
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: channel === 'email' ? {
                email: customerEmail,
                first_name: customerName,
                properties: {
                  last_discount_code: discountCode,
                  last_discount_value: discountValue
                }
              } : {
                phone_number: customerPhone,
                first_name: customerName,
                properties: {
                  last_discount_code: discountCode,
                  last_discount_value: discountValue
                }
              }
            }
          },
          time: new Date().toISOString(),
          unique_id: `${discountCode}-${Date.now()}`
        }
      }
    };

    const response = await axios.post('https://a.klaviyo.com/api/events/', eventData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    console.log(`✅ Klaviyo event sent for ${channel} to ${channel === 'email' ? customerEmail : customerPhone}`);
    
    return {
      success: true,
      eventId: response.data?.data?.id || `event-${Date.now()}`,
      to: channel === 'email' ? customerEmail : customerPhone,
      status: 'triggered',
      platform: `klaviyo-${channel}-event`,
      note: 'Event sent - will trigger flow if configured'
    };

  } catch (error) {
    console.error(`Error sending Klaviyo ${channel} event:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Instructions for setting up Klaviyo Flow:
 * 
 * 1. Go to Klaviyo > Flows
 * 2. Create New Flow > Start from Scratch
 * 3. Set trigger to: API Event > "Grace Discount Offered"
 * 4. Add Email or SMS action
 * 5. Use these variables in your template:
 *    - {{ event.discount_code }}
 *    - {{ event.discount_value }}
 *    - {{ event.discount_text }}
 *    - {{ event.checkout_url }}
 * 6. Set flow to Live
 * 
 * This approach guarantees immediate sending without the "No Recipients" issue
 */

export default {
  sendDiscountViaEvent
};
