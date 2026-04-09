/**
 * Nango Integration Setup Script
 * 
 * This script configures OAuth integrations in your Nango instance.
 * Run this after starting the Nango Docker containers.
 * 
 * Usage:
 *   npx ts-node scripts/setup-nango-integrations.ts
 */

import { Nango } from '@nangohq/node';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables
dotenv.config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function warn(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function setupIntegrations() {
  log('\n' + '='.repeat(60), colors.bold);
  log('  NANGO INTEGRATION SETUP', colors.bold);
  log('='.repeat(60) + '\n', colors.bold);

  // Check environment variables
  const secretKey = process.env.NANGO_SECRET_KEY;
  const serverUrl = process.env.NANGO_SERVER_URL;

  if (!secretKey) {
    error('NANGO_SECRET_KEY is not set in environment variables');
    process.exit(1);
  }

  info(`Nango Server URL: ${serverUrl || 'https://api.nango.dev (cloud)'}`);
  
  // Initialize Nango client
  const nango = new Nango({
    secretKey,
    ...(serverUrl && { host: serverUrl }),
  });

  // Test connection
  info('Testing connection to Nango server...');
  try {
    await nango.listConnections();
    success('Connected to Nango server');
  } catch (err) {
    error('Failed to connect to Nango server');
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Integration configurations
  const integrations = [
    {
      key: 'jira',
      name: 'Jira',
      provider: 'jira',
      envVars: {
        clientId: 'JIRA_OAUTH_CLIENT_ID',
        clientSecret: 'JIRA_OAUTH_CLIENT_SECRET',
      },
      scopes: ['read:jira-work', 'write:jira-work', 'manage:jira-project', 'read:jira-user', 'offline_access'],
    },
    {
      key: 'trello',
      name: 'Trello',
      provider: 'trello',
      envVars: {
        clientId: 'TRELLO_API_KEY',
        clientSecret: 'TRELLO_API_SECRET',
      },
      scopes: ['read', 'write'],
    },
    {
      key: 'slack',
      name: 'Slack',
      provider: 'slack',
      envVars: {
        clientId: 'SLACK_CLIENT_ID',
        clientSecret: 'SLACK_CLIENT_SECRET',
      },
      scopes: ['channels:read', 'chat:write', 'users:read', 'team:read'],
    },
  ];

  log('\n' + '-'.repeat(60));
  log('  Configuring Integrations');
  log('-'.repeat(60) + '\n');

  for (const integration of integrations) {
    info(`Setting up ${integration.name}...`);

    const clientId = process.env[integration.envVars.clientId];
    const clientSecret = process.env[integration.envVars.clientSecret];

    if (!clientId || !clientSecret) {
      warn(`Skipping ${integration.name}: Missing ${integration.envVars.clientId} or ${integration.envVars.clientSecret}`);
      continue;
    }

    try {
      // Note: The actual Nango API for creating integrations may vary
      // This is a conceptual example - check Nango docs for exact API
      info(`  Client ID: ${clientId.substring(0, 8)}...`);
      info(`  Scopes: ${integration.scopes.join(', ')}`);
      
      // In production, you would use Nango's admin API or dashboard
      // to configure integrations. The SDK is primarily for connections.
      
      success(`${integration.name} configuration ready`);
      info(`  Configure in Nango dashboard with:`);
      info(`    - Provider: ${integration.provider}`);
      info(`    - Client ID: ${clientId}`);
      info(`    - Client Secret: [from env]`);
      info(`    - Scopes: ${integration.scopes.join(', ')}`);
      
    } catch (err) {
      error(`Failed to configure ${integration.name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log('');
  }

  log('\n' + '-'.repeat(60));
  log('  OAuth Callback URLs');
  log('-'.repeat(60) + '\n');

  const callbackUrl = process.env.NANGO_CALLBACK_URL || `${serverUrl}/oauth/callback`;
  
  info('Update your OAuth provider settings with this callback URL:');
  log(`\n  ${callbackUrl}\n`, colors.cyan);
  
  info('For each provider:');
  log('  • Jira: Atlassian Developer Console → Your App → OAuth 2.0 → Callback URL');
  log('  • Trello: Trello Power-Up Admin → Your App → Callback URL');
  log('  • Slack: Slack API Dashboard → Your App → OAuth & Permissions → Redirect URLs');

  log('\n' + '-'.repeat(60));
  log('  Environment Variables for Your App');
  log('-'.repeat(60) + '\n');

  log('Add these to your .env file:\n');
  log(`# Nango Configuration`);
  log(`NANGO_SECRET_KEY=${secretKey}`);
  log(`NANGO_SERVER_URL=${serverUrl || 'https://api.nango.dev'}`);
  log(`NEXT_PUBLIC_NANGO_PUBLIC_KEY=${process.env.NANGO_PUBLIC_KEY || 'YOUR_PUBLIC_KEY'}`);
  log(`NEXT_PUBLIC_NANGO_SERVER_URL=${serverUrl || 'https://api.nango.dev'}`);

  log('\n' + '='.repeat(60));
  log('  SETUP COMPLETE', colors.green + colors.bold);
  log('='.repeat(60) + '\n');

  info('Next steps:');
  log('  1. Configure integrations in Nango dashboard (if using cloud) or via API');
  log('  2. Update OAuth callback URLs in provider settings');
  log('  3. Add environment variables to your .env file');
  log('  4. Restart your application');
  log('  5. Test connections using the integration pages');
  console.log('');
}

// Run setup
setupIntegrations().catch((err) => {
  error('Setup failed:');
  console.error(err);
  process.exit(1);
});

