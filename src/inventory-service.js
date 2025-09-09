/**
 * Inventory Service for Real-time Stock Checking
 * Prevents agents from suggesting out-of-stock products
 */

import fetch from 'node-fetch';

/**
 * Check if products are in stock via Shopify GraphQL
 */
export async function checkProductAvailability(productIds = []) {
  try {
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    // Get product variants with inventory levels
    const query = `
      query getProductsWithInventory($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryQuantity
                  inventoryItem {
                    tracked
                  }
                  availableForSale
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      ids: productIds.map(id => `gid://shopify/Product/${id}`)
    };

    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const products = data.data.nodes.filter(node => node !== null);
    
    return products.map(product => {
      const availableVariants = product.variants.edges
        .map(edge => edge.node)
        .filter(variant => variant.availableForSale && 
          (!variant.inventoryItem.tracked || variant.inventoryQuantity > 0));
      
      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        inStock: availableVariants.length > 0,
        availableVariants: availableVariants.length,
        totalVariants: product.variants.edges.length
      };
    });

  } catch (error) {
    console.error('❌ Error checking inventory:', error);
    return [];
  }
}

/**
 * Get popular in-stock products for agent suggestions
 */
export async function getPopularInStockProducts(limit = 10) {
  try {
    const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
    
    if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
      throw new Error('Shopify credentials not configured');
    }

    // Get products with inventory levels
    const query = `
      query getPopularProducts($first: Int!) {
        products(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              status
              productType
              tags
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    inventoryQuantity
                    inventoryItem {
                      tracked
                    }
                    availableForSale
                    price
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
        query, 
        variables: { first: limit * 2 } // Get more than needed to filter
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const products = data.data.products.edges
      .map(edge => edge.node)
      .filter(product => {
        // Only include published products
        if (product.status !== 'ACTIVE') return false;
        
        // Check if any variants are available
        const availableVariants = product.variants.edges
          .map(variantEdge => variantEdge.node)
          .filter(variant => variant.availableForSale && 
            (!variant.inventoryItem.tracked || variant.inventoryQuantity > 0));
        
        return availableVariants.length > 0;
      })
      .slice(0, limit)
      .map(product => {
        const variants = product.variants.edges.map(edge => edge.node);
        const availableVariants = variants.filter(variant => 
          variant.availableForSale && 
          (!variant.inventoryItem.tracked || variant.inventoryQuantity > 0)
        );
        
        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          productType: product.productType,
          tags: product.tags,
          variants: availableVariants.map(variant => ({
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            price: parseFloat(variant.price),
            inventoryQuantity: variant.inventoryQuantity
          }))
        };
      });

    return products;

  } catch (error) {
    console.error('❌ Error getting popular products:', error);
    return [];
  }
}

/**
 * Get safe product categories for agent suggestions
 * Returns general categories instead of specific products
 */
export function getSafeProductCategories() {
  return [
    {
      category: "Premium Ribeyes",
      description: "USDA Prime and Wagyu ribeye steaks",
      priceRange: "$45-85",
      typical: "2-4 steaks"
    },
    {
      category: "NY Strip Steaks", 
      description: "Prime and Choice NY Strip cuts",
      priceRange: "$35-55",
      typical: "3-5 steaks"
    },
    {
      category: "Wagyu Ground Beef",
      description: "Premium ground beef for burgers",
      priceRange: "$20-25 per lb",
      typical: "2-4 pounds"
    },
    {
      category: "Specialty Cuts",
      description: "Tomahawk, Porterhouse, Filet Mignon",
      priceRange: "$55-130",
      typical: "1-3 pieces"
    },
    {
      category: "A5 Wagyu",
      description: "Japanese A5 Wagyu steaks",
      priceRange: "$120-200",
      typical: "1-2 pieces"
    }
  ];
}
