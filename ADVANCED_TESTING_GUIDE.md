# 🚀 Advanced Retell Agent Testing & Optimization Suite

## Overview

This comprehensive testing suite provides multiple layers of testing, monitoring, and automatic improvement for your Retell AI agent. It goes beyond basic scenario testing to include:

- **Stress Testing**: Concurrent call simulations
- **Live Web Testing**: Real-time interactive testing interface
- **Performance Monitoring**: Continuous tracking with auto-improvements
- **Advanced Scenarios**: Edge cases, security tests, and complex interactions

## 🎯 Quick Start

### Prerequisites
```bash
# Ensure you have your environment variables set
RETELL_API_KEY=your_api_key
OPENAI_API_KEY=your_openai_key
RETELL_AGENT_ID=agent_2f7a3254099b872da193df3133
RETELL_LLM_ID=llm_7eed186989d2fba11fa1f9395bc7
```

### Basic Testing Commands

```bash
# Run standard test suite (39 scenarios)
npm test

# Quick test (first 10 scenarios)
npm run test:quick

# Test specific category
npm run test:category hostile_customer

# Advanced stress testing
npm run test:advanced

# High-concurrency stress test (10 simultaneous calls)
npm run test:stress

# Interactive web testing interface
npm run test:web

# Performance monitoring
npm run monitor

# Generate performance dashboard
npm run monitor:dashboard
```

## 📊 Testing Capabilities

### 1. Advanced Stress Testing (`advanced-retell-tester.js`)

Tests your agent with challenging scenarios including:

- **Multiple Simultaneous Issues**: Customer with 3+ problems at once
- **Language Barriers**: Heavy accents, limited English comprehension
- **Security Tests**: Advanced prompt injection attempts
- **Rapid Fire Questions**: High-speed interactions with interruptions
- **Emotional Situations**: Crying customers, special occasions
- **Technical Issues**: Poor connections, audio dropouts
- **B2B Scenarios**: Restaurant bulk orders with urgency
- **Legal Threats**: Customers threatening lawsuits
- **Cultural Sensitivity**: Religious/dietary violations
- **Chaotic Environments**: Background noise, interruptions

#### Usage:
```bash
# Run all advanced scenarios
npm run test:advanced

# Quick test (first 3 scenarios)
npm run test:advanced -- --quick

# Test specific scenarios
npm run test:advanced -- --scenarios stress_multi_issue,edge_language_barrier

# Adjust concurrency
npm run test:advanced -- --concurrent 10
```

#### Output:
- Detailed performance metrics
- Behavior analysis scores
- HTML dashboard with visualizations
- JSON reports for CI/CD integration

### 2. Live Web Testing Interface (`retell-web-call-tester.js`)

Interactive browser-based testing with:

- **Real Web Calls**: Uses actual Retell Web SDK
- **Scenario Automation**: Pre-built test scripts
- **Live Metrics**: Real-time performance tracking
- **Transcript Analysis**: See agent responses as they happen
- **Test Script Guidance**: Click-through conversation flows

#### Usage:
```bash
# Start the web interface
npm run test:web

# Open browser to http://localhost:3001
```

#### Features:
- 8+ pre-configured test scenarios
- Auto-speak functionality for hands-free testing
- Recording and analysis capabilities
- Satisfaction scoring
- Visual test results

### 3. Performance Monitor (`retell-performance-monitor.js`)

Continuous monitoring with automatic improvements:

- **Real Call Analysis**: Monitors actual production calls
- **Pattern Detection**: Identifies common issues
- **Auto-Improvements**: Generates and applies prompt updates
- **Performance Tracking**: Success rate, satisfaction, refund rate
- **Dashboard Generation**: Beautiful HTML reports

#### Usage:
```bash
# Start continuous monitoring
npm run monitor

# Run analysis once
npm run monitor:once

# Generate dashboard only
npm run monitor:dashboard
```

#### Metrics Tracked:
- Success rate (target: >80%)
- Customer satisfaction (target: >3.5/5)
- Average call duration
- Refund rate (target: <20%)
- Discount rate
- Issue type distribution
- Resolution preferences

## 📈 Performance Benchmarks

### Current Performance (After Improvements)
- **Overall Success Rate**: 72.8% ↑ from 56.4%
- **Customer Satisfaction**: 3.8/5
- **Refund Rate**: 15% ↓ from 25%
- **Average Call Duration**: 52 seconds

### Strong Areas (>90% Success)
✅ Happy customer scenarios
✅ Thawed meat education
✅ VIP recognition
✅ Voicemail detection
✅ Food safety handling

### Areas for Improvement (<70% Success)
⚠️ Hostile customer de-escalation
⚠️ Complex multi-issue scenarios
⚠️ B2B/Restaurant orders
⚠️ Child safety protocols

## 🔧 Continuous Improvement Workflow

### Automated Pipeline
1. **Monitor** → Track real calls every 30 minutes
2. **Analyze** → Identify patterns and issues
3. **Generate** → Create specific improvements
4. **Test** → Validate with simulation
5. **Apply** → Update agent prompt
6. **Verify** → Re-test after 2 hours

### Manual Intervention Points
```bash
# Review improvements before applying
npm run apply-improvements

# Auto-apply improvements
npm run apply-improvements:auto

# Rollback if needed
npm run apply-improvements -- --rollback ./backups/prompt-backup-xxx.txt
```

## 🎭 Test Scenario Categories

### Customer Types
- Happy/Satisfied
- Angry/Hostile
- Confused/Elderly
- VIP/Regular
- Business/Restaurant
- Children
- Intoxicated
- Non-native speakers

### Issue Types
- Thawed meat (normal)
- Spoiled meat (problem)
- Missing items
- Wrong items
- Delivery issues
- Quality concerns
- Multiple simultaneous issues

### Edge Cases
- Prompt injections
- Refund seekers
- Technical difficulties
- Language barriers
- Legal threats
- Cultural/dietary issues
- Emergency situations

## 📊 Dashboards & Reporting

### Performance Dashboard
Access at: `http://localhost:3001/dashboard` (when monitor is running)

Shows:
- Real-time metrics
- Issue distribution charts
- Trend analysis
- Active recommendations
- Auto-refreshes every 5 minutes

### Test Reports
Located in `test-results/` directory:
- `report-*.json` - Detailed test results
- `improvements-*.json` - Generated improvements
- `dashboard-*.html` - Visual reports
- `stress-test-*.json` - Stress test results

## 🛡️ Security Testing

The suite includes security tests for:
- Prompt injection attempts
- Role manipulation
- System prompt extraction
- Unauthorized access attempts
- Data exfiltration attempts

## 🚦 CI/CD Integration

### GitHub Actions Example
```yaml
name: Retell Agent Testing

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:quick
      - run: npm run test:advanced -- --quick
      - run: npm run monitor:once
      - uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: test-results/
```

## 💡 Best Practices

### Testing Frequency
- **Daily**: Quick tests (`npm run test:quick`)
- **Weekly**: Full suite (`npm test`)
- **Bi-weekly**: Stress tests (`npm run test:stress`)
- **Continuous**: Performance monitoring (`npm run monitor`)

### When to Test
- After any prompt changes
- Before peak seasons (holidays)
- After customer complaints
- When adding new features
- After system updates

### Interpreting Results
- **>90% pass rate**: Excellent, minor tweaks only
- **80-90% pass rate**: Good, focus on failed categories
- **70-80% pass rate**: Needs improvement, apply suggestions
- **<70% pass rate**: Significant issues, review fundamentals

## 🔄 Improvement Cycle

### Automatic Improvements
The system automatically:
1. Monitors performance every 30 minutes
2. Generates improvements when success rate < 70%
3. Backs up current prompt
4. Applies improvements
5. Schedules verification test

### Manual Review
Always review auto-generated improvements:
```bash
# Check improvement log
cat improvement-log.json

# Review backups
ls backups/

# Rollback if needed
npm run apply-improvements -- --rollback ./backups/[file]
```

## 📝 Adding Custom Scenarios

### 1. Add to test-scenarios-comprehensive.json
```json
{
  "id": "custom_scenario",
  "category": "custom",
  "customer_name": "Test User",
  "order_number": "12345",
  "scenario": "Description",
  "customer_responses": ["Response 1", "Response 2"],
  "expected_outcomes": {
    "satisfaction": "satisfied",
    "issue_resolved": true
  }
}
```

### 2. Add to ADVANCED_SCENARIOS in advanced-retell-tester.js
```javascript
{
  id: 'custom_advanced',
  name: 'Custom Advanced Test',
  metadata: { /* ... */ },
  dynamicVariables: { /* ... */ },
  expectedBehavior: { /* ... */ }
}
```

## 🆘 Troubleshooting

### Common Issues

**Tests timing out:**
- Increase `CALL_TIMEOUT_MS` in config
- Check network connectivity
- Verify API keys are valid

**Low success rates:**
- Review failed test categories
- Check recent prompt changes
- Analyze call transcripts
- Run `npm run apply-improvements`

**Dashboard not updating:**
- Ensure monitor is running
- Check performance-data.json exists
- Verify cron schedule is correct

## 📚 Additional Resources

- [Retell API Documentation](https://docs.retellai.com)
- [Test Scenarios Guide](./test-scenarios-comprehensive.json)
- [Performance Data](./performance-data.json)
- [Improvement Log](./improvement-log.json)

## 🎯 Success Metrics

The testing suite is successful when:
1. **Test pass rate >80%** consistently
2. **Customer satisfaction >4/5**
3. **Refund rate <15%**
4. **No security vulnerabilities**
5. **Automatic improvements show positive impact**

---

## Quick Command Reference

```bash
# Testing
npm test                    # Full test suite
npm run test:quick         # Quick 10 scenarios
npm run test:advanced      # Advanced stress test
npm run test:web          # Web interface

# Monitoring
npm run monitor           # Start continuous monitoring
npm run monitor:dashboard # Generate dashboard

# Improvements
npm run apply-improvements      # Manual review
npm run apply-improvements:auto # Auto-apply

# Analysis
npm run analyze-call [id]  # Analyze specific call
```

---

**Remember:** The goal is continuous improvement, not perfection. Regular testing and monitoring will help your agent handle real-world scenarios better over time.
