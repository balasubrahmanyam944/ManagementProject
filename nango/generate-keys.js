#!/usr/bin/env node

/**
 * Nango Key Generation Script (Node.js)
 * Generates all required keys for Nango setup
 * 
 * Usage: node generate-keys.js
 */

const crypto = require('crypto');

console.log('==========================================');
console.log('  NANGO KEY GENERATION');
console.log('==========================================');
console.log('');

// Generate Secret Key (32+ characters, 64 hex chars = 32 bytes)
console.log('1. Generating NANGO_SECRET_KEY...');
const secretKey = crypto.randomBytes(32).toString('hex');
console.log(`   NANGO_SECRET_KEY=${secretKey}`);
console.log('');

// Generate Public Key (32+ characters, 64 hex chars = 32 bytes)
console.log('2. Generating NANGO_PUBLIC_KEY...');
const publicKey = crypto.randomBytes(32).toString('hex');
console.log(`   NANGO_PUBLIC_KEY=${publicKey}`);
console.log('');

// Generate Encryption Key (must be exactly 32 characters, 32 hex chars = 16 bytes)
console.log('3. Generating NANGO_ENCRYPTION_KEY (32 chars)...');
const encryptionKey = crypto.randomBytes(16).toString('hex');
console.log(`   NANGO_ENCRYPTION_KEY=${encryptionKey}`);
console.log('');

console.log('==========================================');
console.log('  COPY THESE TO YOUR .env FILES');
console.log('==========================================');
console.log('');
console.log('# Add to nango/.env:');
console.log(`NANGO_SECRET_KEY=${secretKey}`);
console.log(`NANGO_PUBLIC_KEY=${publicKey}`);
console.log(`NANGO_ENCRYPTION_KEY=${encryptionKey}`);
console.log('NANGO_SERVER_URL=http://localhost:3003');
console.log('');
console.log('# Add to your main project .env:');
console.log(`NANGO_SECRET_KEY=${secretKey}`);
console.log('NANGO_SERVER_URL=http://localhost:3003');
console.log(`NEXT_PUBLIC_NANGO_PUBLIC_KEY=${publicKey}`);
console.log('NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003');
console.log(`NANGO_ENCRYPTION_KEY=${encryptionKey}`);
console.log('');
console.log('==========================================');

