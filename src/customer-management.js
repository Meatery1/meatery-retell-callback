/**
 * Customer management utilities for Shopify integration
 * Handles customer creation, lookup, and association with draft orders
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Find existing customer by email
 */
export async function findCustomerByEmail(email) {
  if (!email || !email.includes('@')) return null;
  
  try {
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/search.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN
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

/**
 * Find existing customer by phone
 */
export async function findCustomerByPhone(phoneRaw) {
  if (!phoneRaw) return null;
  
  try {
    const phone = String(phoneRaw).replace(/[^\d+]/g, "");
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/customers/search.json`,
      {
        headers: { 
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN 
        },
        params: { 
          query: `phone:${phone}` 
        }
      }
    );
    
    const customers = response.data.customers || [];
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
      console.log(`✅ Found existing customer by email: ${customer.id} - ${customer.display_name || customer.email}`);
      return customer;
    }
  }
  
  // Then try to find by phone if provided
  if (phone && !customer) {
    customer = await findCustomerByPhone(phone);
    if (customer) {
      console.log(`✅ Found existing customer by phone: ${customer.id} - ${customer.display_name || customer.phone}`);
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
      
      // Convert GraphQL customer format to REST format for consistency
      return {
        id: newCustomer.id.replace('gid://shopify/Customer/', ''),
        email: newCustomer.email,
        phone: newCustomer.phone,
        first_name: newCustomer.firstName,
        last_name: newCustomer.lastName,
        display_name: newCustomer.displayName,
        created_at: newCustomer.createdAt,
        gid: newCustomer.id // Keep the full GraphQL ID for draft orders
      };
    } catch (error) {
      console.error('❌ Failed to create customer:', error.message);
      // Return null if customer creation fails - draft order can still be created without customer
      return null;
    }
  }
  
  return customer;
}

/**
 * Get the GraphQL customer ID format for draft order association
 */
export function getCustomerGid(customer) {
  if (!customer) return null;
  
  // If already in GraphQL format, return as-is
  if (customer.gid && customer.gid.startsWith('gid://shopify/Customer/')) {
    return customer.gid;
  }
  
  // If we have the full GraphQL ID in the id field
  if (customer.id && customer.id.startsWith('gid://shopify/Customer/')) {
    return customer.id;
  }
  
  // If we have a numeric ID, convert to GraphQL format
  if (customer.id) {
    return `gid://shopify/Customer/${customer.id}`;
  }
  
  return null;
}
