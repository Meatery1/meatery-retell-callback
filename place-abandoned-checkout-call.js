import { Retell } from 'retell-sdk';
import { fetchAbandonedCheckouts, formatCheckoutForCall, checkCustomerHistory, checkDiscountEligibility } from './src/abandoned-checkout-service.js';
import { RETELL_AGENTS, RETELL_PHONE_NUMBERS } from './src/retell-config.js';
import dotenv from 'dotenv';

dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Configuration - Use centralized config
const ABANDONED_CHECKOUT_AGENT_ID = RETELL_AGENTS.GRACE_ABANDONED_CHECKOUT;
const DEFAULT_FROM_NUMBER = RETELL_PHONE_NUMBERS.GRACE_ABANDONED_CHECKOUT;

/**
 * Place outbound call for abandoned checkout recovery
 */
export async function placeAbandonedCheckoutCall({
  checkoutId,
  phone,
  customerName,
  itemsSummary,
  totalPrice,
  currency = 'USD',
  email = null,
  agentId = ABANDONED_CHECKOUT_AGENT_ID
}) {
  try {
    // Check if customer has recent successful orders
    const { hasRecentOrders, lastOrderDate } = await checkCustomerHistory(phone, email);
    
    if (hasRecentOrders) {
      console.log(`⚠️ Skipping ${phone} - customer has recent successful orders`);
      return { skipped: true, reason: 'recent_successful_orders', lastOrderDate };
    }
    
    // Format phone number
    const toNumber = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    
    console.log(`📞 Placing Abandoned Checkout Recovery Call`);
    console.log(`==========================================\n`);
    console.log(`To: ${toNumber}`);
    console.log(`Customer: ${customerName}`);
    console.log(`Items: ${itemsSummary}`);
    console.log(`Total: ${currency} ${totalPrice}\n`);
    
    const call = await retell.call.createPhoneCall({
      from_number: DEFAULT_FROM_NUMBER,
      to_number: toNumber,
      override_agent_id: agentId,
      
      // Dynamic variables for the abandoned checkout agent
      retell_llm_dynamic_variables: {
        call_direction: 'OUTBOUND',
        customer_name: customerName,
        items_summary: itemsSummary,
        total_price: totalPrice,
        currency: currency,
        checkout_id: checkoutId,
        customer_phone: phone,
        customer_email: email,
        is_abandoned_checkout: true
      },
      
      metadata: {
        source: 'abandoned_checkout_recovery',
        checkout_id: checkoutId,
        customer_phone: phone,
        customer_name: customerName,
        items_summary: itemsSummary,
        total_price: totalPrice,
        currency: currency,
        customer_email: email
      }
    });
    
    console.log('✅ Abandoned checkout recovery call initiated!\n');
    console.log(`Call ID: ${call.call_id}`);
    console.log(`Status: ${call.call_status}\n`);
    
    return { success: true, call_id: call.call_id, call_status: call.call_status };
    
  } catch (error) {
    console.error('❌ Failed to place abandoned checkout call:', error.message);
    throw error;
  }
}

/**
 * Batch process abandoned checkouts
 */
export async function processAbandonedCheckouts({ hours = 24, minValue = 50, maxCalls = 10 } = {}) {
  try {
    console.log('🔄 Processing abandoned checkouts...\n');
    
    const checkouts = await fetchAbandonedCheckouts({ hours, minValue });
    console.log(`Found ${checkouts.length} abandoned checkouts\n`);
    
    if (checkouts.length === 0) {
      console.log('✅ No abandoned checkouts to process');
      return { processed: 0, calls_placed: 0, skipped: 0 };
    }
    
    const results = [];
    let callsPlaced = 0;
    let skipped = 0;
    
    for (const checkout of checkouts.slice(0, maxCalls)) {
      try {
        const formatted = formatCheckoutForCall(checkout);
        
        if (callsPlaced >= maxCalls) {
          console.log(`⏸️ Reached maximum call limit (${maxCalls})`);
          break;
        }
        
        const result = await placeAbandonedCheckoutCall(formatted);
        
        if (result.skipped) {
          skipped++;
          results.push({ ...formatted, result });
        } else {
          callsPlaced++;
          results.push({ ...formatted, result });
        }
        
        // Rate limiting - wait between calls
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Error processing checkout ${checkout.id}:`, error.message);
        results.push({ ...formatCheckoutForCall(checkout), error: error.message });
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total found: ${checkouts.length}`);
    console.log(`   Calls placed: ${callsPlaced}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${results.filter(r => r.error).length}`);
    
    return {
      processed: checkouts.length,
      calls_placed: callsPlaced,
      skipped: skipped,
      results
    };
    
  } catch (error) {
    console.error('❌ Error processing abandoned checkouts:', error.message);
    throw error;
  }
}

/**
 * Test a single abandoned checkout call
 */
export async function testSingleCall() {
  const testData = {
    checkoutId: 'test-12345',
    phone: '6194587071',
    customerName: 'Test Customer',
    itemsSummary: '2x Wagyu Ribeye, 1x Kurobuta Bacon',
    totalPrice: 189.99,
    currency: 'USD',
    email: 'test@example.com'
  };
  
  console.log('🧪 Testing single abandoned checkout call...\n');
  
  try {
    const result = await placeAbandonedCheckoutCall(testData);
    console.log('✅ Test call successful!');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ Test call failed:', error.message);
  }
}

// Command line usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (command === 'test') {
    testSingleCall();
  } else if (command === 'batch') {
    const hours = parseInt(process.argv[3]) || 24;
    const minValue = parseInt(process.argv[4]) || 50;
    const maxCalls = parseInt(process.argv[5]) || 10;
    
    processAbandonedCheckouts({ hours, minValue, maxCalls })
      .then(result => {
        console.log('\n✅ Processing complete!');
        process.exit(0);
      })
      .catch(error => {
        console.error('\n❌ Processing failed:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node place-abandoned-checkout-call.js test                    # Test single call');
    console.log('  node place-abandoned-checkout-call.js batch [hours] [minValue] [maxCalls]  # Process batch');
    console.log('');
    console.log('Examples:');
    console.log('  node place-abandoned-checkout-call.js test');
    console.log('  node place-abandoned-checkout-call.js batch 24 50 5');
    console.log('  node place-abandoned-checkout-call.js batch 48 100 10');
  }
}
