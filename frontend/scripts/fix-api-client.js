#!/usr/bin/env node

/**
 * Post-generation script to fix API client configuration
 * This script runs after openapi-ts generation to ensure proper environment variable usage
 */

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const CLIENT_GEN_PATH = join(__dirname, '../api-client/client.gen.ts');

function fixClientGenFile() {
  try {
    let content = readFileSync(CLIENT_GEN_PATH, 'utf-8');
    
    // Replace hardcoded baseUrl with environment variable
    content = content.replace(
      /baseUrl:\s*['"`][^'"`]+['"`]/g,
      "baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8003'"
    );
    
    writeFileSync(CLIENT_GEN_PATH, content, 'utf-8');
    console.log('✅ Fixed client.gen.ts configuration');
  } catch (error) {
    console.error('❌ Error fixing client.gen.ts:', error.message);
    process.exit(1);
  }
}

function main() {
  console.log('🔧 Post-processing API client files...');
  fixClientGenFile();
  console.log('✅ API client post-processing complete');
}

main();
