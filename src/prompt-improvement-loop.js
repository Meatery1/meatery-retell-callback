#!/usr/bin/env node
/**
 * Automated Prompt Improvement Loop for Retell AI Agents
 * 
 * This system:
 * 1. Analyzes post-call data for patterns
 * 2. Identifies edge cases and failures
 * 3. Generates prompt improvements
 * 4. Updates the agent automatically
 */

import Retell from 'retell-sdk';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { sendDailyImprovementSummary, initializeEmailService } from './email-service.js';
import { discoverAgentsFromAPI } from './retell-config.js';

// Load environment variables
dotenv.config();

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configuration - now fully dynamic
const CONFIG = {
  ANALYSIS_WINDOW_HOURS: 24, // Back to 24 hours for daily analysis
  MIN_CALLS_FOR_ANALYSIS: 1, // Reduced since we're only looking at 1 day
  IMPROVEMENT_MODEL: 'gpt-4o',
  LOGS_DIR: './improvement-logs',
  LAST_ANALYSIS_FILE: './improvement-logs/last-analysis-timestamp.json',
  // Agent filtering options
  AGENT_FILTERS: {
    // Include agents that match these patterns (case insensitive)
    include_patterns: [
      'meatery', 'nick', 'grace', 'abandoned', 'checkout', 'recovery', 'inbound', 'outbound'
    ],
    // Exclude agents that match these patterns (case insensitive)  
    exclude_patterns: [
      'test', 'demo', 'sandbox', 'dev', 'staging'
    ],
    // Only include agents that have LLMs configured
    require_llm: true,
    // Only include agents that were active in the last N days
    active_within_days: 30
  }
};

/**
 * Dynamically discover and filter agents from Retell API
 */
async function discoverActiveAgents() {
  console.log('🔍 Discovering agents from Retell API...');
  
  try {
    // Get all agents from API
    const discoveredAgents = await discoverAgentsFromAPI();
    
    if (Object.keys(discoveredAgents).length === 0) {
      console.warn('⚠️ No agents discovered from API');
      return [];
    }
    
    console.log(`📋 Found ${Object.keys(discoveredAgents).length} total agents`);
    
    // Convert to array and filter
    let agents = Object.entries(discoveredAgents).map(([key, config]) => ({
      id: config.agentId,
      name: config.name,
      llm_id: config.llmId,
      voice_id: config.voice,
      language: config.language,
      discovery_key: key
    }));
    
    console.log('🔧 Applying filters...');
    
    // Filter out agents without LLMs if required
    if (CONFIG.AGENT_FILTERS.require_llm) {
      const beforeCount = agents.length;
      agents = agents.filter(agent => agent.llm_id && agent.llm_id.startsWith('llm_'));
      console.log(`   ✅ Agents with LLMs: ${agents.length}/${beforeCount}`);
    }
    
    // Apply include patterns
    if (CONFIG.AGENT_FILTERS.include_patterns.length > 0) {
      const beforeCount = agents.length;
      agents = agents.filter(agent => {
        const nameText = agent.name.toLowerCase();
        return CONFIG.AGENT_FILTERS.include_patterns.some(pattern => 
          nameText.includes(pattern.toLowerCase())
        );
      });
      console.log(`   ✅ Matching include patterns: ${agents.length}/${beforeCount}`);
    }
    
    // Apply exclude patterns
    if (CONFIG.AGENT_FILTERS.exclude_patterns.length > 0) {
      const beforeCount = agents.length;
      agents = agents.filter(agent => {
        const nameText = agent.name.toLowerCase();
        return !CONFIG.AGENT_FILTERS.exclude_patterns.some(pattern => 
          nameText.includes(pattern.toLowerCase())
        );
      });
      console.log(`   ✅ After excluding patterns: ${agents.length}/${beforeCount}`);
    }
    
    // Validate agent accessibility
    console.log('🧪 Validating agent accessibility...');
    const validAgents = [];
    
    for (const agent of agents) {
      try {
        // Test if we can retrieve the agent
        await retell.agent.retrieve(agent.id);
        
        // Test if we can retrieve the LLM
        if (agent.llm_id) {
          await retell.llm.retrieve(agent.llm_id);
        }
        
        validAgents.push(agent);
        console.log(`   ✅ ${agent.name}: accessible`);
      } catch (error) {
        console.log(`   ❌ ${agent.name}: ${error.message}`);
      }
    }
    
    console.log(`📊 Final result: ${validAgents.length} agents ready for analysis`);
    
    if (validAgents.length === 0) {
      console.warn('⚠️ No valid agents found after filtering and validation');
    }
    
    return validAgents;
    
  } catch (error) {
    console.error('❌ Agent discovery failed:', error.message);
    throw new Error(`Agent discovery failed: ${error.message}`);
  }
}

/**
 * Request human approval for significant changes
 */
async function requestHumanApproval(improvements) {
  // In production, this would send to Slack/email/dashboard
  console.log('\n📋 APPROVAL REQUIRED:');
  console.log('Proposed improvements:', JSON.stringify(improvements, null, 2));
  console.log('\nTo approve, manually run: npm run approve-improvements\n');
  
  // Save pending improvements
  await fs.writeFile(
    path.join(CONFIG.LOGS_DIR, 'pending-approval.json'),
    JSON.stringify({ improvements, timestamp: new Date().toISOString() }, null, 2)
  );
}

/**
 * Detect anomalies in call patterns
 */
function detectAnomalies(calls) {
  const anomalies = [];
  
  // Check for sudden spike in similar negative patterns
  const recentHour = Date.now() - (60 * 60 * 1000);
  const recentCalls = calls.filter(c => c.start_timestamp > recentHour);
  
  if (recentCalls.length > 10) {
    // Check for coordinated attack patterns
    const similarTranscripts = new Map();
    
    for (const call of recentCalls) {
      const key = call.transcript?.substring(0, 100) || '';
      if (key) {
        const count = similarTranscripts.get(key) || 0;
        similarTranscripts.set(key, count + 1);
      }
    }
    
    // Flag if > 30% of calls have identical patterns
    for (const [transcript, count] of similarTranscripts) {
      if (count / recentCalls.length > 0.3) {
        anomalies.push({
          type: 'coordinated_pattern',
          pattern: transcript,
          percentage: (count / recentCalls.length * 100).toFixed(1)
        });
      }
    }
  }
  
  return anomalies;
}

/**
 * Get the timestamp of the last analysis to avoid re-analyzing the same calls
 */
async function getLastAnalysisTimestamp() {
  try {
    const data = JSON.parse(await fs.readFile(CONFIG.LAST_ANALYSIS_FILE, 'utf8'));
    return new Date(data.last_analysis);
  } catch (error) {
    console.warn('⚠️ Could not read last analysis timestamp:', error.message);
    // If no previous analysis, start from 24 hours ago
    return new Date(Date.now() - (24 * 60 * 60 * 1000));
  }
}

/**
 * Update the last analysis timestamp
 */
async function updateLastAnalysisTimestamp() {
  try {
    await fs.mkdir(CONFIG.LOGS_DIR, { recursive: true });
    await fs.writeFile(
      CONFIG.LAST_ANALYSIS_FILE,
      JSON.stringify({ 
        last_analysis: new Date().toISOString(),
        next_analysis: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
      }, null, 2)
    );
  } catch (error) {
    console.warn('⚠️  Could not update last analysis timestamp:', error.message);
  }
}

/**
 * Get performance metrics for a specific time period
 */
async function getPerformanceMetrics(agents, startTime, endTime, label) {
  console.log(`📊 Analyzing ${label} performance (${new Date(startTime).toLocaleDateString()} - ${new Date(endTime).toLocaleDateString()})...`);
  
  let totalCalls = 0;
  let successfulCalls = 0;
  let voicemailCalls = 0;
  const agentMetrics = {};
  
  for (const agent of agents) {
    try {
      const calls = await retell.call.list({
        agent_id: agent.id,
        start_timestamp: startTime,
        end_timestamp: endTime,
        limit: 100
      });
      
      // Filter for phone calls only
      const phoneCalls = calls.filter(call => call.from_number && call.to_number);
      
      const agentSuccessful = phoneCalls.filter(call => call.call_analysis?.call_successful !== false).length;
      const agentVoicemail = phoneCalls.filter(call => call.call_analysis?.in_voicemail).length;
      
      agentMetrics[agent.id] = {
        name: agent.name,
        total: phoneCalls.length,
        successful: agentSuccessful,
        voicemail: agentVoicemail,
        success_rate: phoneCalls.length > 0 ? (agentSuccessful / phoneCalls.length * 100).toFixed(1) : '0.0'
      };
      
      totalCalls += phoneCalls.length;
      successfulCalls += agentSuccessful;
      voicemailCalls += agentVoicemail;
      
    } catch (error) {
      console.warn(`⚠️ Error fetching ${label} calls for ${agent.name}:`, error.message);
      agentMetrics[agent.id] = {
        name: agent.name,
        total: 0,
        successful: 0,
        voicemail: 0,
        success_rate: '0.0',
        error: error.message
      };
    }
  }
  
  const overallSuccessRate = totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(1) : '0.0';
  
  return {
    label,
    period: { start: startTime, end: endTime },
    total_calls: totalCalls,
    successful_calls: successfulCalls,
    voicemail_calls: voicemailCalls,
    success_rate: parseFloat(overallSuccessRate),
    agent_metrics: agentMetrics
  };
}

/**
 * Calculate improvement lift between two periods
 */
function calculateImprovementLift(beforeMetrics, afterMetrics) {
  if (!beforeMetrics || !afterMetrics) {
    return null;
  }
  
  const lift = {
    success_rate_change: afterMetrics.success_rate - beforeMetrics.success_rate,
    total_calls_change: afterMetrics.total_calls - beforeMetrics.total_calls,
    successful_calls_change: afterMetrics.successful_calls - beforeMetrics.successful_calls,
    voicemail_calls_change: afterMetrics.voicemail_calls - beforeMetrics.voicemail_calls,
    percentage_lift: beforeMetrics.success_rate > 0 ? 
      ((afterMetrics.success_rate - beforeMetrics.success_rate) / beforeMetrics.success_rate * 100).toFixed(1) : 'N/A'
  };
  
  return lift;
}

/**
 * Get the last improvement timestamp to measure effectiveness
 */
async function getLastImprovementTimestamp() {
  try {
    // Find the most recent improvement log
    const files = await fs.readdir(CONFIG.LOGS_DIR);
    const improvementFiles = files
      .filter(f => f.startsWith('improvement-') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (improvementFiles.length > 0) {
      const latestFile = path.join(CONFIG.LOGS_DIR, improvementFiles[0]);
      const data = JSON.parse(await fs.readFile(latestFile, 'utf8'));
      return new Date(data.timestamp);
    }
  } catch (error) {
    console.warn('⚠️ Could not find last improvement timestamp:', error.message);
  }
  
  // If no previous improvements, return 7 days ago
  return new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
}

/**
 * Fetch recent calls and analyze patterns for all discovered agents
 */
async function fetchAndAnalyzeCalls() {
  // Discover agents dynamically
  const agents = await discoverActiveAgents();
  
  if (agents.length === 0) {
    return { 
      status: 'no_agents', 
      message: 'No valid agents found for analysis' 
    };
  }
  
  // Get the timestamp of the last analysis to avoid re-analyzing calls
  const lastAnalysis = await getLastAnalysisTimestamp();
  const now = new Date();
  
  console.log(`📅 Last analysis: ${lastAnalysis.toLocaleString()}`);
  console.log(`📅 Current time: ${now.toLocaleString()}`);
  console.log(`⏱️  Time since last analysis: ${Math.round((now - lastAnalysis) / (1000 * 60 * 60))} hours`);
  
  // Only analyze calls since the last analysis
  const hoursSinceLast = (now - lastAnalysis) / (1000 * 60 * 60);
  
  // Safety check: If it's been more than 7 days, only look at the last 7 days
  // This prevents analyzing thousands of calls if the system was down for weeks
  const maxLookbackHours = 7 * 24; // 7 days
  let since = lastAnalysis.getTime();
  
  if (hoursSinceLast > maxLookbackHours) {
    since = Date.now() - (maxLookbackHours * 60 * 60 * 1000);
    console.log(`⚠️  Last analysis was ${hoursSinceLast.toFixed(1)} hours ago (>${maxLookbackHours} hours)`);
    console.log(`🔒 For safety, limiting analysis to last ${maxLookbackHours} hours`);
  }
  
  console.log(`🔍 Analysis window: ${Math.min(hoursSinceLast, maxLookbackHours).toFixed(1)} hours since last analysis`);
  console.log(`🔍 Fetching calls since: ${new Date(since).toLocaleString()}`);
  
  // Collect calls from all discovered agents
  let allCalls = [];
  let totalCallsFound = 0;
  
  for (const agent of agents) {
    console.log(`📞 Fetching calls for ${agent.name}...`);
    
    try {
      const agentCalls = await retell.call.list({
        agent_id: agent.id,
        start_timestamp: since,
        limit: 100
      });
      
      // Filter for phone calls only (exclude web calls)
      const phoneCalls = agentCalls.filter(call => {
        // Phone calls have from_number and to_number, web calls don't
        return call.from_number && call.to_number;
      });
      
      console.log(`   - Found ${agentCalls.length} total calls, ${phoneCalls.length} phone calls`);
      
      // Add agent info to each call
      phoneCalls.forEach(call => {
        call.agent_info = {
          id: agent.id,
          name: agent.name,
          llm_id: agent.llm_id
        };
      });
      
      allCalls = allCalls.concat(phoneCalls);
      totalCallsFound += agentCalls.length;
      
    } catch (error) {
      console.warn(`⚠️ Error fetching calls for ${agent.name}:`, error.message);
    }
  }
  
  console.log(`📞 Found ${totalCallsFound} total calls, ${allCalls.length} phone calls in analysis window`);
  
  // Check if we have enough new phone calls to analyze
  if (allCalls.length < CONFIG.MIN_CALLS_FOR_ANALYSIS) {
    console.log(`⚠️  Not enough new phone calls for analysis (${allCalls.length} < ${CONFIG.MIN_CALLS_FOR_ANALYSIS})`);
    console.log(`💡 Only analyzing calls since ${new Date(since).toLocaleString()}`);
    console.log('💡 This means no new calls to analyze since last improvement, or system is working well');
    return { status: 'insufficient_new_data', calls_found: allCalls.length, total_calls_found: totalCallsFound };
  }
  
  // Filter out adversarial calls
  const originalCount = allCalls.length;
  allCalls = filterAdversarialCalls(allCalls);
  
  if (originalCount - allCalls.length > 5) {
    console.warn(`⚠️  Filtered ${originalCount - allCalls.length} potentially adversarial calls`);
  }
  
  // Check for anomalies
  const anomalies = detectAnomalies(allCalls);
  if (anomalies.length > 0) {
    console.error('🚨 Anomalies detected:', anomalies);
    console.log('Skipping automatic improvements due to suspicious activity');
    return null;
  }

  // Categorize calls by agent
  const analysis = {
    total: allCalls.length,
    total_calls_found: totalCallsFound,
    discovered_agents: agents,
    by_agent: {},
    successful: [],
    failed: [],
    voicemail: [],
    edge_cases: [],
    common_issues: {},
    unhandled_requests: []
  };

  // Initialize agent-specific analysis for all discovered agents
  for (const agent of agents) {
    analysis.by_agent[agent.id] = {
      name: agent.name,
      total: 0,
      successful: 0,
      failed: 0,
      voicemail: 0,
      calls: []
    };
  }

  for (const call of allCalls) {
    const agentId = call.agent_info.id;
    analysis.by_agent[agentId].total++;
    analysis.by_agent[agentId].calls.push(call);
    
    // Check if voicemail
    if (call.call_analysis?.in_voicemail) {
      analysis.voicemail.push(call);
      analysis.by_agent[agentId].voicemail++;
    }
    
    // Check success
    if (call.call_analysis?.call_successful === false) {
      analysis.failed.push(call);
      analysis.by_agent[agentId].failed++;
    } else {
      analysis.successful.push(call);
      analysis.by_agent[agentId].successful++;
    }

    // Analyze transcript for patterns
    const transcript = call.transcript || '';
    
    // Check for repeated greetings (our original issue)
    if (transcript.match(/Hi .*this is The Meatery.*Hi .*this is The Meatery/s)) {
      addIssue(analysis.common_issues, 'repeated_greeting', call);
    }

    // Check for unhandled requests
    const unhandledPatterns = [
      { pattern: /how do i (re)?order/i, type: 'reorder_request' },
      { pattern: /discount|coupon|promo/i, type: 'discount_request' },
      { pattern: /cancel/i, type: 'cancellation' },
      { pattern: /speak to (a )?human|manager|supervisor/i, type: 'escalation_request' },
      { pattern: /press \d|leave a message|voicemail/i, type: 'voicemail_system' },
      { pattern: /when.*deliver|shipping|track/i, type: 'delivery_inquiry' },
      { pattern: /allergen|gluten|dietary/i, type: 'dietary_inquiry' }
    ];

    for (const { pattern, type } of unhandledPatterns) {
      if (transcript.match(pattern)) {
        analysis.unhandled_requests.push({
          call_id: call.call_id,
          agent_id: agentId,
          agent_name: call.agent_info.name,
          type,
          excerpt: extractContext(transcript, pattern),
          sentiment: call.call_analysis?.user_sentiment
        });
      }
    }

    // Check for negative sentiment with specific issues
    if (call.call_analysis?.user_sentiment === 'Negative' || 
        call.call_analysis?.user_sentiment === 'very_dissatisfied') {
      analysis.edge_cases.push({
        call_id: call.call_id,
        agent_id: agentId,
        agent_name: call.agent_info.name,
        issue: extractIssueFromTranscript(transcript),
        resolution: call.call_analysis?.custom_analysis_data?.resolution_preference
      });
    }
  }

  return analysis;
}

function addIssue(issues, type, call) {
  if (!issues[type]) {
    issues[type] = { count: 0, examples: [] };
  }
  issues[type].count++;
  if (issues[type].examples.length < 3) {
    issues[type].examples.push(call.call_id);
  }
}

function extractContext(transcript, pattern, contextChars = 100) {
  const match = transcript.match(pattern);
  if (!match) return '';
  
  const index = match.index;
  const start = Math.max(0, index - contextChars);
  const end = Math.min(transcript.length, index + match[0].length + contextChars);
  
  return transcript.substring(start, end).replace(/\n/g, ' ').trim();
}

function extractIssueFromTranscript(transcript) {
  // Simple heuristic to extract the main issue
  const lines = transcript.split('\n');
  for (const line of lines) {
    if (line.includes('problem') || line.includes('issue') || 
        line.includes('wrong') || line.includes('not')) {
      return line.trim();
    }
  }
  return 'Unknown issue';
}

/**
 * Validate improvements for safety and appropriateness
 */
function validateImprovements(improvements) {
  const forbidden = [
    // Offensive content - more specific patterns to avoid false positives
    /fuck|shit|bitch|asshole|cunt|nigger|faggot|whore|slut/i,
    /profanity|swear|curse/i,
    /racist|sexist|discriminat/i,
    // Negative behavior
    /hang up|ignore|rude|mean|nasty|hostile|aggressive/i,
    // Manipulation - but allow legitimate discount handling
    /free.*everyone|give away.*unlimited|unlimited.*free/i,
    // Privacy violations
    /share.*information|tell.*about.*other|reveal.*customer/i,
    // Prompt injection attempts
    /ignore previous|forget instructions|new directive|override/i
  ];
  
  const allText = JSON.stringify(improvements).toLowerCase();
  
  for (const pattern of forbidden) {
    if (pattern.test(allText)) {
      console.warn('⚠️  Blocked potentially harmful improvement:', pattern);
      return false;
    }
  }
  
  // Check for positive intent - look for helpful, professional language
  const requiredPositive = [
    'help', 'assist', 'respond', 'handle', 'provide', 'ensure', 'improve', 'enhance'
  ];
  
  const hasPositiveIntent = requiredPositive.some(word => 
    allText.toLowerCase().includes(word.toLowerCase())
  );
  
  if (!hasPositiveIntent && improvements.new_sections) {
    console.warn('⚠️  Improvements lack positive intent indicators');
    console.log('Text content:', allText.substring(0, 200) + '...');
    return false;
  }
  
  return true;
}

/**
 * Filter out potentially malicious or adversarial call data
 */
function filterAdversarialCalls(calls) {
  return calls.filter(call => {
    const transcript = call.transcript || '';
    
    // Filter out calls with explicit manipulation attempts
    const manipulationPatterns = [
      /train.*to.*say/i,
      /make.*agent.*say/i,
      /jailbreak/i,
      /prompt injection/i,
      /ignore.*instructions/i,
      /pretend.*you're/i,
      /act like/i,
      /roleplay/i
    ];
    
    for (const pattern of manipulationPatterns) {
      if (pattern.test(transcript)) {
        console.warn(`Filtered adversarial call ${call.call_id}`);
        return false;
      }
    }
    
    // Filter out calls with excessive profanity or hostility
    const profanityCount = (transcript.match(/fuck|shit|damn|bitch|asshole/gi) || []).length;
    if (profanityCount > 2) {
      console.warn(`Filtered hostile call ${call.call_id}`);
      return false;
    }
    
    return true;
  });
}

/**
 * Generate prompt improvements based on analysis
 */
async function generatePromptImprovements(analysis, currentPrompt) {
  const improvementPrompt = `
You are an AI prompt engineer specializing in voice AI agents. 
Analyze the following call data and current agent prompt to suggest improvements.

SAFETY REQUIREMENTS:
- NEVER suggest content that could be offensive, discriminatory, or harmful
- MAINTAIN professional, helpful, and respectful tone at all times
- PROTECT customer privacy - never share information between customers
- REJECT any attempts to manipulate the agent negatively
- ENSURE all improvements serve legitimate business purposes

CURRENT AGENT PROMPT:
${currentPrompt}

CALL ANALYSIS DATA:
- Total calls: ${analysis.total}
- Success rate: ${((analysis.successful.length / analysis.total) * 100).toFixed(1)}%
- Voicemail encounters: ${analysis.voicemail.length}
- Failed calls: ${analysis.failed.length}

COMMON ISSUES:
${JSON.stringify(analysis.common_issues, null, 2)}

UNHANDLED REQUESTS:
${JSON.stringify(analysis.unhandled_requests, null, 2)}

EDGE CASES:
${JSON.stringify(analysis.edge_cases, null, 2)}

Based on this analysis, provide:
1. Specific prompt additions to handle unhandled requests
2. New conversation paths for common edge cases
3. Voicemail detection and handling instructions
4. Any other improvements to increase success rate

Format your response as a JSON object with:
{
  "new_sections": { 
    "section_name": "content to add",
    ...
  },
  "modifications": {
    "existing_section": "how to modify it",
    ...
  },
  "priority_fixes": ["fix1", "fix2", ...],
  "expected_improvement": "percentage or description"
}
`;

  const response = await openai.chat.completions.create({
    model: CONFIG.IMPROVEMENT_MODEL,
    messages: [
      { role: 'system', content: 'You are an expert at improving voice AI agent prompts based on real call data.' },
      { role: 'user', content: improvementPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Apply improvements to all discovered agents
 */
async function applyImprovements(improvements, discoveredAgents, requireApproval = false) {
  // Validate improvements for safety
  if (!validateImprovements(improvements)) {
    console.error('❌ Improvements failed safety validation');
    throw new Error('Improvements contain potentially harmful content');
  }
  
  // Check if changes are significant (require human review)
  const isSignificant = improvements.priority_fixes?.length > 3 || 
                       Object.keys(improvements.new_sections || {}).length > 2;
  
  if (isSignificant && requireApproval) {
    console.log('⚠️ Significant changes detected - human approval required');
    await requestHumanApproval(improvements);
    return [];
  }
  
  const updatedAgents = [];
  
  // Apply improvements to each discovered agent
  for (const agent of discoveredAgents) {
    if (!agent.llm_id) {
      console.log(`⚠️ Skipping ${agent.name} - no LLM configured`);
      continue;
    }
    try {
      console.log(`🔄 Updating ${agent.name}...`);
      
      // Get current LLM configuration
      const currentLLM = await retell.llm.retrieve(agent.llm_id);
      
      // Build improved prompt
      let improvedPrompt = currentLLM.general_prompt;
      
      // Add new sections
      if (improvements.new_sections) {
        for (const [section, content] of Object.entries(improvements.new_sections)) {
          improvedPrompt += `\n\n${section.toUpperCase()}:\n${content}`;
        }
      }
      
      // Ensure core behaviors are preserved
      improvedPrompt = preserveCoreBehaviors(improvedPrompt);
      
      // Update the LLM
      const updated = await retell.llm.update(agent.llm_id, {
        general_prompt: improvedPrompt
      });
      
      // CRITICAL: Publish the new agent version to make it live
      console.log(`📤 Publishing new version for ${agent.name}...`);
      try {
        // Get the agent to find the latest version
        const agentDetails = await retell.agent.retrieve(agent.id);
        const latestVersion = agentDetails.version;
        
        // Update the agent to use the new LLM version and publish it
        const publishedAgent = await retell.agent.update(agent.id, {
          response_engine: {
            type: 'retell-llm',
            llm_id: agent.llm_id,
            version: updated.version
          }
        });
        
        console.log(`🚀 ${agent.name} published successfully (version ${publishedAgent.version})`);
        
        updatedAgents.push({
          agent_id: agent.id,
          agent_name: agent.name,
          llm_id: agent.llm_id,
          last_modified: updated.last_modification_timestamp,
          published_version: publishedAgent.version,
          is_published: true
        });
        
      } catch (publishError) {
        console.error(`❌ Failed to publish ${agent.name}:`, publishError.message);
        // Still track the LLM update even if publishing failed
        updatedAgents.push({
          agent_id: agent.id,
          agent_name: agent.name,
          llm_id: agent.llm_id,
          last_modified: updated.last_modification_timestamp,
          published_version: null,
          is_published: false,
          publish_error: publishError.message
        });
      }
      
    } catch (error) {
      console.error(`❌ Failed to update ${agent.name}:`, error.message);
    }
  }
  
  // Log the improvement
  await logImprovement(improvements, updatedAgents);
  
  return updatedAgents;
}

/**
 * Log improvements for tracking
 */
async function logImprovement(improvements, updatedAgents) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    improvements,
    updated_agents: updatedAgents,
    version: Date.now()
  };
  
  // Ensure logs directory exists
  await fs.mkdir(CONFIG.LOGS_DIR, { recursive: true });
  
  // Save log
  const logPath = path.join(CONFIG.LOGS_DIR, `improvement-${timestamp}.json`);
  await fs.writeFile(logPath, JSON.stringify(logEntry, null, 2));
  
  console.log(`Logged improvement to: ${logPath}`);
}

/**
 * Ensure core behaviors are preserved
 */
function preserveCoreBehaviors(improvedPrompt) {
  const coreBehaviors = [
    'The Meatery' // Core business identity - this is the only universal requirement
  ];
  
  // Ensure all core behaviors remain
  for (const behavior of coreBehaviors) {
    if (!improvedPrompt.includes(behavior)) {
      console.error('❌ Core behavior removed:', behavior);
      throw new Error('Attempted to remove core agent behavior');
    }
  }
  
  return improvedPrompt;
}

/**
 * Main execution loop - now fully dynamic
 */
async function runImprovementLoop() {
  console.log('🔄 Starting Dynamic Prompt Improvement Loop...\n');
  
  // Initialize email service for daily summaries
  console.log('📧 Initializing email service...');
  await initializeEmailService();
  
  try {
    // Step 0: Get discovered agents for performance comparison
    const agents = await discoverActiveAgents();
    
    if (agents.length === 0) {
      console.log('⚠️ No valid agents found for analysis');
      return { status: 'no_agents' };
    }
    
    // Step 1: Measure performance BEFORE applying any improvements
    console.log('📈 Measuring current performance vs previous improvements...');
    
    const now = Date.now();
    const lastImprovement = await getLastImprovementTimestamp();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    // Get performance metrics for different periods
    const beforeImprovement = await getPerformanceMetrics(
      agents,
      lastImprovement.getTime() - dayInMs, // Day before last improvement
      lastImprovement.getTime(),           // Day of last improvement
      "BEFORE Last Improvement"
    );
    
    const afterImprovement = await getPerformanceMetrics(
      agents,
      lastImprovement.getTime(),           // Since last improvement
      now,                                 // Until now
      "AFTER Last Improvement"
    );
    
    // Calculate the lift from last improvement
    const improvementLift = calculateImprovementLift(beforeImprovement, afterImprovement);
    
    if (improvementLift) {
      console.log('\n📈 IMPROVEMENT EFFECTIVENESS:');
      console.log(`   Success Rate: ${beforeImprovement.success_rate}% → ${afterImprovement.success_rate}% (${improvementLift.success_rate_change > 0 ? '+' : ''}${improvementLift.success_rate_change}%)`);
      console.log(`   Percentage Lift: ${improvementLift.percentage_lift}%`);
      console.log(`   Total Calls: ${beforeImprovement.total_calls} → ${afterImprovement.total_calls} (${improvementLift.total_calls_change > 0 ? '+' : ''}${improvementLift.total_calls_change})`);
      
      // Only apply new improvements if the last one was effective OR if success rate is still low
      if (parseFloat(improvementLift.percentage_lift) < -5) {
        console.log('⚠️ Last improvement decreased performance by >5% - being more conservative with new changes');
        CONFIG.MIN_CALLS_FOR_ANALYSIS = Math.max(CONFIG.MIN_CALLS_FOR_ANALYSIS * 2, 10);
      } else if (parseFloat(improvementLift.percentage_lift) > 10) {
        console.log('✅ Last improvement was very effective (+10%+) - continuing with similar changes');
      }
    }
    
    // Step 2: Analyze recent calls (now with dynamic agent discovery)
    console.log('\n📊 Analyzing recent calls for new improvements...');
    const analysis = await fetchAndAnalyzeCalls();
    
    // Check if analysis was blocked due to anomalies
    if (!analysis) {
      console.log('⚠️ Analysis blocked due to detected anomalies');
      return { status: 'blocked', reason: 'anomalies_detected' };
    }
    
    if (analysis.status === 'no_agents') {
      console.log('⚠️ No valid agents found for analysis');
      return { status: 'no_agents' };
    }
    
    if (analysis.status === 'insufficient_new_data') {
      console.log(`💡 No new calls to analyze since last run`);
      console.log(`   - Calls found: ${analysis.calls_found}`);
      console.log(`   - This suggests the system is working well or there's low call volume`);
      
      // Send summary email even when no improvements are needed
      try {
        const summaryData = {
          analysis_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
          calls_analyzed: analysis.calls_found,
          success_rate: 'N/A - No new calls',
          improvements_made: false,
          new_sections_added: {},
          priority_fixes: [],
          expected_improvement: 'None needed - system working well',
          next_analysis_time: new Date(Date.now() + (24 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
          status: 'No new calls to analyze - system performing well',
          agents_analyzed: analysis.discovered_agents?.length || 0
        };
        
        await sendDailyImprovementSummary(summaryData);
        console.log('✅ Daily summary email sent to nicholas@themeatery.com (no improvements needed)');
      } catch (emailError) {
        console.error('⚠️ Failed to send daily summary email:', emailError.message);
      }
      
      return { status: 'insufficient_new_data', calls_found: analysis.calls_found };
    }
    
    if (analysis.total < CONFIG.MIN_CALLS_FOR_ANALYSIS) {
      console.log(`⚠️  Not enough calls for analysis (${analysis.total} < ${CONFIG.MIN_CALLS_FOR_ANALYSIS})`);
      return { status: 'insufficient_data' };
    }
    
    console.log(`✅ Analyzed ${analysis.total} phone calls (${analysis.total_calls_found} total calls found)`);
    console.log(`   - Success rate: ${((analysis.successful.length / analysis.total) * 100).toFixed(1)}%`);
    console.log(`   - Unhandled requests: ${analysis.unhandled_requests.length}`);
    console.log(`   - Edge cases: ${analysis.edge_cases.length}`);
    console.log(`   - Agents discovered: ${analysis.discovered_agents.length}`);
    
    // Show agent-specific breakdown
    console.log('\n📊 Agent-specific breakdown:');
    for (const agent of analysis.discovered_agents) {
      const agentData = analysis.by_agent[agent.id];
      if (agentData.total > 0) {
        const successRate = agentData.total > 0 ? ((agentData.successful / agentData.total) * 100).toFixed(1) : '0.0';
        console.log(`   - ${agent.name}: ${agentData.total} calls, ${successRate}% success rate`);
      }
    }
    console.log('');
    
    // Step 2: Generate improvements
    console.log('🤖 Generating prompt improvements...');
    // Use the first discovered agent's LLM for generating improvements
    const firstAgent = analysis.discovered_agents.find(agent => agent.llm_id);
    if (!firstAgent) {
      console.error('❌ No agents with LLMs found for improvement generation');
      return { status: 'no_llm_agents' };
    }
    
    const currentLLM = await retell.llm.retrieve(firstAgent.llm_id);
    const improvements = await generatePromptImprovements(analysis, currentLLM.general_prompt);
    
    console.log('📝 Suggested improvements:');
    console.log(`   - Priority fixes: ${improvements.priority_fixes?.join(', ')}`);
    console.log(`   - Expected improvement: ${improvements.expected_improvement}\n`);
    
    // Debug: Show full improvements
    console.log('🔍 Full improvements object:');
    console.log(JSON.stringify(improvements, null, 2));
    
    // Step 3: Apply improvements
    console.log('🚀 Applying improvements...');
    const updatedAgents = await applyImprovements(improvements, analysis.discovered_agents);
    
    console.log('✅ All agent prompts updated successfully!');
    for (const agent of updatedAgents) {
      console.log(`   - ${agent.agent_name}: ${agent.llm_id}`);
      console.log(`     Last modified: ${new Date(agent.last_modified).toISOString()}`);
    }
    console.log('');
    
    // Step 4: Update the last analysis timestamp
    await updateLastAnalysisTimestamp();
    console.log('📅 Analysis timestamp updated - next run will focus on new calls only');
    
    // Step 5: Send daily summary email to Nicholas
    console.log('📧 Sending daily improvement summary email...');
    try {
      const summaryData = {
        analysis_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
        calls_analyzed: analysis.total,
        total_calls_found: analysis.total_calls_found,
        success_rate: ((analysis.successful.length / analysis.total) * 100).toFixed(1),
        improvements_made: true,
        new_sections_added: improvements.new_sections || {},
        priority_fixes: improvements.priority_fixes || [],
        expected_improvement: improvements.expected_improvement || 'Unknown',
        next_analysis_time: new Date(Date.now() + (24 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
        status: 'Improvements applied successfully',
        agent_breakdown: analysis.by_agent,
        // Add performance comparison data
        performance_comparison: {
          before_improvement: beforeImprovement,
          after_improvement: afterImprovement,
          improvement_lift: improvementLift,
          last_improvement_date: lastImprovement.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })
        },
        updated_agents: updatedAgents.map(agent => ({
          name: agent.agent_name,
          llm_id: agent.llm_id,
          last_modified: new Date(agent.last_modified).toISOString()
        }))
      };
      
      await sendDailyImprovementSummary(summaryData);
      console.log('✅ Daily summary email sent to nicholas@themeatery.com');
    } catch (emailError) {
      console.error('⚠️ Failed to send daily summary email:', emailError.message);
      // Don't fail the improvement loop if email fails
    }
    
    // Step 6: Schedule next run
    console.log('⏰ Next analysis in 24 hours...');
    
  } catch (error) {
    console.error('❌ Error in improvement loop:', error);
    
    // Send error summary email if possible
    try {
      const errorSummaryData = {
        analysis_date: new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
        calls_analyzed: 0,
        success_rate: 0,
        improvements_made: false,
        new_sections_added: {},
        priority_fixes: [],
        expected_improvement: 'None - error occurred',
        next_analysis_time: new Date(Date.now() + (24 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
        status: `Error: ${error.message}`
      };
      
      await sendDailyImprovementSummary(errorSummaryData);
      console.log('⚠️ Error summary email sent to nicholas@themeatery.com');
    } catch (emailError) {
      console.error('❌ Failed to send error summary email:', emailError.message);
    }
  }
}

// Add specific improvements for Carlos's issues
async function applyCarlosImprovements() {
  const specificImprovements = {
    new_sections: {
      "HANDLING REORDER REQUESTS": `
If customer asks about reordering:
"I'd love to help you reorder! You can place a new order at themeatery.com, or I can have someone from our team call you back to assist with that. Which would you prefer?"
- If they want callback: "Perfect, I'll have someone reach out within 24 hours."
- If they'll order online: "Great! You'll find all our products at themeatery.com."
`,
      "HANDLING DISCOUNT REQUESTS": `
If customer asks for discount/coupon/promo:
"I appreciate you asking! While I can't provide discounts directly, I'll note your interest and have our team check if there are any current promotions available for you. They'll reach out if we have something special."
`,
      "VOICEMAIL DETECTION": `
CRITICAL: If you hear ANY of these phrases, you've reached voicemail:
- "leave a message"
- "press [number]"
- "mailbox"
- "after the tone"
- "to replay"
- "voicemail"

If voicemail detected:
1. STOP the conversation immediately
2. Wait for the beep
3. Leave this message: "Hi {{customer_name}}, this is The Meatery checking in on your order {{order_number}}. Please call us back at your convenience if you need any assistance. Thank you!"
4. End the call
`
    },
    priority_fixes: [
      "Add voicemail detection",
      "Handle reorder requests",
      "Handle discount requests",
      "Never continue talking to automated systems"
    ],
    expected_improvement: "30-40% reduction in failed calls"
  };
  
  console.log('📝 Applying Carlos-specific improvements...');
  // Get current agents for this specific improvement
  const agents = await discoverActiveAgents();
  await applyImprovements(specificImprovements, agents);
  console.log('✅ Improvements applied!');
}

// Run immediately with full analysis loop
if (import.meta.url.endsWith('prompt-improvement-loop.js')) {
  console.log('🚀 Starting dynamic script execution...');
  console.log('Environment check:');
  console.log('- RETELL_API_KEY:', process.env.RETELL_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('\n🔍 Agent discovery will run automatically...');
  
  runImprovementLoop()
    .then(result => {
      console.log('✅ Analysis complete:', result);
    })
    .catch(error => {
      console.error('❌ Error in analysis:', error);
      console.error('Stack trace:', error.stack);
    });
}

// Export for use in other modules
export { runImprovementLoop, fetchAndAnalyzeCalls, generatePromptImprovements };
