import axios from 'axios';
import dotenv from 'dotenv';
import { sendDiscountViaEvent } from './klaviyo-events-service.js';

dotenv.config();

/**
 * Get Klaviyo API key from environment
 */
function getKlaviyoApiKey() {
  return process.env.KLAVIYO_API_KEY || process.env.KLAVIYO_PRIVATE_KEY;
}

/**
 * Ensure discount code is appended to checkout URL
 */
function formatCheckoutUrl(baseUrl, discountCode, channel = 'email') {
  if (!baseUrl) {
    baseUrl = 'https://themeatery.com/';
  }
  
  // Check if URL already has discount parameter
  const url = new URL(baseUrl);
  if (!url.searchParams.has('discount') && discountCode) {
    url.searchParams.set('discount', discountCode);
  }
  
  // Add UTM parameters for tracking
  url.searchParams.set('utm_source', 'grace_ai');
  url.searchParams.set('utm_medium', channel);
  url.searchParams.set('utm_campaign', 'discount_recovery');
  
  return url.toString();
}

/**
 * FIXED: Send discount email via Klaviyo Campaign
 */
export async function sendKlaviyoDiscountEmail({
  customerEmail,
  customerName,
  discountValue,
  discountType = 'percentage',
  orderNumber = null,
  discountCode = null,
  recoveryUrl = null
}) {
  const klaviyoApiKey = getKlaviyoApiKey();
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured');
  }

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;
    
  // Format checkout URL with discount code for email
  const formattedUrl = formatCheckoutUrl(recoveryUrl, discountCode, 'email');

  try {
    // Step 1: Get or create customer profile
    let profileId;
    
    // Check if profile exists
    const getProfileResponse = await axios.get(
      `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${customerEmail}")`,
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'revision': '2024-10-15'
        }
      }
    );
    
    if (getProfileResponse.data.data.length > 0) {
      profileId = getProfileResponse.data.data[0].id;
      
      // Update existing profile
      await axios.patch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
                          properties: {
                discount_code: discountCode,
                discount_value: discountValue,
                discount_type: discountType,
                checkout_url: formattedUrl
            }
          }
        }
      }, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
    } else {
      // Create new profile
      const createResponse = await axios.post('https://a.klaviyo.com/api/profiles/', {
        data: {
          type: 'profile',
          attributes: {
            email: customerEmail,
            first_name: customerName,
                          properties: {
                discount_code: discountCode,
                discount_value: discountValue,
                discount_type: discountType,
                checkout_url: formattedUrl
            }
          }
        }
      }, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
      profileId = createResponse.data.data.id;
    }

    // Step 2: Create a temporary list for this recipient
    const listData = {
      data: {
        type: 'list',
        attributes: {
          name: `Temp Email - ${customerName} - ${discountCode || Date.now()}`
        }
      }
    };

    const listResponse = await axios.post('https://a.klaviyo.com/api/lists/', listData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const listId = listResponse.data.data.id;
    
    // Step 3: Subscribe profile to email marketing and add to list
    // First, subscribe the profile to email marketing
    await axios.post('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              id: profileId,
              attributes: {
                email: customerEmail,
                subscriptions: {
                  email: {
                    marketing: {
                      consent: 'SUBSCRIBED'
                    }
                  }
                }
              }
            }]
          }
        }
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    // Then add profile to list - CRITICAL: Must be done BEFORE campaign creation
    await axios.post(`https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`, {
      data: [{
        type: 'profile',
        id: profileId
      }]
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    // Wait for subscription and list membership to propagate
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Create campaign WITH campaign-messages in proper structure
    const campaignData = {
      data: {
        type: 'campaign',
        attributes: {
          name: `Grace Discount - ${discountCode} (${customerName})`,
          audiences: {
            included: [listId]
          },
          send_strategy: {
            method: 'immediate'
          },
          send_options: {
            use_smart_sending: false
          },
          'campaign-messages': {
            data: [
              {
                type: 'campaign-message',
                attributes: {
                  channel: 'email',
                  label: `Grace Discount Email - ${discountCode}`,
                  content: {
                    subject: `Your ${discountText} off discount from The Meatery 🥩`,
                    from_email: 'grace@themeatery.com',
                    from_label: 'Grace from The Meatery',
                    reply_to_email: 'grace@themeatery.com',
                    preview_text: `Here's your exclusive ${discountText} off discount code!`
                  }
                }
              }
            ]
          }
        }
      }
    };

    const campaignResponse = await axios.post('https://a.klaviyo.com/api/campaigns/', campaignData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const campaignId = campaignResponse.data.data.id;
    const campaignMessageId = campaignResponse.data.data.relationships['campaign-messages'].data[0].id;

    // Step 5: Create and assign template
    const templateData = {
      data: {
        type: 'template',
        attributes: {
          name: `Grace Discount Template - ${discountText}`,
          editor_type: 'CODE',
          html: generateEmailHTML({
            customerName,
            discountCode,
            discountValue,
            discountText,
            checkoutUrl: formattedUrl
          })
        }
      }
    };

    const templateResponse = await axios.post('https://a.klaviyo.com/api/templates/', templateData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const templateId = templateResponse.data.data.id;

    // Step 6: Assign template to campaign message
    await axios.post(`https://a.klaviyo.com/api/campaign-message-assign-template/`, {
      data: {
        type: 'campaign-message',
        id: campaignMessageId,
        relationships: {
          template: {
            data: {
              type: 'template',
              id: templateId
            }
          }
        }
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    // Step 7: Trigger the campaign send
    await axios.post('https://a.klaviyo.com/api/campaign-send-jobs/', {
      data: {
        type: 'campaign-send-job',
        id: campaignId,
        attributes: {}
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    console.log(`✅ Klaviyo email campaign sent to ${customerEmail}:`, campaignId);
    
    return {
      success: true,
      campaignId: campaignId,
      to: customerEmail,
      status: 'sent',
      platform: 'klaviyo-email'
    };

  } catch (error) {
    console.error('Error sending Klaviyo email campaign:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * FIXED: Send discount SMS via Klaviyo Campaign
 */
export async function sendKlaviyoDiscountSMS({
  customerPhone,
  customerName,
  discountValue,
  discountType = 'percentage',
  orderNumber = null,
  discountCode = null,
  recoveryUrl = null
}) {
  const klaviyoApiKey = getKlaviyoApiKey();
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured');
  }

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;
    
  // Format checkout URL with discount code for SMS
  const formattedUrl = formatCheckoutUrl(recoveryUrl, discountCode, 'sms');

  try {
    // Format phone for E.164
    const formattedPhone = customerPhone.startsWith('+') 
      ? customerPhone 
      : `+1${customerPhone.replace(/\D/g, '')}`;

    // Step 1: Get or create profile
    let profileId;
    
    const getProfileResponse = await axios.get(
      `https://a.klaviyo.com/api/profiles/?filter=equals(phone_number,"${formattedPhone}")`,
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'revision': '2024-10-15'
        }
      }
    );
    
    if (getProfileResponse.data.data.length > 0) {
      profileId = getProfileResponse.data.data[0].id;
    } else {
      // Create new profile
      const createResponse = await axios.post('https://a.klaviyo.com/api/profiles/', {
        data: {
          type: 'profile',
          attributes: {
            phone_number: formattedPhone,
            first_name: customerName,
            properties: {
              discount_code: discountCode,
              discount_value: discountValue
            }
          }
        }
      }, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
      profileId = createResponse.data.data.id;
    }

    // Step 2: Subscribe to SMS
    console.log(`📱 Subscribing ${formattedPhone} to SMS...`);
    try {
      await axios.post('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [{
                type: 'profile',
                id: profileId,
                attributes: {
                  phone_number: formattedPhone,
                  subscriptions: {
                    sms: {
                      marketing: {
                        consent: 'SUBSCRIBED'
                      }
                    }
                  }
                }
              }]
            }
          }
        }
      }, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
      console.log('✅ SMS subscription job created');
    } catch (subError) {
      console.error('⚠️ SMS subscription failed:', subError.response?.data || subError.message);
      // Continue anyway - they might already be subscribed
    }

    // Step 3: Create temporary list
    const listResponse = await axios.post('https://a.klaviyo.com/api/lists/', {
      data: {
        type: 'list',
        attributes: {
          name: `Temp SMS - ${customerName} - ${discountCode || Date.now()}`
        }
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const listId = listResponse.data.data.id;
    console.log(`📋 Created list: ${listId}`);
    
    // Step 4: Add profile to list BEFORE campaign creation
    console.log(`📎 Adding profile ${profileId} to list ${listId}...`);
    await axios.post(`https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`, {
      data: [{
        type: 'profile',
        id: profileId
      }]
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });
    console.log('✅ Profile added to list');

    // Step 4b: Verify the profile is actually in the list (best-effort)
    console.log('🔍 Verifying list membership...');
    let retries = 0;
    let membershipConfirmed = false;
    while (retries < 5 && !membershipConfirmed) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        // Klaviyo list membership filters can be finicky; fall back to phone filter
        const listCheckResponse = await axios.get(
          `https://a.klaviyo.com/api/lists/${listId}/profiles?filter=equals(phone_number,"${formattedPhone}")`,
          {
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
              'revision': '2024-10-15'
            }
          }
        );
        const rows = Array.isArray(listCheckResponse.data?.data) ? listCheckResponse.data.data : [];
        if (rows.length > 0) {
          console.log('✅ List membership confirmed!');
          membershipConfirmed = true;
        } else {
          console.log(`⏳ Retry ${retries + 1}: Profile not yet in list, waiting...`);
          retries++;
        }
      } catch (checkError) {
        console.log(`⚠️ Error checking list membership: ${checkError.response?.status || ''} ${checkError.message}`);
        retries++;
      }
    }
    if (!membershipConfirmed) {
      console.error('❌ Failed to confirm list membership after 15 seconds');
      // Fallback: trigger SMS via Events API to ensure delivery
      try {
        const eventResult = await sendDiscountViaEvent({
          customerEmail: null,
          customerPhone: formattedPhone,
          customerName,
          discountValue,
          discountType,
          discountCode,
          recoveryUrl: formattedUrl,
          abandonedCheckoutId: null,
          channel: 'sms'
        });
        console.log('✅ Fallback event triggered for SMS');
        return {
          success: true,
          campaignId: null,
          to: customerPhone,
          status: 'event_triggered',
          platform: 'klaviyo-sms-event',
          event: eventResult
        };
      } catch (eventErr) {
        console.error('❌ Fallback event failed:', eventErr.response?.data || eventErr.message);
        // Continue to attempt campaign anyway
      }
    }

    // Step 5: Create campaign WITH campaign-messages in proper structure
    const campaignResponse = await axios.post('https://a.klaviyo.com/api/campaigns/', {
      data: {
        type: 'campaign',
        attributes: {
          name: `Grace SMS - ${discountCode} (${customerName})`,
          audiences: {
            included: [listId]
          },
          send_strategy: {
            method: 'immediate'
          },
          send_options: {
            use_smart_sending: false
          },
          'campaign-messages': {
            data: [
              {
                type: 'campaign-message',
                attributes: {
                  channel: 'sms',
                            content: {
            body: `The Meatery: Hi ${customerName}! Grace here. Your ${discountText} discount code: ${discountCode}. Complete your order: ${formattedUrl} (expires 24hrs) Questions? 619-752-4353`
          },
                  render_options: {
                    shorten_links: true,
                    add_org_prefix: true,
                    add_info_link: true,
                    add_opt_out_language: true
                  }
                }
              }
            ]
          }
        }
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const campaignId = campaignResponse.data.data.id;
    console.log(`📨 Campaign created: ${campaignId}`);

    // Step 6: Trigger campaign send
    console.log('🚀 Triggering campaign send...');
    await axios.post('https://a.klaviyo.com/api/campaign-send-jobs/', {
      data: {
        type: 'campaign-send-job',
        id: campaignId,
        attributes: {}
      }
    }, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    console.log(`✅ Klaviyo SMS campaign sent to ${customerPhone}:`, campaignId);
    
    return {
      success: true,
      campaignId: campaignId,
      to: customerPhone,
      status: 'sent',
      platform: 'klaviyo-sms'
    };

  } catch (error) {
    console.error('Error sending Klaviyo SMS campaign:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate HTML email template
 */
function generateEmailHTML({ customerName, discountCode, discountValue, discountText, checkoutUrl }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Exclusive Discount from The Meatery</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background-color: #8B4513; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0;">The Meatery</h1>
    </div>
    
    <div style="padding: 40px 30px;">
      <h2 style="color: #333333; margin-bottom: 20px;">Hi ${customerName}!</h2>
      
      <p style="color: #666666; font-size: 16px; line-height: 1.6;">
        Grace from The Meatery here! Thank you for considering us for your premium meat needs.
      </p>
      
      <div style="background-color: #f8f8f8; border-left: 4px solid #8B4513; padding: 20px; margin: 30px 0;">
        <p style="color: #333333; font-size: 18px; margin: 0;">
          <strong>Your Exclusive Discount:</strong>
        </p>
        <p style="color: #8B4513; font-size: 48px; font-weight: bold; margin: 10px 0; text-align: center;">
          ${discountText} OFF
        </p>
        <p style="color: #333333; font-size: 20px; margin: 15px 0; text-align: center;">
          Use Code: <span style="background: #8B4513; color: white; padding: 5px 15px; border-radius: 5px; font-weight: bold;">${discountCode}</span>
        </p>
        <p style="color: #666666; font-size: 14px; margin: 0; text-align: center;">
          Valid for 24 hours
        </p>
      </div>
      
      ${checkoutUrl ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${checkoutUrl}" style="display: inline-block; background-color: #8B4513; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px;">
          Complete Your Order
        </a>
      </div>
      ` : ''}
      
      <p style="color: #666666; font-size: 14px; line-height: 1.6;">
        If you have any questions, feel free to reply to this email or call us at (619) 752-4353.
      </p>
      
      <p style="color: #666666; font-size: 14px; line-height: 1.6;">
        Best regards,<br>
        Grace & The Meatery Team
      </p>
    </div>
    
    <div style="background-color: #f8f8f8; padding: 20px; text-align: center; color: #999999; font-size: 12px;">
      <p>The Meatery | 6160 Fairmount Avenue Suite E, San Diego, CA 92120</p>
      <p>
        <a href="{% unsubscribe %}" style="color: #999999;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export default {
  sendKlaviyoDiscountEmail,
  sendKlaviyoDiscountSMS
};
