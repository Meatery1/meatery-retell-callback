#!/usr/bin/env node
/**
 * Manual approval script for pending improvements
 */

import fs from 'fs/promises';
import path from 'path';
import Retell from 'retell-sdk';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
const LOGS_DIR = path.join(__dirname, '../improvement-logs');
const PENDING_FILE = path.join(LOGS_DIR, 'pending-approval.json');

async function reviewAndApprove() {
  try {
    // Check for pending improvements
    const pendingData = await fs.readFile(PENDING_FILE, 'utf-8');
    const { improvements, timestamp } = JSON.parse(pendingData);
    
    console.log('\n📋 PENDING IMPROVEMENTS');
    console.log('=' .repeat(50));
    console.log(`Submitted: ${timestamp}`);
    console.log('\nProposed Changes:');
    console.log(JSON.stringify(improvements, null, 2));
    console.log('\n' + '='.repeat(50));
    
    // Ask for approval
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('\n✅ Approve these changes? (yes/no): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      console.log('\n🚀 Applying approved improvements...');
      
      // Apply the improvements
      const { applyImprovements } = await import('./prompt-improvement-loop.js');
      await applyImprovements(improvements, false); // false = don't require approval again
      
      // Archive the approved improvement
      const approvedFile = path.join(
        LOGS_DIR, 
        `approved-${new Date().toISOString()}.json`
      );
      await fs.rename(PENDING_FILE, approvedFile);
      
      console.log('✅ Improvements applied successfully!');
      console.log(`📁 Archived to: ${approvedFile}`);
      
    } else {
      console.log('\n❌ Changes rejected');
      
      // Archive the rejected improvement
      const rejectedFile = path.join(
        LOGS_DIR, 
        `rejected-${new Date().toISOString()}.json`
      );
      await fs.rename(PENDING_FILE, rejectedFile);
      
      console.log(`📁 Archived to: ${rejectedFile}`);
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  No pending improvements to review');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  reviewAndApprove().catch(console.error);
}

export { reviewAndApprove };
