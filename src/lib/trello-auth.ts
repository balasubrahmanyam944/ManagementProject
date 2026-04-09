import { cookies } from 'next/headers';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { ErrorHandler, AuthenticationError, ExternalServiceError } from './errors/error-handler';
import { logger } from './utils/logger';

const TRELLO_API_BASE = 'https://api.trello.com/1';

export const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
export const TRELLO_API_SECRET = process.env.TRELLO_API_SECRET;
export const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

import * as fs from 'fs';
import * as path from 'path';

// Temporary storage for OAuth state
// Use file-based storage to survive hot reloads in development
const TEMP_DIR = path.join(process.cwd(), 'temp-oauth');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean up old state files (older than 10 minutes)
function cleanupOldStates() {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    for (const file of files) {
      if (file.startsWith('trello_oauth_')) {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > tenMinutes) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old states:', error);
  }
}

// Helper to generate and store OAuth state with tenant information
export function storeTrelloOAuthState(oauth_token: string, tenant: string, port: string, userId: string, requestTokenSecret: string): void {
  console.log('🔄 TRELLO OAUTH STATE: Storing OAuth state...');
  console.log('🔍 TRELLO OAUTH STATE: Input parameters:', { oauth_token, tenant, port, userId });
  
  cleanupOldStates();
  
  const state = {
    tenant,
    port,
    userId,
    requestTokenSecret,
    timestamp: Date.now()
  };
  
  // Store in file (survives hot reloads)
  const filePath = path.join(TEMP_DIR, `trello_oauth_${oauth_token}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state));
  
  console.log('🔍 TRELLO OAUTH STATE: Stored state object:', state);
  console.log('🔍 TRELLO OAUTH STATE: Stored in file:', filePath);
  console.log('✅ TRELLO OAUTH STATE: State storage completed');
}

// Helper to parse OAuth state from stored oauth_token
export async function parseTrelloOAuthState(oauth_token: string): Promise<{ tenant: string; port: string; userId: string; requestTokenSecret: string }> {
  console.log('🔄 TRELLO OAUTH STATE: Parsing OAuth state...');
  console.log('🔍 TRELLO OAUTH STATE: Input oauth_token:', oauth_token);
  
  cleanupOldStates();
  
  // Read from file
  const filePath = path.join(TEMP_DIR, `trello_oauth_${oauth_token}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.error('❌ TRELLO OAUTH STATE: State file not found for oauth_token:', oauth_token);
    console.error('❌ TRELLO OAUTH STATE: Expected file:', filePath);
    throw new Error('OAuth state not found or expired');
  }
  
  const stateJson = fs.readFileSync(filePath, 'utf-8');
  const state = JSON.parse(stateJson);
  
  console.log('🔍 TRELLO OAUTH STATE: Retrieved state:', state);
  console.log('✅ TRELLO OAUTH STATE: State parsing completed');
  
  // Remove the file after retrieval (one-time use)
  fs.unlinkSync(filePath);
  console.log('🗑️ TRELLO OAUTH STATE: Deleted state file');
  
  return {
    tenant: state.tenant,
    port: state.port,
    userId: state.userId,
    requestTokenSecret: state.requestTokenSecret
  };
}

// Helper to generate the Trello OAuth request token URL
export function getTrelloOAuthRequestTokenUrl() {
  // Use explicit redirect URI from environment if available
  const explicitRedirectUri = process.env.TRELLO_OAUTH_REDIRECT_URI;
  
  if (explicitRedirectUri) {
    console.log('🔍 TRELLO OAUTH URL: Using explicit TRELLO_OAUTH_REDIRECT_URI:', explicitRedirectUri);
    return `https://trello.com/1/OAuthGetRequestToken?oauth_callback=${encodeURIComponent(explicitRedirectUri)}`;
  }
  
  // Fallback: Compute from NEXT_PUBLIC_APP_URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
  const mainAppUrl = baseUrl.replace(/:\d+.*/, ':9003');
  const redirectUri = `${mainAppUrl}/api/oauth-router/trello/callback`;
  console.log('🔍 TRELLO OAUTH URL: Original URL:', baseUrl);
  console.log('🔍 TRELLO OAUTH URL: Main app URL:', mainAppUrl);
  console.log('🔍 TRELLO OAUTH URL: Computed redirect URI:', redirectUri);
  console.log('⚠️ TRELLO OAUTH URL: Consider setting TRELLO_OAUTH_REDIRECT_URI environment variable for explicit control');
  
  return `https://trello.com/1/OAuthGetRequestToken?oauth_callback=${encodeURIComponent(redirectUri)}`;
}

// Helper to generate the Trello OAuth authorize URL
export function getTrelloOAuthAuthorizeUrl(requestToken: string) {
  return `https://trello.com/1/OAuthAuthorizeToken?oauth_token=${requestToken}&name=UPMY&scope=read,write&expiration=never`;
}

// Helper to generate the Trello OAuth access token URL
export function getTrelloOAuthAccessTokenUrl() {
  return `https://trello.com/1/OAuthGetAccessToken`;
}

// Helper to exchange OAuth verifier for access token (to be used in API route)
export async function exchangeTrelloOAuthToken(requestToken: string, verifier: string, requestTokenSecret?: string) {
  const context = 'exchangeTrelloOAuthToken';
  
  return ErrorHandler.withErrorHandling(async () => {
    // If requestTokenSecret is not provided, try to get it from cookies (for backward compatibility)
    let tokenSecret = requestTokenSecret;
    if (!tokenSecret) {
      const cookieStore = await cookies();
      tokenSecret = cookieStore.get('trello_oauth_token_secret')?.value || '';
    }

    if (!tokenSecret) {
      throw new AuthenticationError('Request token secret not found', context);
    }

    const url = getTrelloOAuthAccessTokenUrl();
    const oauth = new OAuth({
      consumer: { key: TRELLO_API_KEY || '', secret: TRELLO_API_SECRET || '' },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const request_data = {
      url,
      method: 'POST',
      data: {
        oauth_token: requestToken,
        oauth_verifier: verifier,
      },
    };

    const headers = oauth.toHeader(oauth.authorize(request_data, { key: requestToken, secret: tokenSecret }));
    const body = new URLSearchParams({ oauth_verifier: verifier });

    logger.apiRequest('POST', url, context);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.apiError('POST', url, response.status, errorText, context);
      throw new ExternalServiceError(
        `Failed to exchange Trello OAuth token: ${errorText}`,
        response.status,
        context
      );
    }

    logger.apiSuccess('POST', url, response.status, context);
    return await response.text();
  }, context);
}

export async function fetchWithTrelloAuth(url: string, options: RequestInit = {}) {
  const context = 'fetchWithTrelloAuth';
  
  const cookieStore = await cookies();
  const trelloToken = cookieStore.get('trello_access_token')?.value;

  if (!trelloToken) {
    throw new AuthenticationError('Trello access token not found', context);
  }

  // Trello uses query parameters for authentication, not Authorization header
  const urlWithAuth = new URL(url);
  urlWithAuth.searchParams.set('key', TRELLO_API_KEY || '');
  urlWithAuth.searchParams.set('token', trelloToken);

  logger.apiRequest(options.method || 'GET', urlWithAuth.toString(), context);

  return fetch(urlWithAuth.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function getTrelloBoards() {
  const context = 'getTrelloBoards';
  
  return ErrorHandler.withErrorHandling(async () => {
    logger.info('Starting to fetch Trello boards', undefined, context);
    
    const response = await fetchWithTrelloAuth(`${TRELLO_API_BASE}/members/me/boards`);
    const boards = await ErrorHandler.handleApiResponse(response, context);
    
    logger.info(`Successfully fetched ${boards.length} boards`, undefined, context);
    return boards;
  }, context);
}

export async function getTrelloCards(boardId: string) {
  const context = 'getTrelloCards';
  
  return ErrorHandler.withErrorHandling(async () => {
    logger.info(`Fetching cards for board ${boardId}`, undefined, context);
    
    const response = await fetchWithTrelloAuth(`${TRELLO_API_BASE}/boards/${boardId}/cards`);
    const cards = await ErrorHandler.handleApiResponse(response, context);
    
    logger.info(`Successfully fetched ${cards.length} cards for board ${boardId}`, undefined, context);
    return cards;
  }, context);
}

export async function getTrelloLists(boardId: string) {
  const context = 'getTrelloLists';
  
  return ErrorHandler.withErrorHandling(async () => {
    logger.info(`Fetching lists for board ${boardId}`, undefined, context);
    
    const response = await fetchWithTrelloAuth(`${TRELLO_API_BASE}/boards/${boardId}/lists`);
    const lists = await ErrorHandler.handleApiResponse(response, context);
    
    logger.info(`Successfully fetched ${lists.length} lists for board ${boardId}`, undefined, context);
    return lists;
  }, context);
} 