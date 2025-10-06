# Migration to Knowledge Base Architecture

## Why This Change?

**Current Problem**: 
- Appending improvements directly to prompt
- Prompt grows with every improvement (currently adding ~500 tokens each time)
- After 30 improvements: ~15,000 token prompt
- This prompt is sent on EVERY call = expensive and slow

**Solution**: 
- Keep core instructions in prompt (lean)
- Store fringe cases and learnings in knowledge base
- Agent retrieves only relevant knowledge per call

## Architecture

### Core Prompt (2,000-3,000 tokens)
```
You are Grace, an abandoned checkout recovery specialist for The Meatery.

CORE MISSION:
- Reach out to customers who left items in their cart
- Understand why they didn't complete checkout
- Offer assistance and incentives to complete the order

ESSENTIAL BEHAVIORS:
- Friendly, conversational, professional
- Ask before assuming
- Listen for objections
- Offer 10% discount when appropriate

CRITICAL SAFETY RULES:
- Check DNC list
- Maximum 3 call attempts
- Respect voicemail
- Follow discount policies
```

### Knowledge Base (Unlimited size, semantically retrieved)
```
Document 1: "Handling Gift Wrapping Requests"
When a customer asks about gift wrapping, respond: "Great question! 
We do offer gift wrapping for an additional $5. Would you like me 
to add that to your order?"

Document 2: "Alaska Delivery Concerns"
For Alaska deliveries, acknowledge longer shipping time (5-7 days) 
and offer temperature-controlled packaging option.

Document 3: "Kosher Certification Questions"
Our products are not certified kosher, but we use high-quality 
ingredients. Direct complex dietary questions to support@themeatery.com

... (unlimited fringe cases)
```

## Implementation Plan

### Phase 1: Create Knowledge Base System

```javascript
// New file: src/knowledge-base-manager.js

import Retell from 'retell-sdk';

export class KnowledgeBaseManager {
  constructor(retell) {
    this.retell = retell;
    this.knowledgeBaseId = null;
  }

  /**
   * Create or retrieve knowledge base for an agent
   */
  async ensureKnowledgeBase(agentName) {
    // Check if knowledge base exists
    const kbName = `${agentName} - Fringe Cases and Learnings`;
    
    // Create if doesn't exist
    // Note: Retell API has knowledge base support via knowledge_base_ids
    this.knowledgeBaseId = await this.createOrGetKnowledgeBase(kbName);
    
    return this.knowledgeBaseId;
  }

  /**
   * Add a new learning document to knowledge base
   */
  async addLearning(section, content, metadata = {}) {
    const document = {
      title: section,
      content: content,
      metadata: {
        ...metadata,
        added_date: new Date().toISOString(),
        category: 'improvement',
        source: 'automated_learning'
      }
    };

    // Add to knowledge base
    await this.retell.knowledgeBase.addDocument(
      this.knowledgeBaseId,
      document
    );
  }

  /**
   * Update existing learning (if pattern already exists)
   */
  async updateLearning(section, newContent) {
    // Search for existing document
    const existing = await this.searchKnowledgeBase(section);
    
    if (existing) {
      // Update instead of duplicate
      await this.retell.knowledgeBase.updateDocument(
        this.knowledgeBaseId,
        existing.id,
        { content: newContent }
      );
    } else {
      // Add new
      await this.addLearning(section, newContent);
    }
  }

  /**
   * Get all learnings for reporting
   */
  async getAllLearnings() {
    return await this.retell.knowledgeBase.listDocuments(
      this.knowledgeBaseId
    );
  }
}
```

### Phase 2: Update Improvement Loop

```javascript
// Modified: src/prompt-improvement-loop.js

import { KnowledgeBaseManager } from './knowledge-base-manager.js';

const kbManager = new KnowledgeBaseManager(retell);

/**
 * Apply improvements to knowledge base instead of prompt
 */
async function applyImprovementsToKnowledgeBase(improvements, discoveredAgents) {
  const updatedAgents = [];
  
  for (const agent of discoveredAgents) {
    // Ensure agent has knowledge base
    const kbId = await kbManager.ensureKnowledgeBase(agent.name);
    
    // Add each new section as a knowledge base document
    if (improvements.new_sections) {
      for (const [section, content] of Object.entries(improvements.new_sections)) {
        await kbManager.addLearning(section, content, {
          agent_id: agent.id,
          agent_name: agent.name,
          issue_type: section,
          improvement_date: new Date().toISOString()
        });
      }
    }
    
    // Link knowledge base to agent (if not already)
    await retell.llm.update(agent.llm_id, {
      knowledge_base_ids: [kbId]
    });
    
    updatedAgents.push({
      agent_id: agent.id,
      agent_name: agent.name,
      knowledge_base_id: kbId,
      documents_added: Object.keys(improvements.new_sections || {}).length
    });
  }
  
  return updatedAgents;
}
```

### Phase 3: Core Prompt Management

```javascript
/**
 * Keep core prompt lean and focused
 */
const CORE_PROMPT_TEMPLATE = `
You are {{agent_name}}, representing The Meatery.

CORE MISSION:
{{mission}}

ESSENTIAL BEHAVIORS:
{{core_behaviors}}

CRITICAL RULES:
{{safety_rules}}

TOOLS AVAILABLE:
{{tools}}

For specific scenarios and edge cases, relevant information will be 
retrieved from your knowledge base automatically based on the conversation context.
`;

/**
 * Only update core prompt for CRITICAL changes
 */
async function updateCorePrompt(agent, criticalChanges) {
  // Only update if changes are to fundamental behavior
  if (criticalChanges.affects_core_mission || 
      criticalChanges.affects_safety) {
    
    const currentLLM = await retell.llm.retrieve(agent.llm_id);
    // Update core prompt
    await retell.llm.update(agent.llm_id, {
      general_prompt: buildCorePrompt(agent, criticalChanges)
    });
  }
}
```

## Benefits

### 1. Lower Token Costs
```
Current approach (after 30 improvements):
- Base prompt: 2,000 tokens
- Improvements: +13,000 tokens
- Total per call: 15,000 tokens
- Cost per call (GPT-4o): ~$0.15

Knowledge base approach:
- Core prompt: 2,500 tokens
- Retrieved context: ~1,500 tokens (only relevant)
- Total per call: 4,000 tokens
- Cost per call: ~$0.04
- Savings: ~73% per call
```

### 2. Better Relevance
- Simple calls: Only core instructions loaded
- Complex calls: Retrieves relevant edge case handling
- Fringe cases: Pulled only when semantically relevant

### 3. Unlimited Growth
- Can add 1,000 fringe cases without bloating prompt
- Knowledge base scales independently
- No context limit concerns

### 4. Easier Management
- Update specific learnings without touching core prompt
- Remove outdated information easily
- Version control on core prompt only

### 5. Better Performance
- Smaller prompts = faster response times
- Semantic retrieval = more accurate context
- Less noise in agent's "working memory"

## Migration Steps

### Step 1: Extract Current Improvements
```bash
# Run script to extract all improvements from logs
node src/scripts/extract-improvements-to-kb.js

# This will:
# 1. Read all improvement logs
# 2. Extract unique sections
# 3. Create knowledge base documents
# 4. Link to agents
```

### Step 2: Define Core Prompt
```bash
# Create clean core prompt for each agent
node src/scripts/create-core-prompts.js

# This will:
# 1. Get current agent prompts
# 2. Extract core mission/behaviors
# 3. Remove all improvements
# 4. Save as core templates
```

### Step 3: Switch Improvement System
```bash
# Update improvement loop to use KB
# Test with 1-2 test improvements
# Monitor for issues
```

### Step 4: Monitor & Compare
```bash
# Compare metrics:
# - Token usage per call
# - Response relevance
# - Success rates
# - Cost per call
```

## Decision Matrix

| Criterion | Current (Prompt) | Knowledge Base | Winner |
|-----------|-----------------|----------------|--------|
| Setup Complexity | ✅ Simple | ⚠️ More complex | Prompt |
| Long-term Scalability | ❌ Hits limits | ✅ Unlimited | KB |
| Cost per Call | ❌ High & growing | ✅ Low & stable | KB |
| Response Speed | ⚠️ Slower (large prompt) | ✅ Faster | KB |
| Relevance | ❌ All context always | ✅ Only relevant | KB |
| Maintenance | ❌ Growing harder | ✅ Easy to manage | KB |
| Debugging | ✅ All visible | ⚠️ Harder to trace | Prompt |

**Recommendation**: Migrate to Knowledge Base for long-term sustainability

## Immediate Action

For your current setup, I recommend:

1. **Short term (now)**: Keep current system running
2. **Test phase (1-2 weeks)**: Build KB system in parallel, test on one agent
3. **Migration (after testing)**: Switch all agents to KB approach
4. **Monitor (ongoing)**: Track cost savings and performance improvements

Would you like me to implement the knowledge base migration system?

