/**
 * Retell Configuration
 * Dynamic configuration system that auto-detects agents from environment variables
 * and provides fallbacks for known agents
 */

import { Retell } from 'retell-sdk';

// Known agent configurations (fallbacks)
const KNOWN_AGENTS = {
  GRACE_ABANDONED_CHECKOUT: {
    agentId: 'agent_e2636fcbe1c89a7f6bd0731e11',
    llmId: 'llm_330631504f69f5507c481d3447bf',
    phoneNumber: '+16193913495',
    name: 'Grace - Abandoned Checkout Recovery Specialist',
    function: 'abandoned_checkout_recovery'
  },
  DEFAULT: {
    agentId: 'agent_2f7a3254099b872da193df3133',
    llmId: 'llm_7eed186989d2fba11fa1f9395bc7',
    phoneNumber: '+16198212984',
    name: 'Nick - Post-Delivery Confirmation',
    function: 'post_delivery_confirmation'
  },
  INBOUND: {
    agentId: 'agent_2020d704dcc0b7f8552cacd973',
    llmId: 'llm_7eed186989d2fba11fa1f9395bc7',
    phoneNumber: '+16198212984',
    name: 'Nick - Inbound Customer Service',
    function: 'inbound_customer_service'
  }
};

/**
 * Dynamically discover agents from environment variables
 * Looks for patterns like RETELL_[NAME]_AGENT_ID
 */
function discoverAgentsFromEnv() {
  const discovered = {};
  
  // Scan environment variables for agent patterns
  Object.keys(process.env).forEach(key => {
    const match = key.match(/^RETELL_(.+)_AGENT_ID$/);
    if (match) {
      const agentName = match[1];
      const agentId = process.env[key];
      
      if (agentId && agentId.startsWith('agent_')) {
        // Look for related environment variables
        const llmId = process.env[`RETELL_${agentName}_LLM_ID`];
        const phoneNumber = process.env[`RETELL_${agentName}_PHONE_NUMBER`];
        const name = process.env[`RETELL_${agentName}_NAME`];
        const functionType = process.env[`RETELL_${agentName}_FUNCTION`];
        
        discovered[agentName] = {
          agentId,
          llmId: llmId || null,
          phoneNumber: phoneNumber || process.env.RETELL_FROM_NUMBER || '+16198212984',
          name: name || `Agent ${agentName}`,
          function: functionType || 'general'
        };
      }
    }
  });
  
  return discovered;
}

/**
 * Merge known agents with discovered agents from environment
 */
function buildAgentConfiguration() {
  const discovered = discoverAgentsFromEnv();
  const merged = { ...KNOWN_AGENTS };
  
  // Override known agents with environment discoveries
  Object.keys(discovered).forEach(agentName => {
    if (merged[agentName]) {
      // Merge with known configuration, prioritizing environment
      merged[agentName] = {
        ...merged[agentName],
        ...discovered[agentName]
      };
    } else {
      // Add new discovered agent
      merged[agentName] = discovered[agentName];
    }
  });
  
  // Also check for environment overrides of known agents
  Object.keys(KNOWN_AGENTS).forEach(agentName => {
    const envAgentId = process.env[`RETELL_${agentName}_AGENT_ID`];
    const envLlmId = process.env[`RETELL_${agentName}_LLM_ID`];
    const envPhoneNumber = process.env[`RETELL_${agentName}_PHONE_NUMBER`];
    const envName = process.env[`RETELL_${agentName}_NAME`];
    
    if (envAgentId || envLlmId || envPhoneNumber || envName) {
      merged[agentName] = {
        ...merged[agentName],
        ...(envAgentId && { agentId: envAgentId }),
        ...(envLlmId && { llmId: envLlmId }),
        ...(envPhoneNumber && { phoneNumber: envPhoneNumber }),
        ...(envName && { name: envName })
      };
    }
  });
  
  return merged;
}

// Build the dynamic configuration
const AGENT_CONFIGS = buildAgentConfiguration();

// Export legacy format for backward compatibility
export const RETELL_AGENTS = Object.fromEntries(
  Object.entries(AGENT_CONFIGS).map(([key, config]) => [key, config.agentId])
);

export const RETELL_LLMS = Object.fromEntries(
  Object.entries(AGENT_CONFIGS)
    .filter(([_, config]) => config.llmId)
    .map(([key, config]) => [key, config.llmId])
);

export const RETELL_PHONE_NUMBERS = Object.fromEntries(
  Object.entries(AGENT_CONFIGS).map(([key, config]) => [key, config.phoneNumber])
);

// Enhanced Agent Configuration Helper
export function getAgentConfig(agentType = 'DEFAULT') {
  return AGENT_CONFIGS[agentType] || AGENT_CONFIGS.DEFAULT;
}

// Get all available agents
export function getAllAgents() {
  return { ...AGENT_CONFIGS };
}

// Get agents by function type
export function getAgentsByFunction(functionType) {
  return Object.entries(AGENT_CONFIGS)
    .filter(([_, config]) => config.function === functionType)
    .reduce((acc, [key, config]) => ({ ...acc, [key]: config }), {});
}

// Add a new agent dynamically (useful for runtime agent creation)
export function addAgent(agentName, config) {
  AGENT_CONFIGS[agentName] = config;
  
  // Update the exported objects
  RETELL_AGENTS[agentName] = config.agentId;
  if (config.llmId) RETELL_LLMS[agentName] = config.llmId;
  RETELL_PHONE_NUMBERS[agentName] = config.phoneNumber;
  
  return config;
}

// Auto-discovery function that can fetch agents from Retell API
export async function discoverAgentsFromAPI() {
  try {
    if (!process.env.RETELL_API_KEY) {
      console.warn('⚠️ RETELL_API_KEY not found, skipping API discovery');
      return {};
    }
    
    const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
    const agents = await retell.agent.list();
    
    const discovered = {};
    
    agents.forEach(agent => {
      // Create a key from the agent name (sanitized)
      const key = agent.agent_name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      discovered[key] = {
        agentId: agent.agent_id,
        llmId: agent.response_engine?.llm_id || null,
        phoneNumber: null, // Phone numbers are separate in Retell
        name: agent.agent_name,
        function: 'discovered', // Mark as discovered
        voice: agent.voice_id,
        language: agent.language
      };
    });
    
    return discovered;
  } catch (error) {
    console.error('❌ Error discovering agents from API:', error.message);
    return {};
  }
}

// Enhanced validation function
export function validateRetellConfig() {
  const issues = [];
  
  // Check required environment variables
  if (!process.env.RETELL_API_KEY) {
    issues.push('RETELL_API_KEY is required');
  }
  
  // Check agent configurations
  Object.entries(AGENT_CONFIGS).forEach(([key, config]) => {
    if (!config.agentId || !config.agentId.startsWith('agent_')) {
      issues.push(`Invalid agent ID for ${key}: ${config.agentId}`);
    }
    
    if (config.llmId && !config.llmId.startsWith('llm_')) {
      issues.push(`Invalid LLM ID for ${key}: ${config.llmId}`);
    }
    
    if (config.phoneNumber && !config.phoneNumber.startsWith('+')) {
      issues.push(`Invalid phone number for ${key}: ${config.phoneNumber}`);
    }
  });
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// Export current configuration for debugging
export const CURRENT_CONFIG = {
  agents: RETELL_AGENTS,
  llms: RETELL_LLMS,
  phoneNumbers: RETELL_PHONE_NUMBERS,
  agentConfigs: AGENT_CONFIGS,
  validation: validateRetellConfig()
};

// Create an endpoint to refresh agent discovery
export async function refreshAgentDiscovery() {
  try {
    const apiAgents = await discoverAgentsFromAPI();
    
    // Merge discovered agents
    Object.entries(apiAgents).forEach(([key, config]) => {
      if (!AGENT_CONFIGS[key]) {
        console.log(`🔍 Discovered new agent: ${config.name} (${config.agentId})`);
        addAgent(key, config);
      }
    });
    
    return {
      success: true,
      discovered: Object.keys(apiAgents).length,
      total: Object.keys(AGENT_CONFIGS).length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
