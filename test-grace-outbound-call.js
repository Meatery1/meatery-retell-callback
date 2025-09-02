import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const GRACE_AGENT_ID = 'agent_e2636fcbe1c89a7f6bd0731e11';

/**
 * Your abandoned checkout data from the fetch
 */
const ABANDONED_CHECKOUT_DATA = {
  checkout_id: '37329230495960',
  customer_name: 'Nick',
  phone: '16194587071', // Your phone number
  items_summary: '1x SavedBy Package Protection ($2.97), 1x Japanese A5 Wagyu Ribeye',
  total_price: 153.78,
  currency: 'USD',
  created_at: '2025-08-10T04:15:07Z',
  abandoned_url: 'https://real-american-bbq.myshopify.com/checkouts/37329230495960',
  line_items: [
    {
      title: 'SavedBy Package Protection',
      quantity: 1,
      variantTitle: '$2.97',
      price: 2.97
    },
    {
      title: 'Japanese A5 Wagyu Ribeye',
      quantity: 1,
      price: 146.46
    }
  ]
};

/**
 * Place an outbound call using Grace agent
 */
async function placeGraceOutboundCall() {
  try {
    console.log('🚀 Testing Grace Outbound Call');
    console.log('================================\n');
    
    // Check environment variables
    if (!RETELL_API_KEY) {
      throw new Error('Missing RETELL_API_KEY environment variable');
    }
    
    console.log('📞 Grace Agent Details:');
    console.log(`   Agent ID: ${GRACE_AGENT_ID}`);
    console.log(`   Name: The Meatery Abandoned Checkout Recovery Specialist`);
    console.log(`   Voice: Grace (11labs-Grace)`);
    console.log('');
    
    console.log('📋 Abandoned Checkout Data:');
    console.log(`   Customer: ${ABANDONED_CHECKOUT_DATA.customer_name}`);
    console.log(`   Phone: +1 (${ABANDONED_CHECKOUT_DATA.phone.substring(0, 3)}) ${ABANDONED_CHECKOUT_DATA.phone.substring(3, 6)}-${ABANDONED_CHECKOUT_DATA.phone.substring(6)}`);
    console.log(`   Items: ${ABANDONED_CHECKOUT_DATA.items_summary}`);
    console.log(`   Total: ${ABANDONED_CHECKOUT_DATA.currency} ${ABANDONED_CHECKOUT_DATA.total_price}`);
    console.log(`   Created: ${new Date(ABANDONED_CHECKOUT_DATA.created_at).toLocaleDateString()}`);
    console.log('');
    
    // Prepare call data with dynamic variables for Grace
    const callData = {
      fromNumber: '+16198212984', // Your Retell phone number for outbound calls
      toNumber: `+1${ABANDONED_CHECKOUT_DATA.phone}`,
      overrideAgentId: GRACE_AGENT_ID,
      direction: 'outbound',
      metadata: {
        checkout_id: ABANDONED_CHECKOUT_DATA.checkout_id,
        customer_name: ABANDONED_CHECKOUT_DATA.customer_name,
        total_value: ABANDONED_CHECKOUT_DATA.total_price.toString(),
        currency: ABANDONED_CHECKOUT_DATA.currency,
        items_count: ABANDONED_CHECKOUT_DATA.line_items.length.toString(),
        test_call: 'true'
      },
      retellLlmDynamicVariables: {
        customer_name: ABANDONED_CHECKOUT_DATA.customer_name,
        checkout_id: ABANDONED_CHECKOUT_DATA.checkout_id,
        items_summary: ABANDONED_CHECKOUT_DATA.items_summary,
        total_price: ABANDONED_CHECKOUT_DATA.total_price.toString(),
        currency: ABANDONED_CHECKOUT_DATA.currency,
        abandoned_url: ABANDONED_CHECKOUT_DATA.abandoned_url,
        days_since_abandoned: Math.floor((Date.now() - new Date(ABANDONED_CHECKOUT_DATA.created_at).getTime()) / (1000 * 60 * 60 * 24)).toString(),
        high_value_items: ABANDONED_CHECKOUT_DATA.total_price > 100 ? 'true' : 'false'
      }
    };
    
    console.log('📞 Placing outbound call...');
    console.log(`   From: ${callData.fromNumber}`);
    console.log(`   To: +1 (${ABANDONED_CHECKOUT_DATA.phone.substring(0, 3)}) ${ABANDONED_CHECKOUT_DATA.phone.substring(3, 6)}-${ABANDONED_CHECKOUT_DATA.phone.substring(6)}`);
    console.log('');
    
    // Make the API call to Retell
    const response = await axios.post(
      'https://api.retellai.com/create-phone-call',
      callData,
      {
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data && response.data.call_id) {
      console.log('🎉 SUCCESS! Outbound call initiated:');
      console.log(`   Call ID: ${response.data.call_id}`);
      console.log(`   Status: ${response.data.status || 'initiated'}`);
      console.log('');
      console.log('📱 Grace will now call your phone number!');
      console.log('   This is a real test call using your actual abandoned checkout data.');
      console.log('');
      console.log('💡 What to expect:');
      console.log('   - Grace will introduce herself as The Meatery Abandoned Checkout Recovery Specialist');
      console.log('   - She\'ll mention your abandoned cart with the Wagyu ribeye and package protection');
      console.log('   - She\'ll ask if you had any issues with the website');
      console.log('   - She\'ll offer a discount (up to 15%) to complete your purchase');
      console.log('   - The discount link will expire in one day');
      console.log('');
      console.log('🔍 You can monitor the call at:');
      console.log(`   https://app.retellai.com/call/${response.data.call_id}`);
      
      return {
        success: true,
        call_id: response.data.call_id,
        status: response.data.status
      };
      
    } else {
      throw new Error('No call ID received from Retell API');
    }
    
  } catch (error) {
    console.error('❌ Failed to place outbound call:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Check call status
 */
async function checkCallStatus(callId) {
  try {
    const response = await axios.get(
      `https://api.retellai.com/get-call/${callId}`,
      {
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Failed to check call status:', error.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎯 Grace Outbound Call Test');
  console.log('============================\n');
  
  // Check required environment variables
  if (!process.env.RETELL_API_KEY) {
    console.error('❌ Missing RETELL_API_KEY environment variable');
    console.log('   Please set this in your .env file');
    process.exit(1);
  }
  
  console.log('📞 Using your Retell phone number: +1 (619) 821-2984');
  console.log('');
  
  try {
    const result = await placeGraceOutboundCall();
    
    if (result.success) {
      console.log('✅ Call placement successful!');
      console.log(`   Call ID: ${result.call_id}`);
      
      // Wait a moment then check status
      console.log('\n⏳ Waiting 5 seconds to check call status...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const status = await checkCallStatus(result.call_id);
      if (status) {
        console.log('\n📊 Call Status Update:');
        console.log(`   Status: ${status.status || 'Unknown'}`);
        console.log(`   Duration: ${status.duration || 'N/A'}`);
        console.log(`   Agent: ${status.agent_id || 'N/A'}`);
      }
      
    } else {
      console.log('❌ Call placement failed:');
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n💥 Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
main();
