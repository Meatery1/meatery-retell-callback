import dotenv from 'dotenv';
import { createShopifyDiscountCode, getShopifyCustomerByEmail, getShopifyCustomerByPhone } from './klaviyo-email-service.js';
import { sendDiscountViaEvent } from './klaviyo-events-service.js';

dotenv.config();

function nameFromCustomer(c) {
  const first = c?.first_name || c?.firstName || c?.default_address?.first_name || 'Guest';
  return String(first).trim().split(/\s+/)[0] || 'Guest';
}

function toCodeFromNameAndPercent(name, percent) {
  const first = String(name || 'Guest').trim().split(/\s+/)[0] || 'Guest';
  const cleanFirst = first.replace(/[^A-Za-z]/g, '').slice(0, 20) || 'Guest';
  const pct = Math.max(1, Math.min(99, Number(percent) || 10));
  return `${cleanFirst}${pct}`;
}

async function main() {
  const phoneArg = process.argv[2];
  const percentArg = Number(process.argv[3] || '10');
  const emailArg = process.argv[4] || null;
  if (!phoneArg && !emailArg) {
    console.error('Usage: node src/test-create-discount-and-event.js <phoneE164> [percent] [email]');
    process.exit(1);
  }

  const phone = phoneArg || null;
  const percent = Math.max(1, Math.min(99, percentArg || 10));

  // Resolve customer by email or phone
  let customer = null;
  if (emailArg) customer = await getShopifyCustomerByEmail(emailArg);
  if (!customer && phone) customer = await getShopifyCustomerByPhone(phone);
  if (!customer) {
    console.error('❌ Customer not found by provided email/phone');
    process.exit(2);
  }

  const firstName = nameFromCustomer(customer);
  const code = toCodeFromNameAndPercent(firstName, percent);

  // Create the customer-scoped discount in Shopify
  const discountType = 'percentage';
  const discountValue = percent;

  console.log(`🏷️ Creating discount code ${code} for ${firstName} (${emailArg || phone})...`);
  const created = await createShopifyDiscountCode({
    discountValue,
    discountType,
    customerEmail: emailArg,
    customerPhone: phone,
    code
  });
  console.log('✅ Shopify discount created:', created);

  // Build a generic landing URL (flows will template as needed)
  const recoveryUrl = new URL('https://themeatery.com/');
  recoveryUrl.searchParams.set('discount', created.code);
  recoveryUrl.searchParams.set('utm_source', 'grace_ai');
  recoveryUrl.searchParams.set('utm_medium', 'sms');
  recoveryUrl.searchParams.set('utm_campaign', 'discount_recovery');

  // Trigger Klaviyo event – let the flow send SMS/email
  console.log('📨 Triggering Klaviyo event...');
  const event = await sendDiscountViaEvent({
    customerEmail: emailArg,
    customerPhone: phone,
    customerName: firstName,
    discountValue,
    discountType,
    discountCode: created.code,
    recoveryUrl: recoveryUrl.toString(),
    channel: phone ? 'sms' : 'email'
  });
  console.log('✅ Event sent:', event);
}

main().catch((e) => { console.error(e); process.exit(1); });


