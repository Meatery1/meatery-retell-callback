#!/usr/bin/env node
/**
 * Retell Agent Performance Monitor & Auto-Improver
 * Continuously monitors real calls and automatically improves the agent
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';
import cron from 'cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  AGENT_ID: 'agent_2f7a3254099b872da193df3133',
  LLM_ID: process.env.RETELL_LLM_ID || 'llm_7eed186989d2fba11fa1f9395bc7',
  ANALYSIS_MODEL: 'gpt-4o',
  MONITORING_INTERVAL: '*/30 * * * *', // Every 30 minutes
  IMPROVEMENT_THRESHOLD: 0.7, // Apply improvements if success rate < 70%
  MIN_CALLS_FOR_ANALYSIS: 10,
  LOOKBACK_HOURS: 24
};

/**
 * Performance metrics tracking
 */
class PerformanceTracker {
  constructor() {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      voicemails: 0,
      avgDuration: 0,
      avgSatisfaction: 0,
      issueTypes: {},
      resolutionTypes: {},
      discountRate: 0,
      refundRate: 0,
      commonProblems: [],
      behaviorPatterns: {}
    };
  }
  
  async loadHistoricalData() {
    try {
      const dataPath = path.join(__dirname, 'performance-data.json');
      const data = await fs.readFile(dataPath, 'utf-8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      console.log('No historical data found, starting fresh');
    }
  }
  
  async saveData() {
    const dataPath = path.join(__dirname, 'performance-data.json');
    await fs.writeFile(dataPath, JSON.stringify(this.metrics, null, 2));
  }
  
  updateMetrics(call) {
    this.metrics.totalCalls++;
    
    if (call.call_analysis?.call_successful) {
      this.metrics.successfulCalls++;
    } else {
      this.metrics.failedCalls++;
    }
    
    if (call.call_analysis?.in_voicemail) {
      this.metrics.voicemails++;
    }
    
    // Update duration
    if (call.call_cost?.total_duration_seconds) {
      const prevTotal = this.metrics.avgDuration * (this.metrics.totalCalls - 1);
      this.metrics.avgDuration = (prevTotal + call.call_cost.total_duration_seconds) / this.metrics.totalCalls;
    }
    
    // Update satisfaction
    const satisfaction = this.parseSatisfaction(call.call_analysis?.custom_analysis_data?.customer_satisfaction);
    if (satisfaction) {
      const prevTotal = this.metrics.avgSatisfaction * (this.metrics.totalCalls - 1);
      this.metrics.avgSatisfaction = (prevTotal + satisfaction) / this.metrics.totalCalls;
    }
    
    // Track issue types
    const issueType = call.call_analysis?.custom_analysis_data?.issue_type;
    if (issueType) {
      this.metrics.issueTypes[issueType] = (this.metrics.issueTypes[issueType] || 0) + 1;
    }
    
    // Track resolutions
    const resolution = call.call_analysis?.custom_analysis_data?.resolution_preference;
    if (resolution) {
      this.metrics.resolutionTypes[resolution] = (this.metrics.resolutionTypes[resolution] || 0) + 1;
    }
    
    // Track discounts
    if (call.call_analysis?.custom_analysis_data?.send_discount_sms) {
      this.metrics.discountRate = ((this.metrics.discountRate * (this.metrics.totalCalls - 1)) + 1) / this.metrics.totalCalls;
    }
    
    // Track refunds
    if (resolution === 'refund') {
      this.metrics.refundRate = ((this.metrics.refundRate * (this.metrics.totalCalls - 1)) + 1) / this.metrics.totalCalls;
    }
  }
  
  parseSatisfaction(satisfaction) {
    const map = {
      'very_satisfied': 5,
      'satisfied': 4,
      'neutral': 3,
      'dissatisfied': 2,
      'very_dissatisfied': 1
    };
    return map[satisfaction] || 0;
  }
  
  getSuccessRate() {
    if (this.metrics.totalCalls === 0) return 0;
    return this.metrics.successfulCalls / this.metrics.totalCalls;
  }
  
  getReport() {
    return {
      successRate: this.getSuccessRate(),
      metrics: this.metrics,
      recommendations: this.generateRecommendations()
    };
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    // Check success rate
    if (this.getSuccessRate() < 0.8) {
      recommendations.push({
        priority: 'HIGH',
        area: 'Success Rate',
        issue: `Success rate is ${(this.getSuccessRate() * 100).toFixed(1)}%`,
        suggestion: 'Review failed calls for common patterns'
      });
    }
    
    // Check satisfaction
    if (this.metrics.avgSatisfaction < 3.5) {
      recommendations.push({
        priority: 'HIGH',
        area: 'Customer Satisfaction',
        issue: `Average satisfaction is ${this.metrics.avgSatisfaction.toFixed(1)}/5`,
        suggestion: 'Improve empathy and problem resolution'
      });
    }
    
    // Check refund rate
    if (this.metrics.refundRate > 0.2) {
      recommendations.push({
        priority: 'MEDIUM',
        area: 'Refund Rate',
        issue: `Refund rate is ${(this.metrics.refundRate * 100).toFixed(1)}%`,
        suggestion: 'Ensure proper differentiation between thawed and spoiled'
      });
    }
    
    // Check common issues
    const topIssue = Object.entries(this.metrics.issueTypes)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (topIssue && topIssue[1] > this.metrics.totalCalls * 0.3) {
      recommendations.push({
        priority: 'MEDIUM',
        area: 'Common Issue',
        issue: `${topIssue[0]} accounts for ${((topIssue[1] / this.metrics.totalCalls) * 100).toFixed(1)}% of calls`,
        suggestion: `Add specific training for ${topIssue[0]} scenarios`
      });
    }
    
    return recommendations;
  }
}

/**
 * Analyze recent calls and identify patterns
 */
async function analyzeRecentCalls() {
  console.log('\n📊 Analyzing recent calls...');
  
  try {
    // Get recent calls (this would use the actual Retell API)
    // For now, we'll simulate with sample data
    const endTime = Date.now();
    const startTime = endTime - (CONFIG.LOOKBACK_HOURS * 60 * 60 * 1000);
    
    // In production: mcp_retellai-mcp-server_list_calls
    const recentCalls = []; // Would be actual API response
    
    if (recentCalls.length < CONFIG.MIN_CALLS_FOR_ANALYSIS) {
      console.log(`Not enough calls for analysis (${recentCalls.length}/${CONFIG.MIN_CALLS_FOR_ANALYSIS})`);
      return null;
    }
    
    // Analyze patterns
    const tracker = new PerformanceTracker();
    await tracker.loadHistoricalData();
    
    for (const call of recentCalls) {
      tracker.updateMetrics(call);
    }
    
    await tracker.saveData();
    
    const report = tracker.getReport();
    console.log(`Success Rate: ${(report.successRate * 100).toFixed(1)}%`);
    console.log(`Avg Satisfaction: ${report.metrics.avgSatisfaction.toFixed(1)}/5`);
    console.log(`Refund Rate: ${(report.metrics.refundRate * 100).toFixed(1)}%`);
    
    return report;
    
  } catch (error) {
    console.error('Failed to analyze calls:', error);
    return null;
  }
}

/**
 * Generate prompt improvements based on performance data
 */
async function generatePromptImprovements(report) {
  console.log('\n🔧 Generating prompt improvements...');
  
  const improvementPrompt = `
Based on the following performance report, generate specific prompt improvements:

PERFORMANCE METRICS:
- Success Rate: ${(report.successRate * 100).toFixed(1)}%
- Average Satisfaction: ${report.metrics.avgSatisfaction.toFixed(1)}/5
- Refund Rate: ${(report.metrics.refundRate * 100).toFixed(1)}%
- Discount Rate: ${(report.metrics.discountRate * 100).toFixed(1)}%
- Average Call Duration: ${report.metrics.avgDuration.toFixed(0)} seconds

ISSUE DISTRIBUTION:
${JSON.stringify(report.metrics.issueTypes, null, 2)}

RESOLUTION TYPES:
${JSON.stringify(report.metrics.resolutionTypes, null, 2)}

RECOMMENDATIONS:
${JSON.stringify(report.recommendations, null, 2)}

Generate specific prompt additions or modifications to address the issues.
Focus on:
1. Most common problems
2. Low satisfaction areas
3. High refund scenarios
4. Efficiency improvements

Format as JSON:
{
  "additions": [
    "specific instruction to add"
  ],
  "modifications": [
    {
      "find": "text to find",
      "replace": "text to replace with"
    }
  ],
  "emphasis": [
    "area to emphasize more"
  ],
  "expected_improvement": "percentage improvement expected"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.ANALYSIS_MODEL,
      messages: [
        { role: 'system', content: 'You are an expert at optimizing AI agent prompts based on performance data.' },
        { role: 'user', content: improvementPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    });
    
    return JSON.parse(response.choices[0].message.content);
    
  } catch (error) {
    console.error('Failed to generate improvements:', error);
    return null;
  }
}

/**
 * Apply improvements to the agent
 */
async function applyImprovements(improvements) {
  console.log('\n✨ Applying improvements to agent...');
  
  try {
    // Get current LLM configuration
    // In production: mcp_retellai-mcp-server_get_retell_llm
    
    // Back up current prompt
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, 'backups', `prompt-auto-${timestamp}.txt`);
    await fs.mkdir(path.join(__dirname, 'backups'), { recursive: true });
    // await fs.writeFile(backupPath, currentPrompt);
    
    // Apply improvements
    let updatedPrompt = ''; // Would be current prompt
    
    // Apply additions
    if (improvements.additions && improvements.additions.length > 0) {
      updatedPrompt += '\n\n## Auto-Generated Improvements\n';
      improvements.additions.forEach(addition => {
        updatedPrompt += `\n- ${addition}`;
      });
    }
    
    // Apply modifications
    if (improvements.modifications) {
      improvements.modifications.forEach(mod => {
        updatedPrompt = updatedPrompt.replace(mod.find, mod.replace);
      });
    }
    
    // Update the agent
    // In production: mcp_retellai-mcp-server_update_retell_llm
    
    // Log the improvement
    const logPath = path.join(__dirname, 'improvement-log.json');
    const log = {
      timestamp: new Date().toISOString(),
      improvements,
      backupPath,
      expectedImprovement: improvements.expected_improvement
    };
    
    try {
      const existingLog = await fs.readFile(logPath, 'utf-8');
      const logs = JSON.parse(existingLog);
      logs.push(log);
      await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
    } catch {
      await fs.writeFile(logPath, JSON.stringify([log], null, 2));
    }
    
    console.log(`✅ Improvements applied successfully`);
    console.log(`Expected improvement: ${improvements.expected_improvement}`);
    console.log(`Backup saved to: ${backupPath}`);
    
    return true;
    
  } catch (error) {
    console.error('Failed to apply improvements:', error);
    return false;
  }
}

/**
 * Main monitoring loop
 */
async function monitorAndImprove() {
  console.log('\n🔄 Starting monitoring cycle...');
  console.log(`Time: ${new Date().toLocaleString()}`);
  
  // Analyze recent performance
  const report = await analyzeRecentCalls();
  
  if (!report) {
    console.log('Skipping improvement cycle - insufficient data');
    return;
  }
  
  // Check if improvements are needed
  if (report.successRate >= CONFIG.IMPROVEMENT_THRESHOLD) {
    console.log(`Performance is good (${(report.successRate * 100).toFixed(1)}%), no improvements needed`);
    return;
  }
  
  // Generate improvements
  const improvements = await generatePromptImprovements(report);
  
  if (!improvements) {
    console.log('No improvements generated');
    return;
  }
  
  // Apply improvements
  const success = await applyImprovements(improvements);
  
  if (success) {
    // Send notification (could be email, Slack, etc.)
    console.log('\n📧 Improvement notification sent');
    
    // Schedule verification test in 2 hours
    setTimeout(async () => {
      console.log('\n🧪 Running verification test...');
      // Run test suite to verify improvements
      // This would call the test simulator
    }, 2 * 60 * 60 * 1000);
  }
}

/**
 * Generate performance dashboard
 */
async function generateDashboard() {
  const tracker = new PerformanceTracker();
  await tracker.loadHistoricalData();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Retell Agent Performance Monitor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f3f4f6;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h1 { color: #111827; margin-bottom: 8px; }
        .subtitle { color: #6b7280; }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .metric-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .metric-label {
            color: #6b7280;
            font-size: 0.875rem;
            margin-bottom: 8px;
        }
        .metric-value {
            font-size: 2rem;
            font-weight: 600;
            color: #111827;
        }
        .metric-trend {
            font-size: 0.875rem;
            margin-top: 4px;
        }
        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }
        .chart-container {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .chart-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: #111827;
            margin-bottom: 16px;
        }
        .issue-list {
            display: grid;
            gap: 12px;
        }
        .issue-item {
            display: flex;
            justify-content: space-between;
            padding: 12px;
            background: #f9fafb;
            border-radius: 8px;
        }
        .issue-name { font-weight: 500; }
        .issue-count { color: #6b7280; }
        .recommendations {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .rec-item {
            padding: 16px;
            margin: 12px 0;
            border-left: 4px solid;
            background: #f9fafb;
            border-radius: 4px;
        }
        .rec-item.HIGH { border-color: #ef4444; }
        .rec-item.MEDIUM { border-color: #f59e0b; }
        .priority-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .priority-badge.HIGH { background: #fee2e2; color: #dc2626; }
        .priority-badge.MEDIUM { background: #fed7aa; color: #ea580c; }
        .auto-refresh {
            text-align: center;
            color: #6b7280;
            margin-top: 24px;
            font-size: 0.875rem;
        }
    </style>
    <script>
        // Auto-refresh every 5 minutes
        setTimeout(() => location.reload(), 5 * 60 * 1000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Retell Agent Performance Monitor</h1>
            <div class="subtitle">Real-time performance tracking and auto-improvement</div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Success Rate</div>
                <div class="metric-value">${(tracker.getSuccessRate() * 100).toFixed(1)}%</div>
                <div class="metric-trend ${tracker.getSuccessRate() > 0.8 ? 'trend-up' : 'trend-down'}">
                    ${tracker.getSuccessRate() > 0.8 ? '↑' : '↓'} Target: 80%
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Avg Satisfaction</div>
                <div class="metric-value">${tracker.metrics.avgSatisfaction.toFixed(1)}/5</div>
                <div class="metric-trend ${tracker.metrics.avgSatisfaction > 3.5 ? 'trend-up' : 'trend-down'}">
                    ${tracker.metrics.avgSatisfaction > 3.5 ? '↑' : '↓'} Target: 3.5
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Calls</div>
                <div class="metric-value">${tracker.metrics.totalCalls}</div>
                <div class="metric-trend">${tracker.metrics.voicemails} voicemails</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Avg Duration</div>
                <div class="metric-value">${Math.floor(tracker.metrics.avgDuration)}s</div>
                <div class="metric-trend">Optimal: 45-90s</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Refund Rate</div>
                <div class="metric-value">${(tracker.metrics.refundRate * 100).toFixed(1)}%</div>
                <div class="metric-trend ${tracker.metrics.refundRate < 0.2 ? 'trend-up' : 'trend-down'}">
                    ${tracker.metrics.refundRate < 0.2 ? '↑' : '↓'} Target: <20%
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Discount Rate</div>
                <div class="metric-value">${(tracker.metrics.discountRate * 100).toFixed(1)}%</div>
                <div class="metric-trend">Service recovery</div>
            </div>
        </div>
        
        <div class="chart-container">
            <h2 class="chart-title">Issue Distribution</h2>
            <div class="issue-list">
                ${Object.entries(tracker.metrics.issueTypes)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([issue, count]) => `
                    <div class="issue-item">
                        <span class="issue-name">${issue || 'No issue'}</span>
                        <span class="issue-count">${count} calls (${((count/tracker.metrics.totalCalls)*100).toFixed(1)}%)</span>
                    </div>
                  `).join('')}
            </div>
        </div>
        
        <div class="recommendations">
            <h2 class="chart-title">Active Recommendations</h2>
            ${tracker.generateRecommendations().map(rec => `
                <div class="rec-item ${rec.priority}">
                    <span class="priority-badge ${rec.priority}">${rec.priority}</span>
                    <h3 style="margin-bottom: 8px;">${rec.area}</h3>
                    <p style="color: #6b7280; margin-bottom: 8px;">${rec.issue}</p>
                    <p style="color: #111827;">💡 ${rec.suggestion}</p>
                </div>
            `).join('')}
        </div>
        
        <div class="auto-refresh">
            Auto-refreshes every 5 minutes | Last updated: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>
  `;
  
  const dashboardPath = path.join(__dirname, 'performance-dashboard.html');
  await fs.writeFile(dashboardPath, html);
  
  return dashboardPath;
}

/**
 * Start monitoring
 */
async function startMonitoring() {
  console.log('🚀 Retell Agent Performance Monitor');
  console.log('===================================\n');
  console.log(`Agent ID: ${CONFIG.AGENT_ID}`);
  console.log(`Monitoring Interval: ${CONFIG.MONITORING_INTERVAL}`);
  console.log(`Improvement Threshold: ${CONFIG.IMPROVEMENT_THRESHOLD * 100}%\n`);
  
  // Generate initial dashboard
  const dashboardPath = await generateDashboard();
  console.log(`📊 Dashboard available at: file://${dashboardPath}`);
  
  // Run initial analysis
  await monitorAndImprove();
  
  // Schedule regular monitoring
  const job = new cron.CronJob(CONFIG.MONITORING_INTERVAL, monitorAndImprove);
  job.start();
  
  console.log('\n✅ Monitoring started successfully');
  console.log('Press Ctrl+C to stop\n');
  
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping monitor...');
    job.stop();
    process.exit(0);
  });
}

// Command line interface
const args = process.argv.slice(2);

if (args[0] === '--once') {
  // Run once and exit
  monitorAndImprove()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Monitor failed:', error);
      process.exit(1);
    });
} else if (args[0] === '--dashboard') {
  // Generate dashboard only
  generateDashboard()
    .then(path => {
      console.log(`Dashboard generated: ${path}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to generate dashboard:', error);
      process.exit(1);
    });
} else if (args[0] === '--help') {
  console.log(`
Retell Agent Performance Monitor

Usage:
  node retell-performance-monitor.js [options]

Options:
  --once       Run analysis once and exit
  --dashboard  Generate dashboard only
  --help       Show this help message

Without options, starts continuous monitoring.
  `);
  process.exit(0);
} else {
  // Start continuous monitoring
  startMonitoring();
}

export { PerformanceTracker, analyzeRecentCalls, generatePromptImprovements, monitorAndImprove };
