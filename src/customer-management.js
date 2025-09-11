/**
 * Customer management utilities for Shopify integration
 * Handles customer creation, lookup, and association with draft orders
 * Uses GraphQL exclusively for all Shopify operations
 */

import dotenv from 'dotenv';

dotenv.config();

/**
 * Find existing customer by email using GraphQL
 */
export async function findCustomerByEmail(email) {
  if (!email || !email.includes('@')) return null;
  
  const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  
  if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
    console.error('Shopify credentials not configured');
    return null;
  }
  
  const customerSearchQuery = `
    query findCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        nodes {
          id
          firstName
          lastName
          displayName
          email
          phone
          createdAt
          updatedAt
        }
      }
    }
  `;
  
  try {
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: customerSearchQuery,
        variables: {
          query: `email:${email}`
        }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL error finding customer by email:', data.errors);
      return null;
    }
    
    const customers = data.data?.customers?.nodes || [];
    return customers.length > 0 ? customers[0] : null;
  } catch (error) {
    console.error('Error finding customer by email:', error.message);
    return null;
  }
}

/**
 * Find existing customer by phone using GraphQL
 */
export async function findCustomerByPhone(phoneRaw) {
  if (!phoneRaw) return null;
  
  const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  
  if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
    console.error('Shopify credentials not configured');
    return null;
  }
  
  const customerSearchQuery = `
    query findCustomerByPhone($query: String!) {
      customers(first: 1, query: $query) {
        nodes {
          id
          firstName
          lastName
          displayName
          email
          phone
          createdAt
          updatedAt
        }
      }
    }
  `;
  
  try {
    const phone = String(phoneRaw).replace(/[^\d+]/g, "");
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: customerSearchQuery,
        variables: {
          query: `phone:${phone}`
        }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL error finding customer by phone:', data.errors);
      return null;
    }
    
    const customers = data.data?.customers?.nodes || [];
    return customers.length > 0 ? customers[0] : null;
  } catch (error) {
    console.error('Error finding customer by phone:', error.message);
    return null;
  }
}

/**
 * Create a new customer using GraphQL
 */
export async function createCustomer({ email, phone, firstName, lastName }) {
  if (!email && !phone) {
    throw new Error('Either email or phone is required to create a customer');
  }

  const shopifyGraphqlEndpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`;
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  
  if (!shopifyAccessToken || !process.env.SHOPIFY_STORE_DOMAIN) {
    throw new Error('Shopify credentials not configured');
  }

  const customerCreateMutation = `
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          phone
          firstName
          lastName
          displayName
          createdAt
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
      email: email || null,
      phone: phone || null,
      firstName: firstName || null,
      lastName: lastName || null,
      acceptsMarketing: false, // Default to false for privacy
      tags: ["retell-generated", "grace-ai-customer"]
    }
  };

  try {
    const response = await fetch(shopifyGraphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyAccessToken
      },
      body: JSON.stringify({
        query: customerCreateMutation,
        variables: variables
      })
    });

    const data = await response.json();
    
    if (data.errors || data.data?.customerCreate?.userErrors?.length > 0) {
      const errorMessage = data.errors?.[0]?.message || data.data?.customerCreate?.userErrors?.[0]?.message || 'Failed to create customer';
      throw new Error(errorMessage);
    }

    const customer = data.data.customerCreate.customer;
    console.log(`✅ Customer created: ${customer.id} - ${customer.displayName} (${customer.email || customer.phone})`);
    
    return customer;
  } catch (error) {
    console.error('❌ Error creating customer:', error.message);
    throw error;
  }
}

/**
 * Find or create a customer for draft order association
 * Returns the customer object with Shopify ID
 */
export async function findOrCreateCustomer({ email, phone, name }) {
  console.log(`🔍 Looking for customer: ${name} (${email || phone})`);
  
  let customer = null;
  
  // First try to find by email if provided
  if (email && email.includes('@')) {
    customer = await findCustomerByEmail(email);
    if (customer) {
      console.log(`✅ Found existing customer by email: ${customer.id} - ${customer.displayName || customer.email}`);
      return customer;
    }
  }
  
  // Then try to find by phone if provided
  if (phone && !customer) {
    customer = await findCustomerByPhone(phone);
    if (customer) {
      console.log(`✅ Found existing customer by phone: ${customer.id} - ${customer.displayName || customer.phone}`);
      return customer;
    }
  }
  
  // If no customer found, create a new one
  if (!customer) {
    console.log(`🆕 Creating new customer: ${name} (${email || phone})`);
    
    // Parse name into first/last name
    let firstName = name || 'Valued';
    let lastName = 'Customer';
    
    if (name && name.includes(' ')) {
      const nameParts = name.trim().split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
    
    try {
      const newCustomer = await createCustomer({
        email: email || null,
        phone: phone || null,
        firstName,
        lastName
      });
      
      // Return GraphQL customer format consistently
      return {
        id: newCustomer.id,
        email: newCustomer.email,
        phone: newCustomer.phone,
        firstName: newCustomer.firstName,
        lastName: newCustomer.lastName,
        displayName: newCustomer.displayName,
        createdAt: newCustomer.createdAt
      };
    } catch (error) {
      console.error('❌ Failed to create customer:', error.message);
      // Return null if customer creation fails - draft order can still be created without customer
      return null;
    }
  }
  
  // All customers from GraphQL already have the correct ID format
  return customer;
}

/**
 * Get the GraphQL customer ID format for draft order association
 */
export function getCustomerGid(customer) {
  if (!customer) return null;
  
  // All customers from GraphQL should already have the correct ID format
  if (customer.id && String(customer.id).startsWith('gid://shopify/Customer/')) {
    return customer.id;
  }
  
  // Fallback for any legacy numeric IDs
  if (customer.id) {
    return `gid://shopify/Customer/${customer.id}`;
  }
  
  return null;
}
