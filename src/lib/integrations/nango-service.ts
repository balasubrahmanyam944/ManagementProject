/**
 * Nango Integration Service
 * 
 * Centralized service for managing OAuth connections through Nango.
 * Provides tenant-scoped connection management for multi-tenant architecture.
 * 
 * Key features:
 * - Automatic token refresh (handled by Nango)
 * - Tenant-scoped connection IDs
 * - Unified API for all integrations (Jira, Trello, Slack, TestRail)
 * 
 * NOTE: This uses direct HTTP calls instead of the @nangohq/node SDK
 * because of API path mismatch between SDK v0.69.x (/connections/) 
 * and older self-hosted Nango servers (/connection/)
 */

import http from 'http';
import https from 'https';

// Supported integration providers
export type NangoProvider = 'jira' | 'trello' | 'slack' | 'testrail';

// Connection status
export interface NangoConnectionStatus {
  connected: boolean;
  provider: NangoProvider;
  connectionId: string;
  lastRefreshed?: Date;
  metadata?: Record<string, any>;
}

// Nango connection response type
export interface NangoConnection {
  id: number;
  created_at: string;
  updated_at: string;
  provider_config_key: string;
  connection_id: string;
  credentials: {
    type: 'OAUTH2' | 'OAUTH1' | 'API_KEY' | 'BASIC';
    access_token: string;
    refresh_token?: string;
    expires_at?: string;
    raw?: Record<string, any>;
  };
  connection_config?: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: Record<string, string>;
}

// Nango error type
export class NangoError extends Error {
  constructor(
    message: string,
    public provider: NangoProvider,
    public connectionId: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'NangoError';
  }
}

/**
 * Nango Service - Singleton instance for managing OAuth connections
 * 
 * Uses direct HTTP calls instead of @nangohq/node SDK due to API path mismatch
 * between SDK v0.69.x (/connections/) and self-hosted Nango server (/connection/)
 */
class NangoService {
  private serverUrl: string = '';
  private secretKey: string = '';
  private initialized = false;

  /**
   * Initialize Nango client configuration
   */
  private initialize(): void {
    if (this.initialized) {
      return;
    }

    const secretKey = process.env.NANGO_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('NANGO_SECRET_KEY environment variable is not set');
    }

    this.secretKey = secretKey;

    // Server-side Nango server URL
    // Priority: 1) NANGO_SERVER_URL env var, 2) NEXT_PUBLIC_NANGO_SERVER_URL (ngrok), 3) Auto-detect
    let serverUrl = process.env.NANGO_SERVER_URL;
    
    // If NANGO_SERVER_URL is not set or points to an unreachable IP, try ngrok URL
    if (!serverUrl || (serverUrl.includes('172.16.34.39') && process.env.NEXT_PUBLIC_NANGO_SERVER_URL)) {
      // Check if we're in Docker and direct IP might not be accessible
      const isDocker = process.env.DATABASE_URL?.includes('mongo:') || 
                      process.env.DATABASE_URL?.includes('mongodb://mongo');
      
      if (isDocker && process.env.NEXT_PUBLIC_NANGO_SERVER_URL) {
        // In Docker, use ngrok URL if available (more reliable for networking)
        serverUrl = process.env.NEXT_PUBLIC_NANGO_SERVER_URL;
        console.log('🔧 Nango: Running in Docker, using ngrok URL for server-side:', serverUrl);
      } else if (!serverUrl) {
        // Not in Docker and no URL set, try to detect
        if (isDocker) {
          const hostIp = process.env.NEXT_PUBLIC_HOST_IP || 
                        process.env.HOST_IP ||
                        '172.16.34.39';
          serverUrl = `http://${hostIp}:3003`;
          console.log('🔧 Nango: Running in Docker, using:', serverUrl);
        } else {
          serverUrl = 'http://localhost:3003';
          console.log('🔧 Nango: Running on host, using:', serverUrl);
        }
      }
    }
    
    // If serverUrl still contains ngrok, that's fine - it works for both frontend and server-side
    if (serverUrl && serverUrl.includes('ngrok')) {
      console.log('✅ Nango: Using ngrok URL for server-side API calls:', serverUrl);
    }
    
    this.serverUrl = serverUrl;
    this.initialized = true;
    console.log('✅ Nango service initialized (direct HTTP)', `server: ${serverUrl}`);
  }

  /**
   * Make HTTP request to Nango server
   * Uses /connection/ (singular) endpoint for compatibility with self-hosted Nango
   */
  private async httpRequest<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    this.initialize();
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      
      console.log(`🔗 Nango HTTP: ${method} ${path}`);
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Check if response is HTML (error/fallback)
          if (data.includes('<!doctype html>') || data.includes('<html')) {
            console.error('❌ Nango: Received HTML instead of JSON. Path might not exist:', path);
            reject(new Error(`Nango returned HTML instead of JSON for ${path}`));
            return;
          }
          
          try {
            const json = JSON.parse(data);
            
            // Check for error response
            if (res.statusCode && res.statusCode >= 400) {
              console.error(`❌ Nango HTTP Error [${res.statusCode}]:`, json);
              reject(new Error(json.error || json.message || `HTTP ${res.statusCode}`));
              return;
            }
            
            resolve(json as T);
          } catch (e) {
            console.error('❌ Nango: Failed to parse JSON response:', data.substring(0, 200));
            reject(new Error('Invalid JSON response from Nango'));
          }
        });
      });
      
      req.on('error', (err) => {
        console.error('❌ Nango HTTP Error:', err.message);
        reject(err);
      });
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * Get connection using direct HTTP call
   * Uses /connection/{connectionId} (singular) for self-hosted Nango compatibility
   */
  private async getConnectionDirect(
    provider: NangoProvider,
    connectionId: string,
    tenantId?: string,
    userId?: string
  ): Promise<NangoConnection> {
    // 1) Try deterministic connection id first for backward compatibility.
    try {
      const path = `/connection/${connectionId}?provider_config_key=${provider}`;
      return await this.httpRequest<NangoConnection>('GET', path);
    } catch (directError) {
      // 2) With connectSessionToken flow, connection ids are often generated by Nango.
      //    Fallback by scanning connections and matching tags set during createConnectSession.
      if (!tenantId || !userId) {
        throw directError;
      }

      const { connections } = await this.listConnectionsDirect();
      const tagged = connections.find((conn) => {
        if (conn.provider_config_key !== provider) {
          return false;
        }
        const tags = conn.tags || {};
        return tags.end_user_id === userId && tags.organization_id === tenantId;
      });

      if (!tagged?.connection_id) {
        throw directError;
      }

      const fallbackPath = `/connection/${tagged.connection_id}?provider_config_key=${provider}`;
      return this.httpRequest<NangoConnection>('GET', fallbackPath);
    }
  }

  /**
   * Delete connection using direct HTTP call
   */
  private async deleteConnectionDirect(
    provider: NangoProvider,
    connectionId: string,
    tenantId?: string,
    userId?: string
  ): Promise<void> {
    try {
      const path = `/connection/${connectionId}?provider_config_key=${provider}`;
      await this.httpRequest<any>('DELETE', path);
    } catch (directError) {
      // With connectSessionToken flow, connection_id can be generated by Nango.
      // Fallback to tag-based lookup and delete the actual connection id.
      if (!tenantId || !userId) {
        throw directError;
      }

      const { connections } = await this.listConnectionsDirect();
      const tagged = connections.find((conn) => {
        if (conn.provider_config_key !== provider) {
          return false;
        }
        const tags = conn.tags || {};
        return tags.end_user_id === userId && tags.organization_id === tenantId;
      });

      if (!tagged?.connection_id) {
        throw directError;
      }

      const fallbackPath = `/connection/${tagged.connection_id}?provider_config_key=${provider}`;
      await this.httpRequest<any>('DELETE', fallbackPath);
    }
  }

  /**
   * List all connections using direct HTTP call
   */
  private async listConnectionsDirect(): Promise<{ connections: NangoConnection[] }> {
    return this.httpRequest<{ connections: NangoConnection[] }>('GET', '/connection');
  }

  /**
   * Generate tenant-scoped connection ID
   * Format: {tenantId}_{userId}
   * 
   * This ensures:
   * - Same user can have different connections per tenant
   * - Complete isolation between tenants
   * - User in tenant A can connect to personal Jira
   * - Same user in tenant B can connect to work Jira
   */
  getConnectionId(tenantId: string, userId: string): string {
    // Sanitize inputs to ensure valid connection ID
    const sanitizedTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    
    return `${sanitizedTenant}_${sanitizedUser}`;
  }

  /**
   * Parse connection ID back to tenant and user
   */
  parseConnectionId(connectionId: string): { tenantId: string; userId: string } {
    const parts = connectionId.split('_');
    if (parts.length < 2) {
      throw new Error(`Invalid connection ID format: ${connectionId}`);
    }
    
    // Handle case where userId might contain underscores
    const tenantId = parts[0];
    const userId = parts.slice(1).join('_');
    
    return { tenantId, userId };
  }

  /**
   * Check if a user has an active connection for a provider
   * Verifies both that the connection exists AND has valid credentials
   */
  async isConnected(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const connectionId = this.getConnectionId(tenantId, userId);
      console.log(`🔍 Nango: Checking connection for ${provider} (${connectionId})`);
      
      // Use direct HTTP call instead of SDK
      const connection = await this.getConnectionDirect(provider, connectionId, tenantId, userId);
      
      console.log(`🔍 Nango: Connection retrieved for ${provider}:`, {
        hasConnection: !!connection,
        connectionId: connection?.connection_id,
        hasCredentials: !!connection?.credentials,
        credentialsType: connection?.credentials?.type,
        hasAccessToken: !!connection?.credentials?.access_token,
      });
      
      // Verify connection exists
      if (!connection) {
        console.log(`⚠️ Nango: No connection found for ${provider} (${connectionId})`);
        return false;
      }
      
      // Verify connection has credentials
      if (!connection.credentials) {
        console.log(`⚠️ Nango: Connection exists but has no credentials for ${provider} (${connectionId})`);
        return false;
      }
      
      // Check if access token exists (handle different credential types)
      const accessToken = connection.credentials.access_token || 
                         connection.credentials.raw?.access_token ||
                         connection.credentials.raw?.oauth_token || // For OAuth1 like Trello
                         (connection.credentials as any).oauth_token; // Direct OAuth1 token
      
      if (!accessToken) {
        console.log(`⚠️ Nango: Connection exists but has no access token for ${provider} (${connectionId})`);
        return false;
      }
      
      console.log(`✅ Nango: Connection verified for ${provider} (${connectionId})`);
      return true;
    } catch (error) {
      // Connection not found or error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Nango: Connection check failed for ${provider}:`, errorMessage);
      return false;
    }
  }

  /**
   * Get connection details including credentials
   * Nango automatically refreshes tokens if needed!
   */
  async getConnection(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<NangoConnection> {
    const connectionId = this.getConnectionId(tenantId, userId);
    
    try {
      console.log(`🔍 Nango: Getting connection for ${provider} (${connectionId})`);
      
      // Use direct HTTP call instead of SDK
      const connection = await this.getConnectionDirect(provider, connectionId, tenantId, userId);
      
      console.log(`✅ Nango: Connection retrieved for ${provider} (${connectionId})`);
      
      // Enhanced logging for OAuth1 (Trello) vs OAuth2
      const credentials = connection?.credentials;
      const hasOAuth2Token = !!credentials?.access_token;
      const hasOAuth1Token = !!credentials?.raw?.oauth_token;
      const rawKeys = credentials?.raw ? Object.keys(credentials.raw) : [];
      
      console.log(`🔍 Nango: Connection details:`, {
        connectionId: connection?.connection_id,
        hasCredentials: !!credentials,
        credentialsType: credentials?.type,
        hasAccessToken: hasOAuth2Token,
        hasOAuth1Token: hasOAuth1Token,
        rawKeys: rawKeys,
        // For OAuth1, show if we have both token and secret
        hasOAuth1Secret: !!credentials?.raw?.oauth_token_secret,
      });
      
      return connection;
    } catch (error) {
      console.error(`❌ Nango: Failed to get connection for ${provider} (${connectionId}):`, error);
      throw new NangoError(
        `Failed to get ${provider} connection`,
        provider,
        connectionId,
        error
      );
    }
  }

  /**
   * Get a valid access token for a provider
   * This is the main method to use - Nango handles token refresh automatically!
   * Handles both OAuth2 (access_token) and OAuth1 (oauth_token) formats
   */
  async getAccessToken(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<string> {
    const connection = await this.getConnection(provider, tenantId, userId);
    
    // Try different token locations (OAuth2 vs OAuth1)
    // For OAuth2: access_token is at the top level or in raw.access_token
    // For OAuth1 (Trello): oauth_token is in raw.oauth_token
    const accessToken = connection.credentials?.access_token || 
                       connection.credentials?.raw?.access_token ||
                       connection.credentials?.raw?.oauth_token || // For OAuth1 like Trello
                       (connection.credentials as any)?.oauth_token; // Direct OAuth1 token
    
    if (!accessToken) {
      // Enhanced error logging
      const credentials = connection.credentials;
      console.error(`❌ Nango: No access token found for ${provider}. Credentials structure:`, {
        hasCredentials: !!credentials,
        credentialsType: credentials?.type,
        hasAccessToken: !!credentials?.access_token,
        hasRaw: !!credentials?.raw,
        rawKeys: credentials?.raw ? Object.keys(credentials.raw) : [],
        // Log the actual structure (but limit size)
        credentialsPreview: credentials ? JSON.stringify(credentials, null, 2).substring(0, 500) : 'null',
      });
      
      throw new NangoError(
        `No access token found for ${provider}. Connection may need to be re-authenticated.`,
        provider,
        this.getConnectionId(tenantId, userId)
      );
    }
    
    console.log(`✅ Nango: Access token retrieved for ${provider} (type: ${connection.credentials?.type || 'unknown'})`);
    return accessToken;
  }

  /**
   * For Slack: retrieve the authed_user token (xoxp-...) which has user-level
   * scopes like channels:history.  Falls back to the bot token if unavailable.
   */
  async getSlackUserToken(
    tenantId: string,
    userId: string
  ): Promise<string> {
    const connection = await this.getConnection('slack', tenantId, userId);
    const raw = connection.credentials?.raw;
    const userToken = raw?.authed_user?.access_token;
    if (userToken) {
      console.log(`✅ Nango: Slack user token (xoxp) retrieved`);
      return userToken;
    }
    console.log(`⚠️ Nango: No Slack user token found, falling back to bot token`);
    return this.getAccessToken('slack', tenantId, userId);
  }

  /**
   * Get connection metadata (e.g., Jira cloudId, Slack teamId)
   */
  async getConnectionMetadata(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<Record<string, any>> {
    const connection = await this.getConnection(provider, tenantId, userId);
    
    return {
      ...connection.connection_config,
      ...connection.metadata,
      // Include raw OAuth response data
      ...(connection.credentials?.raw || {})
    };
  }

  /**
   * Get connection status with details
   */
  async getConnectionStatus(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<NangoConnectionStatus> {
    const connectionId = this.getConnectionId(tenantId, userId);
    
    try {
      const connection = await this.getConnection(provider, tenantId, userId);
      
      return {
        connected: true,
        provider,
        connectionId,
        lastRefreshed: connection.updated_at ? new Date(connection.updated_at) : undefined,
        metadata: {
          ...connection.connection_config,
          ...connection.metadata
        }
      };
    } catch {
      return {
        connected: false,
        provider,
        connectionId
      };
    }
  }

  /**
   * Delete/disconnect a connection
   */
  async deleteConnection(
    provider: NangoProvider,
    tenantId: string,
    userId: string
  ): Promise<void> {
    const connectionId = this.getConnectionId(tenantId, userId);
    
    try {
      console.log(`🔄 Nango: Deleting connection for ${provider} (${connectionId})`);
      
      // Use direct HTTP call instead of SDK
      await this.deleteConnectionDirect(provider, connectionId, tenantId, userId);
      
      console.log(`✅ Nango: Connection deleted for ${provider} (${connectionId})`);
    } catch (error) {
      console.error(`❌ Nango: Failed to delete connection for ${provider} (${connectionId}):`, error);
      // Don't throw - disconnection might already be done
    }
  }

  /**
   * Set metadata for a connection
   * Note: Uses direct HTTP call for self-hosted Nango compatibility
   */
  async setConnectionMetadata(
    provider: NangoProvider,
    tenantId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const connectionId = this.getConnectionId(tenantId, userId);
    
    try {
      // Use direct HTTP call
      const path = `/connection/${connectionId}/metadata?provider_config_key=${provider}`;
      await this.httpRequest<any>('POST', path, metadata);
      console.log(`✅ Nango: Metadata set for ${provider} (${connectionId})`);
    } catch (error) {
      console.error(`❌ Nango: Failed to set metadata for ${provider} (${connectionId}):`, error);
      throw new NangoError(
        `Failed to set metadata for ${provider}`,
        provider,
        connectionId,
        error
      );
    }
  }

  /**
   * List all connections for a provider (admin use)
   */
  async listConnections(provider?: NangoProvider): Promise<NangoConnection[]> {
    try {
      // Use direct HTTP call instead of SDK
      const result = await this.listConnectionsDirect();
      
      if (provider) {
        return result.connections.filter(
          (conn) => conn.provider_config_key === provider
        );
      }
      
      return result.connections;
    } catch (error) {
      console.error('❌ Nango: Failed to list connections:', error);
      return [];
    }
  }

  /**
   * Get all connections for a specific tenant
   */
  async getConnectionsForTenant(
    tenantId: string,
    provider?: NangoProvider
  ): Promise<NangoConnection[]> {
    const allConnections = await this.listConnections(provider);
    
    return allConnections.filter((conn) => 
      conn.connection_id.startsWith(`${tenantId}_`)
    );
  }

  /**
   * Get all connections for a specific user across all tenants
   */
  async getConnectionsForUser(
    userId: string,
    provider?: NangoProvider
  ): Promise<NangoConnection[]> {
    const allConnections = await this.listConnections(provider);
    
    return allConnections.filter((conn) => 
      conn.connection_id.endsWith(`_${userId}`)
    );
  }

  /**
   * Use Nango's proxy to make authenticated API calls
   * This automatically adds the correct authorization headers
   * 
   * Note: For self-hosted Nango, proxy functionality may be limited.
   * Consider using getAccessToken() and making direct API calls instead.
   */
  async proxy<T = any>(
    provider: NangoProvider,
    tenantId: string,
    userId: string,
    config: {
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      endpoint: string;
      data?: any;
      headers?: Record<string, string>;
      params?: Record<string, string>;
      baseUrlOverride?: string;
    }
  ): Promise<T> {
    const connectionId = this.getConnectionId(tenantId, userId);
    
    try {
      // Resolve the actual Nango connection id first (UUID/session-token flow)
      // and fall back to deterministic id for legacy flows.
      let resolvedConnectionId = connectionId;
      try {
        const resolvedConnection = await this.getConnectionDirect(provider, connectionId, tenantId, userId);
        if (resolvedConnection?.connection_id) {
          resolvedConnectionId = resolvedConnection.connection_id;
        }
      } catch (resolveError) {
        console.warn(`⚠️ Nango proxy: Could not resolve real connection id, using fallback ${connectionId}:`, resolveError);
      }

      // Build query string from params
      const queryParams = new URLSearchParams();
      queryParams.set('provider_config_key', provider);
      queryParams.set('connection_id', resolvedConnectionId);
      if (config.params) {
        Object.entries(config.params).forEach(([k, v]) => queryParams.set(k, v));
      }
      
      // Use Nango proxy endpoint
      const path = `/proxy${config.endpoint}?${queryParams.toString()}`;
      
      const response = await this.httpRequest<T>(config.method, path, config.data);
      return response;
    } catch (error) {
      console.error(`❌ Nango proxy error for ${provider}:`, error);
      throw new NangoError(
        `Proxy request failed for ${provider}`,
        provider,
        connectionId,
        error
      );
    }
  }

  /**
   * Integration unique key as configured in Nango (often same as provider id, e.g. "trello").
   */
  getIntegrationUniqueKey(provider: NangoProvider): string {
    const fromEnv =
      process.env[`NANGO_INTEGRATION_ID_${provider.toUpperCase()}`] ||
      process.env[`NANGO_${provider.toUpperCase()}_INTEGRATION_ID`];
    return fromEnv || provider;
  }

  /**
   * Nango Cloud: GET /integrations/{uniqueKey}?include=credentials — returns OAuth app client_id (Trello API key).
   * Self-hosted fallback: GET /config/{provider}
   */
  async getProviderConfig(provider: NangoProvider): Promise<Record<string, any>> {
    const uniqueKey = this.getIntegrationUniqueKey(provider);
    const paths = [
      `/integrations/${encodeURIComponent(uniqueKey)}?include=credentials`,
      `/integrations/${encodeURIComponent(uniqueKey)}?include[]=credentials`,
      `/config/${provider}`,
    ];
    for (const path of paths) {
      try {
        const json = await this.httpRequest<any>('GET', path);
        if (json && (json.data || json.credentials || json.oauth_client_id)) {
          return json;
        }
      } catch {
        // try next path
      }
    }
    console.warn(`⚠️ Nango: Failed to fetch integration config for ${provider} (${uniqueKey})`);
    return {};
  }

  /**
   * Get the OAuth connection URL for frontend
   * Note: For self-hosted Nango with proxy callback, the frontend SDK handles this
   */
  getAuthUrl(
    provider: NangoProvider,
    tenantId: string,
    userId: string,
    options?: {
      redirectUrl?: string;
    }
  ): string {
    const connectionId = this.getConnectionId(tenantId, userId);
    throw new Error(
      `getAuthUrl is deprecated for ${provider}/${connectionId}. Use connectSessionToken via /api/nango/connect-session.`
    );
  }
}

// Export singleton instance
export const nangoService = new NangoService();

// Export types
export type { NangoService };

