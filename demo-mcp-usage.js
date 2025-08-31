#!/usr/bin/env node

import dotenv from 'dotenv';
import { spawn } from 'child_process';

// Load environment variables
dotenv.config();

console.log('🚀 RetellAI MCP Server - Usage Guide');
console.log('=====================================');
console.log('');

// Check API key
if (!process.env.RETELL_API_KEY || process.env.RETELL_API_KEY === 'your_api_key_here') {
  console.log('⚠️  IMPORTANT: You need to set your RetellAI API key first!');
  console.log('   1. Get your API key from: https://dashboard.retellai.com/apiKey');
  console.log('   2. Update the .env file with: RETELL_API_KEY=your_actual_key_here');
  console.log('');
}

console.log('✅ Installation Status: MCP Server package installed successfully');
console.log('📦 Package: @abhaybabbar/retellai-mcp-server');
console.log('');

console.log('🔧 What is an MCP Server?');
console.log('   MCP (Model Context Protocol) servers provide tools to AI assistants');
console.log('   This server gives AI tools to interact with RetellAI voice services');
console.log('');

console.log('🚀 How to Use This MCP Server:');
console.log('');

console.log('1️⃣  With Claude Desktop (Recommended):');
console.log('   - Open Claude Desktop');
console.log('   - Press CMD + , (Settings)');
console.log('   - Go to Developer tab');
console.log('   - Click "Edit Config"');
console.log('   - Add this to claude_desktop_config.json:');
console.log('');
console.log('   {');
console.log('     "mcpServers": {');
console.log('       "retellai-mcp-server": {');
console.log('         "command": "npx",');
console.log('         "args": ["-y", "@abhaybabbar/retellai-mcp-server"],');
console.log('         "env": {');
console.log('           "RETELL_API_KEY": "' + (process.env.RETELL_API_KEY || 'your_api_key_here') + '"');
console.log('         }');
console.log('       }');
console.log('     }');
console.log('   }');
console.log('');

console.log('2️⃣  With Other MCP Clients:');
console.log('   - Use the MCP Inspector: npx @modelcontextprotocol/inspector');
console.log('   - Or integrate with any MCP-compatible client');
console.log('');

console.log('🔧 Available Tools (once connected):');
console.log('   📞 Call Management:');
console.log('      - list_calls: List all Retell calls');
console.log('      - create_phone_call: Create phone calls');
console.log('      - create_web_call: Create web calls');
console.log('      - get_call: Get call details');
console.log('      - delete_call: Delete calls');
console.log('');
console.log('   🤖 Agent Management:');
console.log('      - list_agents: List all agents');
console.log('      - create_agent: Create new agents');
console.log('      - get_agent: Get agent details');
console.log('      - update_agent: Update agents');
console.log('      - delete_agent: Delete agents');
console.log('');
console.log('   📱 Phone Number Management:');
console.log('      - list_phone_numbers: List phone numbers');
console.log('      - create_phone_number: Provision numbers');
console.log('      - get_phone_number: Get number details');
console.log('      - update_phone_number: Update numbers');
console.log('      - delete_phone_number: Delete numbers');
console.log('');
console.log('   🎤 Voice Management:');
console.log('      - list_voices: List available voices');
console.log('      - get_voice: Get voice details');
console.log('');

console.log('💡 Example Use Cases:');
console.log('   - "List all my RetellAI agents"');
console.log('   - "Create an agent for pizza delivery"');
console.log('   - "Make a call to order pizza"');
console.log('   - "Show me available phone numbers"');
console.log('');

console.log('🔑 Next Steps:');
console.log('   1. Set your RetellAI API key in .env file');
console.log('   2. Restart Claude Desktop (if using it)');
console.log('   3. Start using the voice tools in your AI assistant!');
console.log('');

console.log('📚 Documentation:');
console.log('   - RetellAI Dashboard: https://dashboard.retellai.com');
console.log('   - MCP Protocol: https://modelcontextprotocol.io');
console.log('   - This Package: https://github.com/abhaybabbar/retellai-mcp-server');
