/**
 * Search for your specific abandoned checkout
 */
async function findYourCheckout() {
  try {
    const targetCheckoutId = '37329230495960';
    console.log(`🔍 Searching for your abandoned checkout: #${targetCheckoutId}`);
    console.log('================================================\n');
    
    // Search in batches of 250 (GraphQL limit)
    const batchSize = 250;
    let allCheckouts = [];
    let hasNextPage = true;
    let cursor = null;
    let batchCount = 0;
    
    console.log('📅 Fetching abandoned checkouts in batches...');
    
    while (hasNextPage && batchCount < 5) { // Limit to 5 batches to avoid infinite loops
      batchCount++;
      console.log(`   Batch ${batchCount}: Fetching ${batchSize} checkouts...`);
      
      const variables = { first: batchSize };
      if (cursor) {
        variables.after = cursor;
      }
      
      const data = await executeGraphQLQuery(ABANDONED_CHECKOUTS_QUERY, variables);
      const checkouts = data.abandonedCheckouts.edges.map(edge => edge.node);
      
      console.log(`   ✅ Found ${checkouts.length} checkouts in batch ${batchCount}`);
      allCheckouts = allCheckouts.concat(checkouts);
      
      // Check if there are more pages
      hasNextPage = data.abandonedCheckouts.pageInfo.hasNextPage;
      cursor = data.abandonedCheckouts.pageInfo.endCursor;
      
      // Look for your specific checkout in this batch
      const yourCheckout = checkouts.find(checkout => {
        // Check if the ID contains your checkout number
        return checkout.id.includes(targetCheckoutId) || 
               checkout.name.includes(targetCheckoutId);
      });
      
      if (yourCheckout) {
        console.log(`\n🎉 FOUND YOUR CHECKOUT in batch ${batchCount}!`);
        console.log('================================================');
        console.log(`   Name: ${yourCheckout.name}`);
        console.log(`   ID: ${yourCheckout.id}`);
        console.log(`   Created: ${new Date(yourCheckout.createdAt).toLocaleString()}`);
        console.log(`   Total: ${yourCheckout.totalPriceSet?.shopMoney?.amount} ${yourCheckout.totalPriceSet?.shopMoney?.currencyCode}`);
        
        if (yourCheckout.customer) {
          console.log(`   Customer: ${yourCheckout.customer.firstName || ''} ${yourCheckout.customer.lastName || ''}`);
          console.log(`   Email: ${yourCheckout.customer.email || 'Not provided'}`);
          console.log(`   Phone: ${yourCheckout.customer.phone || 'Not provided'}`);
        }
        
        if (yourCheckout.billingAddress) {
          console.log(`   Billing Phone: ${yourCheckout.billingAddress.phone || 'Not provided'}`);
        }
        
        if (yourCheckout.shippingAddress) {
          console.log(`   Shipping Phone: ${yourCheckout.shippingAddress.phone || 'Not provided'}`);
        }
        
        if (yourCheckout.lineItems?.edges?.length > 0) {
          console.log('\n📦 Items in cart:');
          yourCheckout.lineItems.edges.forEach((edge, index) => {
            const item = edge.node;
            console.log(`   ${index + 1}. ${item.quantity}x ${item.title}`);
            if (item.variantTitle) {
              console.log(`      Variant: ${item.variantTitle}`);
            }
            console.log(`      Price: ${item.originalUnitPriceSet?.shopMoney?.amount} ${item.originalUnitPriceSet?.shopMoney?.currencyCode}`);
          });
        }
        
        // Format for call placement
        const formatted = formatAbandonedCheckoutForCall(yourCheckout);
        
        console.log('\n📋 Formatted for Grace agent call:');
        console.log(`   Checkout ID: ${formatted.checkout_id}`);
        console.log(`   Customer: ${formatted.customer_name}`);
        console.log(`   Phone: ${formatted.phone || 'No phone available'}`);
        console.log(`   Items: ${formatted.items_summary}`);
        console.log(`   Total: ${formatted.currency} ${formatted.total_price}`);
        console.log(`   Created: ${new Date(formatted.created_at).toLocaleDateString()}`);
        
        if (!formatted.phone) {
          console.log('\n⚠️  WARNING: No phone number found for this customer.');
          console.log('   You may need to use email instead or skip this checkout.');
          return { success: false, error: 'No phone number available', checkout: yourCheckout };
        }
        
        console.log('\n🎉 READY FOR TESTING!');
        console.log('   This checkout has all the data needed to test the Grace agent.');
        console.log('   You can now place a call using the abandoned checkout recovery system.');
        
        return { success: true, checkout: yourCheckout, formatted };
      }
      
      // If we found enough checkouts and haven't found yours, stop searching
      if (allCheckouts.length >= 1000) {
        console.log('   Reached 1000 checkouts limit, stopping search...');
        break;
      }
    }
    
    console.log(`\n📊 Search completed: Examined ${allCheckouts.length} abandoned checkouts across ${batchCount} batches`);
    
    if (allCheckouts.length === 0) {
      console.log('\n⚠️  No abandoned checkouts found at all.');
      return { success: false, error: 'No checkouts found' };
    }
    
    console.log('\n⚠️  Your specific checkout was not found in the examined checkouts.');
    console.log('   Let me show you some recent ones that might be similar:');
    
    // Show recent checkouts with phone numbers
    const recentWithPhones = allCheckouts
      .filter(checkout => {
        const hasPhone = checkout.customer?.phone || 
                        checkout.billingAddress?.phone || 
                        checkout.shippingAddress?.phone;
        return hasPhone;
      })
      .slice(0, 10);
    
    console.log(`\n📋 Recent abandoned checkouts with phone numbers (${recentWithPhones.length} found):`);
    recentWithPhones.forEach((checkout, index) => {
      const date = new Date(checkout.createdAt);
      const phone = checkout.customer?.phone || 
                   checkout.billingAddress?.phone || 
                   checkout.shippingAddress?.phone;
      
      console.log(`\n   ${index + 1}. ${checkout.name}`);
      console.log(`      Created: ${date.toLocaleDateString()}`);
      console.log(`      Customer: ${checkout.customer?.firstName || 'Unknown'}`);
      console.log(`      Phone: ${phone}`);
      console.log(`      Total: ${checkout.totalPriceSet?.shopMoney?.amount} ${checkout.totalPriceSet?.shopMoney?.currencyCode}`);
    });
    
    return { success: false, error: 'Specific checkout not found', recentCheckouts: recentWithPhones };
    
  } catch (error) {
    console.error('❌ Failed to find your checkout:', error.message);
    throw error;
  }
}
