#!/usr/bin/env node
/**
 * Scheduler for Automated Prompt Improvement
 * Run this as a cron job or scheduled task
 */

import { CronJob } from 'cron';
import { runImprovementLoop } from './prompt-improvement-loop.js';

// Run improvement loop daily at 2 AM
const job = new CronJob(
  '0 2 * * *', // Cron pattern: 2 AM daily
  async function() {
    console.log('🚀 Running scheduled prompt improvement...');
    try {
      await runImprovementLoop();
    } catch (error) {
      console.error('Error in scheduled improvement:', error);
    }
  },
  null,
  true, // Start the job right now
  'America/Los_Angeles'
);

console.log('📅 Prompt improvement scheduler started');
console.log('   Next run:', job.nextDates(1).toString());

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n⏹️  Stopping scheduler...');
  job.stop();
  process.exit(0);
});
