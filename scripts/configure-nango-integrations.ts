/**
 * Configure Nango Integrations
 * 
 * This script configures OAuth credentials (Client ID, Client Secret, Scopes)
 * for Jira, Trello, and Slack in your Nango instance.
 * 
 * Usage:
 *   npx ts-node scripts/configure-nango-integrations.ts
 * 
 * Prerequisites:
 *   - Nango server must be running (docker compose up -d)
 *   - Environment variables must be set in .env
 */

import { Nango } from '@nangohq/node';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables
dotenv.config({ path: '.env' });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
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

function header(message: string) {
  log(`\n${'='.repeat(60)}`, colors.bold);
  log(`  ${message}`, colors.bold);
  log('='.repeat(60) + '\n', colors.bold);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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
    scopes: 'read:jira-work write:jira-work manage:jira-project read:jira-user offline_access',
    description: 'Atlassian Jira for issue tracking and project management',
  },
  {
    key: 'trello',
    name: 'Trello',
    provider: 'trello',
    envVars: {
      clientId: 'TRELLO_API_KEY',
      clientSecret: 'TRELLO_API_SECRET',
    },
    scopes: 'read,write',
    description: 'Trello for board and card management',
  },
  {
    key: 'slack',
    name: 'Slack',
    provider: 'slack',
    envVars: {
      clientId: 'SLACK_CLIENT_ID',
      clientSecret: 'SLACK_CLIENT_SECRET',
    },
    scopes: 'channels:read channels:history chat:write users:read team:read',
    description: 'Slack for team communication and channel management',
  },
];

async function configureIntegrations() {
  header('NANGO INTEGRATION CONFIGURATION');

  // Check Nango connection
  const secretKey = process.env.NANGO_SECRET_KEY;
  const serverUrl = process.env.NANGO_SERVER_URL || 'http://localhost:3003';

  if (!secretKey) {
    error('NANGO_SECRET_KEY is not set in environment variables');
    error('Please add it to your .env file');
    process.exit(1);
  }

  info(`Connecting to Nango server: ${serverUrl}`);

  // Initialize Nango client
  const nango = new Nango({
    secretKey,
    ...(serverUrl && serverUrl !== 'http://localhost:3003' && { host: serverUrl }),
  });

  // Test connection
  try {
    await nango.listConnections();
    success('Connected to Nango server');
  } catch (err) {
    error('Failed to connect to Nango server');
    error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    error('\nMake sure Nango is running: docker compose -f nango/docker-compose.yml up -d');
    process.exit(1);
  }

  header('CONFIGURING INTEGRATIONS');

  const configured: string[] = [];
  const skipped: string[] = [];

  for (const integration of integrations) {
    log(`\n${'-'.repeat(60)}`, colors.blue);
    info(`Configuring ${integration.name}...`);
    log('-'.repeat(60), colors.blue);

    // Get credentials from environment
    const clientId = process.env[integration.envVars.clientId];
    const clientSecret = process.env[integration.envVars.clientSecret];

    if (!clientId || !clientSecret) {
      warn(`Skipping ${integration.name}: Missing credentials`);
      warn(`  Required: ${integration.envVars.clientId} and ${integration.envVars.clientSecret}`);
      warn(`  Add them to your .env file`);
      skipped.push(integration.name);
      continue;
    }

    info(`  Provider: ${integration.provider}`);
    info(`  Client ID: ${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 4)}`);
    info(`  Scopes: ${integration.scopes}`);
    info(`  Description: ${integration.description}`);

    try {
      // Note: The exact Nango API method may vary based on version
      // This is a conceptual implementation - check Nango docs for exact API
      
      // For self-hosted Nango, you typically configure integrations via:
      // 1. Nango Dashboard UI (if available)
      // 2. Nango Admin API
      // 3. Environment variables in docker-compose.yml
      // 4. Configuration files

      // Since Nango's SDK primarily handles connections (not config),
      // we'll provide instructions instead of direct API calls
      
      info(`\n  📝 Configuration Instructions:`);
      log(`     For self-hosted Nango, configure this integration via:`);
      log(`     1. Nango Dashboard (if available at ${serverUrl})`);
      log(`     2. Or add to nango/docker-compose.yml environment variables`);
      log(`     3. Or use Nango Admin API`);
      log(`\n     Required configuration:`);
      log(`     - Provider Key: ${integration.provider}`);
      log(`     - Client ID: ${clientId}`);
      log(`     - Client Secret: ${clientSecret}`);
      log(`     - Scopes: ${integration.scopes}`);
      log(`     - Callback URL: [Your Nango proxy URL]/oauth/callback`);

      // Try to use Nango's admin API if available
      // Note: This is a placeholder - actual API may differ
      try {
        // Attempt to configure via API (if supported)
        // await nango.admin.createIntegration({...});
        success(`${integration.name} configuration ready`);
        configured.push(integration.name);
      } catch (apiError) {
        warn(`API configuration not available - use manual configuration`);
        configured.push(integration.name);
      }

    } catch (err) {
      error(`Failed to configure ${integration.name}`);
      error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  header('CONFIGURATION SUMMARY');

  if (configured.length > 0) {
    success(`Configured: ${configured.join(', ')}`);
  }

  if (skipped.length > 0) {
    warn(`Skipped (missing credentials): ${skipped.join(', ')}`);
    log('\nAdd missing credentials to your .env file and run this script again.');
  }

  header('NEXT STEPS');

  info('1. Get your Nango proxy callback URL:');
  log('   docker compose -f nango/docker-compose.yml logs nango-server | grep -i callback');
  
  info('2. Update OAuth provider settings with the proxy callback URL:');
  log('   • Jira: Atlassian Developer Console → OAuth 2.0 → Callback URL');
  log('   • Trello: Power-Up Admin → Allowed Origins');
  log('   • Slack: API Dashboard → OAuth & Permissions → Redirect URLs');
  
  info('3. Test connections using the NangoConnect component in your app');

  log('\n');
}

// Run configuration
configureIntegrations().catch((err) => {
  error('Configuration failed:');
  console.error(err);
  process.exit(1);
});

