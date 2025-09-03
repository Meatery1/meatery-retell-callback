/**
 * Klaviyo Campaign Service for Dynamic Discount Codes
 * Creates and sends one-off campaigns with dynamic discount percentages
 * Integrates with Shopify GraphQL API for abandoned cart recovery and UTM tracking
 */

import axios from 'axios';

// API configuration - loaded dynamically to ensure dotenv is processed
function getKlaviyoApiKey() {
  return process.env.KLAVIYO_API_KEY;
}

function getShopifyConfig() {
  return {
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    token: process.env.SHOPIFY_ADMIN_TOKEN
  };
}

/**
 * Create a Shopify discount code with 1-day expiration and UTM tracking
 */
/**
 * Get Shopify customer ID by email
 */
async function getShopifyCustomerByEmail(email) {
  const shopifyConfig = getShopifyConfig();
  
  try {
    const response = await axios.get(
      `https://${shopifyConfig.domain}/admin/api/2024-10/customers/search.json`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.token
        },
        params: {
          query: `email:${email}`
        }
      }
    );
    
    const customers = response.data.customers || [];
    return customers.length > 0 ? customers[0] : null;
  } catch (error) {
    console.error('Error finding customer by email:', error.message);
    return null;
  }
}

async function createShopifyDiscountCode({
  discountValue,
  discountType,
  customerEmail,
  orderNumber = null
}) {
  const shopifyConfig = getShopifyConfig();
  if (!shopifyConfig.domain || !shopifyConfig.token) {
    throw new Error('Shopify configuration missing. Please set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN environment variables.');
  }

  const discountCode = `GRACE${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 1); // 1 day expiration

  // Get customer ID for customer-specific discount
  const customer = await getShopifyCustomerByEmail(customerEmail);
  
  const mutation = `
    mutation createDiscountCode($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      title: `Grace Discount - ${customerEmail}`,
      code: discountCode,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt.toISOString(),
      // Make discount customer-specific if customer exists, otherwise open to all
      customerSelection: customer ? {
        customers: {
          add: [`gid://shopify/Customer/${customer.id}`]
        }
      } : {
        all: true
      },
      customerGets: {
        value: {
          percentage: discountType === 'percentage' ? discountValue / 100 : 0,
          fixedAmount: discountType === 'fixed_amount' ? {
            amount: discountValue,
            currencyCode: 'USD'
          } : null
        },
        items: {
          all: true
        },
        // Apply to both one-time purchases and first subscription order only
        appliesOnSubscription: true,
        appliesOnOneTimePurchase: true
      },
      minimumRequirement: {
        quantity: {
          greaterThanOrEqualToQuantity: "1"
        }
      },
      usageLimit: 1,
      appliesOncePerCustomer: true
    }
  };

  try {
    const response = await axios.post(
      `https://${shopifyConfig.domain}/admin/api/2024-10/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    const result = response.data.data.discountCodeBasicCreate;
    if (result.userErrors.length > 0) {
      throw new Error(`Shopify user errors: ${JSON.stringify(result.userErrors)}`);
    }

    return {
      code: discountCode,
      id: result.codeDiscountNode.id,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    console.error('Error creating Shopify discount code:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get abandoned checkout recovery URL with UTM tracking
 */
async function getAbandonedCheckoutRecoveryUrl(customerEmail, orderNumber = null) {
  const shopifyConfig = getShopifyConfig();
  if (!shopifyConfig.domain || !shopifyConfig.token) {
    console.warn('Shopify not configured, using fallback URL');
    return `https://themeatery.com/cart?utm_source=grace_dialer&utm_medium=phone&utm_campaign=abandoned_cart_recovery&utm_content=${orderNumber || 'unknown'}`;
  }

  const query = `
    query getAbandonedCheckouts($query: String) {
      abandonedCheckouts(first: 10, query: $query) {
        nodes {
          id
          abandonedCheckoutUrl
          customer {
            email
            firstName
            lastName
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 5) {
            nodes {
              title
              quantity
              originalUnitPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    query: `email:${customerEmail}`
  };

  try {
    const response = await axios.post(
      `https://${shopifyConfig.domain}/admin/api/2024-10/graphql.json`,
      { query, variables },
      {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      console.error('Shopify GraphQL errors:', response.data.errors);
      return getFallbackRecoveryUrl(orderNumber);
    }

    const checkouts = response.data.data.abandonedCheckouts.nodes;
    if (checkouts.length > 0) {
      const checkout = checkouts[0]; // Get most recent
      const utmParams = `utm_source=grace_dialer&utm_medium=phone&utm_campaign=abandoned_cart_recovery&utm_content=${orderNumber || checkout.id}`;
      return `${checkout.abandonedCheckoutUrl}?${utmParams}`;
    }

    return getFallbackRecoveryUrl(orderNumber);
  } catch (error) {
    console.error('Error getting abandoned checkout URL:', error.response?.data || error.message);
    return getFallbackRecoveryUrl(orderNumber);
  }
}

/**
 * Get fallback recovery URL with UTM tracking
 */
function getFallbackRecoveryUrl(orderNumber = null) {
  return `https://themeatery.com/cart?utm_source=grace_dialer&utm_medium=phone&utm_campaign=abandoned_cart_recovery&utm_content=${orderNumber || 'unknown'}`;
}

/**
 * Create and send a one-off email campaign with dynamic discount
 */
export async function sendKlaviyoDiscountEmail({
  customerEmail,
  customerName,
  discountValue,
  discountType = 'percentage',
  orderNumber = null
}) {
  const klaviyoApiKey = getKlaviyoApiKey();
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured. Please set KLAVIYO_API_KEY environment variable.');
  }

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;

  try {
    // Create Shopify discount code with 1-day expiration
    console.log(`🏷️ Creating Shopify discount code for ${customerEmail}...`);
    const discount = await createShopifyDiscountCode({
      discountValue,
      discountType,
      customerEmail,
      orderNumber
    });

    // Get abandoned checkout recovery URL with UTM tracking
    console.log(`🔗 Getting abandoned checkout recovery URL for ${customerEmail}...`);
    const recoveryUrl = await getAbandonedCheckoutRecoveryUrl(customerEmail, orderNumber);
    
    // Step 1: Get or create customer profile FIRST
    let profileId;
    
    // First, try to get existing profile by email
    const getProfileResponse = await axios.get(`https://a.klaviyo.com/api/profiles/?filter=equals(email,"${customerEmail}")`, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'revision': '2024-10-15'
      }
    });
    
    if (getProfileResponse.data.data.length > 0) {
      // Profile exists, update it
      profileId = getProfileResponse.data.data[0].id;
      
      const updateData = {
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
            properties: {
              discount_code: discount.code,
              discount_value: discountValue,
              discount_type: discountType,
              discount_text: discountText,
              checkout_url: recoveryUrl,
              abandoned_checkout_url: recoveryUrl,
              order_number: orderNumber,
              grace_discount_date: new Date().toISOString(),
              utm_source: 'grace_ai_dialer',
              utm_medium: 'phone_call',
              utm_campaign: 'abandoned_cart_recovery'
            }
          }
        }
      };
      
      await axios.patch(`https://a.klaviyo.com/api/profiles/${profileId}/`, updateData, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
    } else {
      // Profile doesn't exist, create it
      const profileData = {
        data: {
          type: 'profile',
          attributes: {
            email: customerEmail,
            first_name: customerName,
            properties: {
              discount_code: discount.code,
              discount_value: discountValue,
              discount_type: discountType,
              discount_text: discountText,
              checkout_url: recoveryUrl,
              abandoned_checkout_url: recoveryUrl,
              order_number: orderNumber,
              grace_discount_date: new Date().toISOString(),
              utm_source: 'grace_ai_dialer',
              utm_medium: 'phone_call',
              utm_campaign: 'abandoned_cart_recovery'
            }
          }
        }
      };
      
      const createResponse = await axios.post('https://a.klaviyo.com/api/profiles/', profileData, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
      profileId = createResponse.data.data.id;
    }
    
    // Step 2: Create a temporary list for this single recipient
    const listData = {
      data: {
        type: 'list',
        attributes: {
          name: `Temp - ${customerName} - ${discount.code}`
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
    
    // Step 3: Add the profile to the list BEFORE creating the campaign
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
    
    // Step 3b: Subscribe the profile to email marketing to ensure they can receive campaigns
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

  // Step 2: Create the campaign WITH messages and the temporary list
  const campaignData = {
    data: {
      type: 'campaign',
      attributes: {
        name: `Grace Discount - ${discount.code} (${customerName})`,
        audiences: {
          included: [listId] // Use the temporary list with single recipient
        },
        send_strategy: {
          method: 'immediate'
        },
        send_options: {
          use_smart_sending: false
        },
        'campaign-messages': {
          data: [{
            type: 'campaign-message',
            attributes: {
              channel: 'email',
              label: `Grace Discount Email - ${discount.code}`,
              content: {
                subject: `Your ${discountText} off discount from The Meatery 🥩`,
                from_email: 'grace@themeatery.com',
                from_label: 'Grace from The Meatery',
                reply_to_email: 'grace@themeatery.com',
                preview_text: `Here's your exclusive ${discountText} off discount code!`
              }
            }
          }]
        }
      }
    }
  };

    // Create the campaign
    const campaignResponse = await axios.post('https://a.klaviyo.com/api/campaigns/', campaignData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const campaignId = campaignResponse.data.data.id;
    const campaignMessageId = campaignResponse.data.data.relationships['campaign-messages'].data[0].id;

    // Step 5: Create the email template with dynamic discount
    const templateData = {
      data: {
        type: 'template',
        attributes: {
          name: `Grace Discount Template - ${discountText}`,
          editor_type: 'CODE',
          html: generateKlaviyoStyleHTML({
            customerName,
            discountCode: discount.code,
            discountValue,
            discountType,
            discountText,
            checkoutUrl: recoveryUrl,
            orderNumber,
            abandonedCheckoutUrl: recoveryUrl
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

    // Step 7: Send the campaign
    await axios.post('https://a.klaviyo.com/api/campaign-send-jobs/', {
      data: {
        type: 'campaign-send-job',
        id: campaignId
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
      templateId: templateId,
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
 * Create and send a one-off SMS campaign with dynamic discount
 */
export async function sendKlaviyoDiscountSMS({
  customerPhone,
  customerName,
  discountValue,
  discountType = 'percentage',
  orderNumber = null
}) {
  const klaviyoApiKey = getKlaviyoApiKey();
  if (!klaviyoApiKey) {
    throw new Error('Klaviyo API key not configured. Please set KLAVIYO_API_KEY environment variable.');
  }

  const discountText = discountType === 'percentage' 
    ? `${discountValue}%` 
    : `$${discountValue}`;

  try {
    // Create Shopify discount code with 1-day expiration
    console.log(`🏷️ Creating Shopify discount code for ${customerPhone}...`);
    const discount = await createShopifyDiscountCode({
      discountValue,
      discountType,
      customerEmail: customerPhone, // Use phone as identifier
      orderNumber
    });

    // Get abandoned checkout recovery URL with UTM tracking
    console.log(`🔗 Getting abandoned checkout recovery URL for ${customerPhone}...`);
    const recoveryUrl = await getAbandonedCheckoutRecoveryUrl(customerPhone, orderNumber);

    // Step 1: Get or create customer profile with phone FIRST
    let profileId;
    
    // Format phone number for E.164 (add + if not present)
    const formattedPhone = customerPhone.startsWith('+') ? customerPhone : `+1${customerPhone.replace(/\D/g, '')}`;
    
    // First, try to get existing profile by phone
    const getProfileResponse = await axios.get(`https://a.klaviyo.com/api/profiles/?filter=equals(phone_number,"${formattedPhone}")`, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'revision': '2024-10-15'
      }
    });
    
    if (getProfileResponse.data.data.length > 0) {
      // Profile exists, update it
      profileId = getProfileResponse.data.data[0].id;
      
      const updateData = {
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
            properties: {
              discount_code: discount.code,
              discount_value: discountValue,
              discount_type: discountType,
              discount_text: discountText,
              checkout_url: recoveryUrl,
              abandoned_checkout_url: recoveryUrl,
              order_number: orderNumber,
              grace_discount_date: new Date().toISOString(),
              utm_source: 'grace_ai_dialer',
              utm_medium: 'phone_call',
              utm_campaign: 'abandoned_cart_recovery'
            }
          }
        }
      };
      
      await axios.patch(`https://a.klaviyo.com/api/profiles/${profileId}/`, updateData, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
    } else {
      // Profile doesn't exist, create it
      const profileData = {
        data: {
          type: 'profile',
          attributes: {
            phone_number: formattedPhone,
            first_name: customerName,
            properties: {
              discount_code: discount.code,
              discount_value: discountValue,
              discount_type: discountType,
              discount_text: discountText,
              checkout_url: recoveryUrl,
              abandoned_checkout_url: recoveryUrl,
              order_number: orderNumber,
              grace_discount_date: new Date().toISOString(),
              utm_source: 'grace_ai_dialer',
              utm_medium: 'phone_call',
              utm_campaign: 'abandoned_cart_recovery'
            }
          }
        }
      };
      
      const createResponse = await axios.post('https://a.klaviyo.com/api/profiles/', profileData, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15'
        }
      });
      profileId = createResponse.data.data.id;
    }
    
    // Step 2: Subscribe profile to SMS marketing if not already subscribed
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

    // Step 3: Create a temporary list for this single recipient
    const listData = {
      data: {
        type: 'list',
        attributes: {
          name: `Temp SMS - ${customerName} - ${discount.code}`
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
    
    // Step 4: Add the profile to the list BEFORE creating the campaign
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

  // Step 2: Create the SMS campaign WITH messages and the temporary list
    const campaignData = {
    data: {
      type: 'campaign',
      attributes: {
        name: `Grace SMS Discount - ${discount.code} (${customerName})`,
        audiences: {
          included: [listId] // Use the temporary list with single recipient
        },
        send_strategy: {
          method: 'immediate'
        },
        send_options: {
          use_smart_sending: false
        },
        'campaign-messages': {
          data: [{
            type: 'campaign-message',
            attributes: {
              channel: 'sms',
              content: {
                body: `Hi ${customerName}! Grace from The Meatery here. Your ${discountText} discount code is: ${discount.code}. Use it at ${recoveryUrl} - expires in 1 day! 🥩`
              },
              render_options: {
                shorten_links: true,
                add_org_prefix: true,
                add_info_link: true,
                add_opt_out_language: true
              }
            }
          }]
        }
      }
    }
  };

    // Create the campaign
    const campaignResponse = await axios.post('https://a.klaviyo.com/api/campaigns/', campaignData, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      }
    });

    const campaignId = campaignResponse.data.data.id;
    const campaignMessageId = campaignResponse.data.data.relationships['campaign-messages'].data[0].id;

    // Note: With immediate send strategy, the campaign will be sent automatically
    // when it's created with recipients in the list

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
 * Create discount and send via Klaviyo (email or SMS based on preference)
 * Integrates with Shopify MCP for abandoned cart recovery and UTM tracking
 */
export async function createAndSendKlaviyoDiscount({
  customerEmail,
  customerName,
  customerPhone,
  discountType = 'percentage',
  discountValue = 10,
  reason = 'customer_service',
  orderNumber = null,
  preferredChannel = 'email', // 'email' or 'sms'
  abandonedCheckoutId = null // Optional: Shopify abandoned checkout ID
}) {
  try {
    // Cap discount at 15% maximum
    if (discountType === 'percentage' && discountValue > 15) {
      console.log(`⚠️ Discount capped at 15% (requested: ${discountValue}%)`);
      discountValue = 15;
    }

    // Create the discount code in Shopify with 1-day expiration
    const discount = await createShopifyDiscountCode({
      discountValue,
      discountType,
      customerEmail: customerEmail || customerPhone,
      orderNumber
    });

    // Get abandoned checkout recovery URL with UTM tracking
    const recoveryUrl = await getAbandonedCheckoutRecoveryUrl(customerEmail || customerPhone, orderNumber);

    let result;
    
    // Send via preferred channel
    if (preferredChannel === 'sms' && customerPhone) {
      result = await sendKlaviyoDiscountSMS({
        customerPhone,
        customerName,
        discountValue,
        discountType,
        orderNumber
      });
    } else {
      // Default to email
      result = await sendKlaviyoDiscountEmail({
        customerEmail,
        customerName,
        discountValue,
        discountType,
        orderNumber
      });
    }

    // Log the discount creation
    console.log(`✅ Discount created and sent via Klaviyo ${preferredChannel}:`, {
      code: discount.code,
      customer: customerName,
      email: customerEmail,
      phone: customerPhone,
      order: orderNumber,
      abandonedCheckout: abandonedCheckoutId,
      reason,
      platform: `klaviyo-${preferredChannel}`,
      utm_tracking: 'enabled'
    });

    return {
      success: true,
      discount,
      message: result,
      abandonedCheckoutUrl: result.recoveryUrl || null,
      utmTracking: 'enabled',
      summary: `${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount code ${discount.code} sent to ${preferredChannel === 'sms' ? customerPhone : customerEmail} via Klaviyo ${preferredChannel} with UTM tracking`
    };

  } catch (error) {
    console.error('Error in createAndSendKlaviyoDiscount:', error);
    return {
      success: false,
      error: error.message,
      summary: `Failed to create/send Klaviyo discount: ${error.message}`
    };
  }
}



/**
 * Generate Klaviyo-style HTML email template with abandoned cart recovery
 */
function generateKlaviyoStyleHTML({
  customerName,
  discountCode,
  discountValue,
  discountType,
  discountText,
  checkoutUrl,
  orderNumber,
  abandonedCheckoutUrl
}) {
  const primaryCTA = abandonedCheckoutUrl || checkoutUrl;
  const ctaText = abandonedCheckoutUrl ? 'Complete Your Order' : 'Shop Now & Use Your Code';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${discountText} Discount from The Meatery</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #8B0000; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; }
    .discount-box { background-color: #f8f8f8; border: 2px dashed #8B0000; padding: 20px; text-align: center; margin: 20px 0; }
    .discount-code { font-size: 24px; font-weight: bold; color: #8B0000; letter-spacing: 2px; }
    .cta-button { background-color: #8B0000; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
    .footer { background-color: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
    .urgency { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🥩 The Meatery</h1>
      <p>Premium Quality Meats</p>
    </div>
    
    <div class="content">
      <h2>Hi ${customerName}!</h2>
      
      <p>Grace here from The Meatery! Thank you for speaking with me today. As promised, here's your special ${discountText} discount code:</p>
      
      <div class="discount-box">
        <h3>Your Discount Code</h3>
        <div class="discount-code">${discountCode}</div>
        <p><strong>${discountText} OFF</strong> your next order</p>
        <p>Expires in 1 day</p>
      </div>
      
      ${abandonedCheckoutUrl ? `
      <div class="urgency">
        <h3>⏰ Don't Forget Your Items!</h3>
        <p>I noticed you had some items in your cart. Use your discount code to complete your order and save ${discountText}!</p>
      </div>
      ` : ''}
      
      <p>Use this code at checkout to save ${discountText} on your next order of our premium meats.</p>
      
      <div style="text-align: center;">
        <a href="${primaryCTA}" class="cta-button">${ctaText}</a>
      </div>
      
      <p>If you have any questions, feel free to reach out to us at <a href="mailto:hello@themeatery.com">hello@themeatery.com</a> or call us at (619) 391-3495.</p>
      
      <p>Thank you for choosing The Meatery!</p>
      
      <p>Best regards,<br>
      Grace<br>
      Customer Experience Team<br>
      The Meatery</p>
      
      ${orderNumber ? `<p><small>Reference: Order #${orderNumber}</small></p>` : ''}
    </div>
    
    <div class="footer">
      <p>The Meatery | Premium Quality Meats</p>
      <p>Phone: (619) 391-3495 | Email: hello@themeatery.com</p>
      <p>Website: <a href="https://themeatery.com" style="color: #ccc;">themeatery.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Test Klaviyo connection
 */
export async function testKlaviyoConnection() {
  const klaviyoApiKey = getKlaviyoApiKey();
  if (!klaviyoApiKey) {
    return {
      success: false,
      error: 'Klaviyo API key not configured'
    };
  }

  try {
    const response = await axios.get('https://a.klaviyo.com/api/accounts/', {
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'revision': '2024-10-15'
      }
    });

    return {
      success: true,
      account: response.data.data.attributes,
      message: 'Klaviyo connection successful'
    };

  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}