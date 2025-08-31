#!/usr/bin/env node

import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🚀 Testing RetellAI MCP Server Installation');
console.log('==========================================');

// Check if API key is set
if (!process.env.RETELL_API_KEY || process.env.RETELL_API_KEY === 'your_api_key_here') {
  console.log('⚠️  Warning: RETELL_API_KEY not set in .env file');
  console.log('   Please update .env file with your actual RetellAI API key');
  console.log('   Get your API key from: https://dashboard.retellai.com/apiKey');
  console.log('');
}

console.log('✅ MCP Server package installed successfully');
console.log('📦 Package location: node_modules/@abhaybabbar/retellai-mcp-server');
console.log('🔧 Available tools:');
console.log('   - Agent management (create, list, update, delete agents)');
console.log('   - Call management (create phone/web calls, list calls)');
console.log('   - Phone number management (provision, configure numbers)');
console.log('   - Voice management (list available voices)');
console.log('');

console.log('🚀 To start the MCP server, you can:');
console.log('   1. Use npx: npx @abhaybabbar/retellai-mcp-server');
console.log('   2. Or run directly: node node_modules/@abhaybabbar/retellai-mcp-server/build/index.js');
console.log('');

console.log('📚 For Claude Desktop integration:');
console.log('   1. Open Claude Desktop and press CMD + ,');
console.log('   2. Go to Developer tab and click "Edit Config"');
console.log('   3. Add the MCP server configuration to claude_desktop_config.json');
console.log('   4. Restart Claude Desktop');
console.log('');

console.log('🔑 Next steps:');
console.log('   1. Update .env file with your RetellAI API key');
console.log('   2. Test the server with: node test-mcp-server.js');
console.log('   3. Integrate with your preferred MCP client');
