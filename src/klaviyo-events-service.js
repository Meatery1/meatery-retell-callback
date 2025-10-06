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
  let finalRecoveryUrl = recoveryUrl || 'https://themeatery.com/';
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
 * Send checkout link event to Klaviyo to trigger SMS/Email flow
 */
export async function sendCheckoutLinkViaKlaviyoEvent({
  customerEmail,
  customerPhone,
  customerName,
  checkoutUrl,
  discountPercentage = '0',
  channel = 'sms' // 'email' or 'sms'
}) {
  const klaviyoApiKey = process.env.KLAVIYO_API_KEY || process.env.KLAVIYO_PRIVATE_KEY;
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured');
  }

  try {
    console.log(`📤 Sending checkout link event to Klaviyo for ${channel}:`, {
      customerEmail,
      customerPhone, 
      customerName,
      checkoutUrl,
      discountPercentage,
      channel
    });
    
    // Send event to trigger checkout link flow
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          properties: {
            checkout_url: checkoutUrl,
            discount_percentage: discountPercentage,
            has_discount: discountPercentage && discountPercentage !== '0',
            channel: channel
          },
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Abandoned Checkout Link Sent'
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: channel === 'email' ? {
                email: customerEmail,
                first_name: customerName,
                phone_number: customerPhone || undefined,
                properties: {
                  last_checkout_link_sent: new Date().toISOString().split('T')[0]
                }
              } : {
                phone_number: customerPhone,
                first_name: customerName,
                email: customerEmail || undefined,
                properties: {
                  last_checkout_link_sent: new Date().toISOString().split('T')[0]
                }
              }
            }
          },
          time: new Date().toISOString(),
          unique_id: `checkout-link-${Date.now()}-${customerPhone || customerEmail}`
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

    console.log(`✅ Klaviyo checkout link event sent for ${channel} to ${channel === 'email' ? customerEmail : customerPhone}`);
    
    return {
      success: true,
      eventId: response.data?.data?.id || `event-${Date.now()}`,
      to: channel === 'email' ? customerEmail : customerPhone,
      status: 'triggered',
      platform: `klaviyo-${channel}-event`,
      note: 'Checkout link event sent - will trigger flow if configured'
    };

  } catch (error) {
    console.error(`Error sending Klaviyo checkout link ${channel} event:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send voicemail left event to Klaviyo to trigger SMS follow-up
 */
export async function sendVoicemailLeftEvent({
  customerEmail,
  customerPhone,
  customerName,
  callId,
  transcript,
  metadata = {},
  discountCode = null,
  discountValue = 20,
  checkoutUrl = null,
  totalValue = null,
  originalValue = null
}) {
  const klaviyoApiKey = process.env.KLAVIYO_API_KEY || process.env.KLAVIYO_PRIVATE_KEY;
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured');
  }

  // Calculate values if not provided
  const finalDiscountValue = discountValue || 20;
  const finalOriginalValue = originalValue || (totalValue ? (totalValue / (1 - finalDiscountValue/100)) : 422);
  const finalTotalValue = totalValue || (finalOriginalValue * (1 - finalDiscountValue/100));
  const finalCheckoutUrl = checkoutUrl || `https://themeatery.com/checkout?discount=${discountCode || `WINBACK${finalDiscountValue}`}&utm_source=grace_voicemail&utm_medium=sms&utm_campaign=voicemail_followup`;

  try {
    console.log(`🔍 Klaviyo voicemail event details:`, {
      customerEmail,
      customerPhone, 
      customerName,
      callId,
      checkoutUrl,
      totalValue,
      originalValue: finalOriginalValue
    });
    
    // Send event to trigger voicemail follow-up flow
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          properties: {
            call_id: callId,
            agent_name: 'Grace',
            voicemail_transcript: transcript,
            call_source: metadata.source || 'winback_campaign',
            customer_id: metadata.customer_id,
            days_since_last_order: metadata.days_since_last_order,
            total_spent: metadata.total_spent,
            winback_customer_id: metadata.winback_customer_id,
            // Add discount and checkout info for SMS template
            discount_value: finalDiscountValue,
            original_value: finalOriginalValue,
            total_value: finalTotalValue,
            checkout_url: finalCheckoutUrl,
            discount_text: `${finalDiscountValue}%`,
            // Add draft order details
            draft_order_id: metadata.draft_order_id
          },
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Grace Voicemail Left'
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: customerPhone ? {
                phone_number: customerPhone,
                first_name: customerName,
                email: customerEmail || undefined,
                properties: {
                  last_voicemail_call_id: callId,
                  last_voicemail_date: new Date().toISOString().split('T')[0]
                }
              } : {
                email: customerEmail,
                first_name: customerName,
                properties: {
                  last_voicemail_call_id: callId,
                  last_voicemail_date: new Date().toISOString().split('T')[0]
                }
              }
            }
          },
          time: new Date().toISOString(),
          unique_id: `voicemail-${callId}-${Date.now()}`
        }
      }
    };
    
    console.log(`📤 Sending Klaviyo event payload:`, JSON.stringify(eventData, null, 2));

    const response = await axios.post('https://a.klaviyo.com/api/events/', eventData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    console.log(`✅ Klaviyo voicemail event sent for ${customerPhone || customerEmail}`);
    console.log(`📊 Klaviyo API response:`, JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      eventId: response.data?.data?.id || `event-${Date.now()}`,
      to: customerPhone || customerEmail,
      status: 'triggered',
      platform: 'klaviyo-voicemail-event',
      note: 'Voicemail event sent - will trigger SMS follow-up flow if configured'
    };

  } catch (error) {
    console.error(`Error sending Klaviyo voicemail event:`, error.response?.data || error.message);
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
 * For Voicemail Follow-up Flow:
 * 1. Create New Flow > Start from Scratch
 * 2. Set trigger to: API Event > "Grace Voicemail Left"
 * 3. Add SMS action
 * 4. Use these variables in your template:
 *    - {{ person.first_name }}
 *    - {{ event.agent_name }}
 *    - {{ event.days_since_last_order }}
 * 5. Set flow to Live
 * 
 * This approach guarantees immediate sending without the "No Recipients" issue
 */

export default {
  sendDiscountViaEvent,
  sendVoicemailLeftEvent,
  sendCheckoutLinkViaKlaviyoEvent
};
