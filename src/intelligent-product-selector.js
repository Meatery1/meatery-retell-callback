/**
 * Intelligent Product Selector for Win-Back Draft Orders
 * Uses customer purchase history and product similarity to make smart recommendations
 */

/**
 * Get current prices for variant IDs
 */
async function getCurrentPricesForVariants(variantIds, shopifyGraphqlEndpoint, shopifyAccessToken) {
  if (!variantIds || variantIds.length === 0) return [];
  
  try {
    const query = `
      query getVariantPrices($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            price
            title
            availableForSale
            product {
              title
            }
          }
        }
      }
    `;
    
    const formattedIds = variantIds.map(id => 
      id.startsWith('gid://shopify') ? id : `gid://shopify/ProductVariant/${id}`
    );
    
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query,
        variables: { ids: formattedIds }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL errors getting variant prices:', data.errors);
      return [];
    }
    
    return (data.data?.nodes || [])
      .filter(node => node && node.availableForSale)
      .map(node => ({
        variantId: node.id,
        price: parseFloat(node.price),
        title: node.title,
        productTitle: node.product?.title
      }));
      
  } catch (error) {
    console.error('❌ Error getting variant prices:', error);
    return [];
  }
}

/**
 * Get intelligent product recommendations based on customer history and similar items
 */
export async function getIntelligentProductRecommendations({
  customerPhone,
  customerEmail,
  targetAmount = 400,
  maxItems = 6,
  searchTerms = [] // New parameter for specific product searches
}) {
  try {
    console.log('🧠 Getting intelligent product recommendations...');
    
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    // Import customer order history function
    const { getCustomerOrderHistory } = await import('./klaviyo-events-integration.js');
    
    // Get customer's purchase history
    const customerHistory = await getCustomerOrderHistory(customerPhone, customerEmail, 5);
    
    let recommendations = [];
    let context = { usedHistory: false, historyItems: [], reasoning: [] };
    
    // First, search for any specific products mentioned
    if (searchTerms && searchTerms.length > 0) {
      console.log(`🔍 Searching for specific products: ${searchTerms.join(', ')}`);
      
      for (const searchTerm of searchTerms) {
        const searchResults = await searchProductsByName(searchTerm, shopifyGraphqlEndpoint, shopifyAccessToken);
        
        if (searchResults.length > 0) {
          recommendations.push(...searchResults.map(item => ({
            ...item,
            quantity: 1,
            reason: `customer_requested_${searchTerm}`
          })));
          
          context.reasoning.push(`Added ${searchResults.length} products matching "${searchTerm}"`);
        }
      }
    }
    
    if (customerHistory.success && customerHistory.popularItems.length > 0) {
      console.log(`✅ Found customer history: ${customerHistory.popularItems.length} previously purchased items`);
      
      // Get their top 2-3 favorite items (FILTER OUT PET PRODUCTS)
      const favoriteItems = customerHistory.popularItems
        .filter(item => {
          // Filter out dog food and pet products
          const title = (item.title || '').toLowerCase();
          const isDogFood = title.includes('dog food') || 
                           title.includes('pet food') || 
                           title.includes('dog treat') || 
                           title.includes('pet treat') ||
                           title.includes('tripe dog') ||
                           title.includes('texas tripe');
          
          if (isDogFood) {
            console.log(`🚫 Filtering out pet product from favorites: ${item.title}`);
          }
          
          return !isDogFood;
        })
        .slice(0, 3);
      
      // Add their favorites to recommendations (prices now included from GraphQL)
      recommendations.push(...favoriteItems.map(item => ({
        variantId: item.variantId,
        title: item.title,
        price: item.price || 50, // Use price from GraphQL query
        quantity: 1,
        reason: 'customer_favorite',
        orderCount: item.orderCount || item.frequency
      })));
      
      context.usedHistory = true;
      context.historyItems = favoriteItems;
      context.reasoning.push(`Added ${favoriteItems.length} items from customer's purchase history`);
      
      // Now find similar/complementary products
      const similarProducts = await findSimilarProducts(favoriteItems, shopifyGraphqlEndpoint, shopifyAccessToken);
      
      if (similarProducts.length > 0) {
        // Add 1-2 similar items they haven't tried
        const newItems = similarProducts
          .filter(similar => !favoriteItems.some(fav => fav.variantId === similar.variantId))
          .slice(0, 2);
          
        recommendations.push(...newItems.map(item => ({
          ...item,
          quantity: 1,
          reason: 'similar_to_favorites'
        })));
        
        context.reasoning.push(`Added ${newItems.length} similar items based on their preferences`);
      }
    } else {
      console.log('📦 No customer history found, using curated starter selection...');
      
      // Use a curated selection of high-quality, popular items (NOT promo items)
      const starterSelection = await getCuratedStarterSelection(shopifyGraphqlEndpoint, shopifyAccessToken);
      recommendations.push(...starterSelection);
      
      context.reasoning.push('Used curated starter selection for new customer');
    }
    
    // Filter out any promo or free items
    recommendations = recommendations.filter(item => {
      const isPromo = item.title.toLowerCase().includes('free') || 
                     item.title.toLowerCase().includes('promo') ||
                     item.title.toLowerCase().includes('sample') ||
                     item.price <= 5; // Anything under $5 is likely promo
      
      if (isPromo) {
        context.reasoning.push(`Filtered out promo item: ${item.title}`);
      }
      
      return !isPromo;
    });
    
    // Limit to maxItems
    recommendations = recommendations.slice(0, maxItems);
    
    // Smart quantity adjustment to reach target amount
    const adjustedRecommendations = adjustQuantitiesForTarget(recommendations, targetAmount);
    
    return {
      success: true,
      recommendations: adjustedRecommendations,
      context,
      totalEstimated: adjustedRecommendations.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };
    
  } catch (error) {
    console.error('❌ Error getting intelligent recommendations:', error);
    return {
      success: false,
      error: error.message,
      recommendations: []
    };
  }
}

/**
 * Search for any products in the catalog by name or description
 */
async function searchProductsByName(searchTerm, shopifyGraphqlEndpoint, shopifyAccessToken) {
  try {
    console.log(`🔍 Searching for available products containing: "${searchTerm}"`);
    
    const searchQuery = `
      query SearchAvailableProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              productType
              vendor
              tags
              status
              publishedOnCurrentPublication
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    inventoryQuantity
                    inventoryPolicy
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: searchQuery,
        variables: { 
          query: `available_for_sale:true AND (title:*${searchTerm}* OR product_type:*${searchTerm}* OR tag:*${searchTerm}*)`,
          first: 20
        }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL errors:', data.errors);
      return [];
    }
    
    const foundProducts = [];
    
    data.data?.products?.edges?.forEach(edge => {
      const product = edge.node;
      
      // Skip if not active or not published to online store
      if (product.status !== 'ACTIVE' || !product.publishedOnCurrentPublication) return;
      
      // Get the best variant (available and reasonably priced)
      const availableVariants = product.variants.edges
        .map(vEdge => vEdge.node)
        .filter(variant => {
          const isAvailable = variant.availableForSale;
          const hasInventory = variant.inventoryQuantity > 0 || variant.inventoryPolicy === 'CONTINUE';
          const isReasonablyPriced = parseFloat(variant.price) > 10; // Exclude cheap/promo items
          
          return isAvailable && hasInventory && isReasonablyPriced;
        });
      
      if (availableVariants.length > 0) {
        // Use the first available variant
        const variant = availableVariants[0];
        
        foundProducts.push({
          variantId: variant.id,
          title: `${product.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
          price: parseFloat(variant.price),
          productType: product.productType,
          tags: product.tags,
          reason: 'name_search',
          sku: variant.sku,
          inventoryQuantity: variant.inventoryQuantity
        });
      }
    });
    
    console.log(`✅ Found ${foundProducts.length} available products matching "${searchTerm}"`);
    return foundProducts;
    
  } catch (error) {
    console.error('❌ Error searching products by name:', error);
    return [];
  }
}

/**
 * Find products similar to customer's favorites
 */
async function findSimilarProducts(favoriteItems, shopifyGraphqlEndpoint, shopifyAccessToken) {
  try {
    // Extract product types and tags from favorites
    const favoriteTypes = [...new Set(favoriteItems.map(item => item.productType).filter(Boolean))];
    const favoriteTags = [...new Set(favoriteItems.flatMap(item => (item.tags || '').split(',').map(t => t.trim())).filter(Boolean))];
    
    console.log(`🔍 Looking for products similar to: ${favoriteTypes.join(', ')}`);
    
    // Build a query to find similar products
    let queryConditions = [];
    
    // Search by product type
    if (favoriteTypes.length > 0) {
      favoriteTypes.forEach(type => {
        queryConditions.push(`product_type:${type}`);
      });
    }
    
    // Search by relevant tags (meat grades, cuts, etc.)
    const meatTags = favoriteTags.filter(tag => 
      tag.match(/wagyu|prime|ribeye|strip|filet|ground|burger|steak/i)
    );
    
    if (meatTags.length > 0) {
      queryConditions.push(`tag:${meatTags[0]}`); // Use the most relevant tag
    }
    
    const searchQuery = queryConditions.length > 0 ? queryConditions.join(' OR ') : 'available_for_sale:true';
    
    const similarProductsQuery = `
      query findSimilarProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              productType
              vendor
              tags
              status
              publishedOnCurrentPublication
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    inventoryQuantity
                    inventoryPolicy
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: similarProductsQuery,
        variables: { 
          query: searchQuery,
          first: 10
        }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL errors:', data.errors);
      return [];
    }
    
    const similarProducts = [];
    
    data.data?.products?.edges?.forEach(edge => {
      const product = edge.node;
      
      // Skip if not active or not published to online store
      if (product.status !== 'ACTIVE' || !product.publishedOnCurrentPublication) return;
      
      // Get the best variant (available and reasonably priced)
      const availableVariants = product.variants.edges
        .map(vEdge => vEdge.node)
        .filter(variant => {
          const isAvailable = variant.availableForSale;
          const hasInventory = variant.inventoryQuantity > 0 || variant.inventoryPolicy === 'CONTINUE';
          const isReasonablyPriced = parseFloat(variant.price) > 10; // Exclude cheap/promo items
          
          return isAvailable && hasInventory && isReasonablyPriced;
        });
      
      if (availableVariants.length > 0) {
        // Use the first available variant
        const variant = availableVariants[0];
        
        similarProducts.push({
          variantId: variant.id,
          title: `${product.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
          price: parseFloat(variant.price),
          productType: product.productType,
          tags: product.tags,
          sku: variant.sku,
          inventoryQuantity: variant.inventoryQuantity
        });
      }
    });
    
    console.log(`✅ Found ${similarProducts.length} similar products`);
    return similarProducts;
    
  } catch (error) {
    console.error('❌ Error finding similar products:', error);
    return [];
  }
}

/**
 * Get curated starter selection for customers without history
 */
async function getCuratedStarterSelection(shopifyGraphqlEndpoint, shopifyAccessToken) {
  try {
    // Query for high-quality, popular items (not promo items)
    const curatedQuery = `
      query getCuratedProducts {
        products(first: 8, query: "available_for_sale:true NOT tag:promo NOT tag:free NOT tag:sample", sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              productType
              tags
              status
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({ query: curatedQuery })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }
    
    const curatedProducts = [];
    
    data.data?.products?.edges?.forEach(edge => {
      const product = edge.node;
      
      if (product.status !== 'ACTIVE') return;
      
      const variant = product.variants.edges[0]?.node;
      if (!variant || !variant.availableForSale || parseFloat(variant.price) <= 10) return;
      
      curatedProducts.push({
        variantId: variant.id,
        title: `${product.title}${variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
        price: parseFloat(variant.price),
        productType: product.productType,
        tags: product.tags,
        reason: 'curated_selection'
      });
    });
    
    // Sort by price and take a good mix
    curatedProducts.sort((a, b) => b.price - a.price);
    
    // Take top 3-4 premium items
    return curatedProducts.slice(0, 4);
    
  } catch (error) {
    console.error('❌ Error getting curated selection:', error);
    return [];
  }
}

/**
 * Adjust quantities to reach target amount intelligently
 */
function adjustQuantitiesForTarget(recommendations, targetAmount) {
  if (recommendations.length === 0) return recommendations;
  
  // Filter out items with invalid prices and fix price data
  const validRecommendations = recommendations.filter(item => {
    const price = parseFloat(item.price);
    if (isNaN(price) || price <= 0) {
      console.log(`⚠️ Filtering out item with invalid price: ${item.title} (price: ${item.price})`);
      return false;
    }
    // Ensure price is a number
    item.price = price;
    return true;
  });
  
  if (validRecommendations.length === 0) {
    console.log('❌ No valid items with prices found');
    return recommendations; // Return original to avoid complete failure
  }
  
  // Start with 1 of each valid item
  let currentTotal = validRecommendations.reduce((sum, item) => sum + parseFloat(item.price), 0);
  
  console.log(`🎯 Starting total: $${currentTotal.toFixed(2)}, Target: $${targetAmount}`);
  
  // If we're already close to target (within 10%), we're good
  if (currentTotal >= targetAmount * 0.95 && currentTotal <= targetAmount * 1.10) {
    console.log('✅ Already close to target amount');
    return validRecommendations;
  }
  
  // If we need more, add quantities aggressively to reach target
  if (currentTotal < targetAmount) {
    const remainingAmount = targetAmount - currentTotal;
    console.log(`Need $${remainingAmount.toFixed(2)} more`);
    
    // Sort by price descending to add expensive items first
    const sorted = [...validRecommendations].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    
    for (const item of sorted) {
      if (currentTotal >= targetAmount * 0.95) break; // Within 5% is acceptable
      
      const itemPrice = parseFloat(item.price);
      const additionalQty = Math.floor((targetAmount - currentTotal) / itemPrice);
      if (additionalQty > 0 && item.quantity < 8) { // Allow up to 8 of any item
        const qtyToAdd = Math.min(additionalQty, 6); // Max 6 additional of any item
        item.quantity += qtyToAdd;
        currentTotal += itemPrice * qtyToAdd;
        
        console.log(`Increased ${item.title} to ${item.quantity}x (+$${(itemPrice * qtyToAdd).toFixed(2)})`);
      }
    }
  }
  
  // If we still haven't reached target and have valid items, add more aggressively
  if (currentTotal < targetAmount * 0.8 && validRecommendations.length > 0) {
    console.log(`🔄 Still need more - current: $${currentTotal.toFixed(2)}, target: $${targetAmount}`);
    
    // Add more of the most expensive items to reach target
    const mostExpensive = validRecommendations.sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0];
    const neededAmount = targetAmount - currentTotal;
    const additionalQty = Math.ceil(neededAmount / parseFloat(mostExpensive.price));
    
    if (additionalQty > 0 && mostExpensive.quantity < 10) {
      const qtyToAdd = Math.min(additionalQty, 6);
      mostExpensive.quantity += qtyToAdd;
      currentTotal += parseFloat(mostExpensive.price) * qtyToAdd;
      
      console.log(`🚀 Added ${qtyToAdd} more of ${mostExpensive.title} to reach target - new total: $${currentTotal.toFixed(2)}`);
    }
  }
  
  console.log(`✅ Final total: $${currentTotal.toFixed(2)}`);
  return validRecommendations;
}
