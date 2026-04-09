/**
 * Slack Service with Nango Integration
 * 
 * This service replaces the OAuth token management with Nango while
 * keeping the exact same interface and functionality.
 * 
 * Key changes:
 * - Automatic token management by Nango
 * - Tenant-scoped connections for multi-tenant support
 * - Same API interface - drop-in replacement
 */

import { db } from '../db/database';
import { nangoService } from './nango-service';

export interface SlackChannel {
  id: string;
  name: string;
  is_archived?: boolean;
  is_private?: boolean;
  num_members?: number;
}

export interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number }>;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    email?: string;
    image_48?: string;
  };
}

export interface SlackMentions {
  mentioned: boolean;
  username?: string;
  userId?: string;
  mentionCount?: number;
}

export interface SlackTeam {
  id: string;
  name: string;
  domain?: string;
  icon?: { image_68?: string };
}

/**
 * Slack Service using Nango for OAuth management
 */
export class SlackNangoService {
  private provider: 'slack' = 'slack';
  private apiBase = 'https://slack.com/api';

  /**
   * Get tenant ID from context
   */
  private getTenantId(): string {
    return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
  }

  /**
   * Check if user has active Slack integration
   */
  async isConnected(userId: string, tenantId?: string): Promise<boolean> {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.isConnected(this.provider, tenant, userId);
  }

  /**
   * Get valid access token - Nango handles refresh automatically!
   */
  async getAccessToken(userId: string, tenantId?: string): Promise<string> {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getAccessToken(this.provider, tenant, userId);
  }

  /**
   * Get connection metadata (team info, etc.)
   */
  async getConnectionMetadata(userId: string, tenantId?: string): Promise<Record<string, any>> {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getConnectionMetadata(this.provider, tenant, userId);
  }

  /**
   * Get connection status with details
   */
  async getConnectionStatus(userId: string, tenantId?: string) {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getConnectionStatus(this.provider, tenant, userId);
  }

  /**
   * Disconnect Slack integration
   */
  async disconnect(userId: string, tenantId?: string): Promise<void> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Slack Nango: Disconnecting for user ${userId} in tenant ${tenant}`);
    
    await nangoService.deleteConnection(this.provider, tenant, userId);
    
    // Mark Slack projects/channels as inactive in local DB (only Slack projects, not all projects)
    try {
      const projects = await db.findProjectsByUserId(userId);
      const virtualIntegrationId = `nango_${this.provider}_${tenant}_${userId}`;
      
      for (const project of projects) {
        // Only deactivate projects that belong to this Slack integration
        if (project.integrationId?.toString() === virtualIntegrationId || 
            (project as any).integrationType === 'SLACK' ||
            (project.integrationId && project.integrationId.toString().includes('slack'))) {
          await db.updateProject(project._id.toString(), { isActive: false });
          console.log(`🔄 Slack Nango: Deactivated Slack project: ${project.name}`);
        }
      }
    } catch (error) {
      console.error('Error deactivating Slack projects:', error);
    }
    
    console.log(`✅ Slack Nango: Disconnected for user ${userId}`);
  }

  /**
   * Make authenticated request to Slack API
   */
  private async makeRequest<T>(
    userId: string,
    endpoint: string,
    params?: Record<string, string>,
    tenantId?: string
  ): Promise<T> {
    const tenant = tenantId || this.getTenantId();
    const accessToken = await this.getAccessToken(userId, tenant);
    
    const url = new URL(`${this.apiBase}/${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Slack API error');
    }
    
    return data;
  }

  /**
   * Fetch all channels the user has access to
   */
  async fetchChannels(userId: string, tenantId?: string): Promise<SlackChannel[]> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔍 Slack Nango: Fetching channels for user ${userId}`);
    
    try {
      const result: SlackChannel[] = [];
      let cursor: string | undefined;
      
      do {
        const params: Record<string, string> = {
          limit: '200',
          types: 'public_channel,private_channel',
        };
        
        if (cursor) {
          params.cursor = cursor;
        }
        
        const data = await this.makeRequest<any>(
          userId,
          'conversations.list',
          params,
          tenant
        );
        
        result.push(...(data.channels || []));
        cursor = data.response_metadata?.next_cursor;
      } while (cursor);
      
      console.log(`✅ Slack Nango: Found ${result.length} channels`);
      
      return result.filter((c) => !c.is_archived);
    } catch (error) {
      console.error('❌ Slack Nango: Error fetching channels:', error);
      throw error;
    }
  }

  /**
   * Fetch and store channels as projects
   */
  async fetchAndStoreChannels(userId: string, tenantId?: string): Promise<SlackChannel[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const channels = await this.fetchChannels(userId, tenant);
      
      const virtualIntegrationId = `nango_slack_${tenant}_${userId}`;
      
      for (const channel of channels) {
        await db.upsertProject(userId, virtualIntegrationId, {
          externalId: channel.id,
          name: `#${channel.name}`,
          description: `Slack channel #${channel.name}`,
          isActive: true,
          lastSyncAt: new Date(),
          analytics: {
            totalIssues: 0,
            openIssues: 0,
            inProgressIssues: 0,
            doneIssues: 0,
            dataSource: 'cached',
            lastUpdated: new Date().toISOString(),
          },
        });
      }
      
      return channels;
    } catch (error) {
      console.error('❌ Slack Nango: Error in fetchAndStoreChannels:', error);
      throw error;
    }
  }

  /**
   * Fetch messages from a channel
   */
  async fetchMessages(
    userId: string,
    channelId: string,
    limit: number = 100,
    tenantId?: string
  ): Promise<SlackMessage[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const data = await this.makeRequest<any>(
        userId,
        'conversations.history',
        {
          channel: channelId,
          limit: String(limit),
        },
        tenant
      );
      
      return data.messages || [];
    } catch (error) {
      console.error('❌ Slack Nango: Error fetching messages:', error);
      throw error;
    }
  }

  /**
   * Get the connected Slack user's info
   */
  async getConnectedUser(userId: string, tenantId?: string): Promise<SlackUser | null> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      // Get user ID from auth.test
      const authData = await this.makeRequest<any>(
        userId,
        'auth.test',
        undefined,
        tenant
      );
      
      if (!authData.user_id) {
        return null;
      }
      
      // Get full user info
      const userData = await this.makeRequest<any>(
        userId,
        'users.info',
        { user: authData.user_id },
        tenant
      );
      
      return {
        id: userData.user.id,
        name: userData.user.name,
        real_name: userData.user.real_name,
        profile: userData.user.profile,
      };
    } catch (error) {
      console.error('❌ Slack Nango: Error fetching connected user:', error);
      return null;
    }
  }

  /**
   * Get team/workspace info
   */
  async getTeamInfo(userId: string, tenantId?: string): Promise<SlackTeam | null> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const data = await this.makeRequest<any>(
        userId,
        'team.info',
        undefined,
        tenant
      );
      
      return data.team;
    } catch (error) {
      console.error('❌ Slack Nango: Error fetching team info:', error);
      return null;
    }
  }

  /**
   * Check if user is mentioned in a channel
   */
  async checkUserMentions(
    userId: string,
    channelId: string,
    slackUserId: string,
    limit: number = 100,
    slackUser?: SlackUser | null,
    tenantId?: string
  ): Promise<SlackMentions> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      console.log(`🔍 Slack Nango: Checking mentions for ${slackUserId} in ${channelId}`);
      
      const messages = await this.fetchMessages(userId, channelId, limit, tenant);
      
      // Pattern for <@userId> format
      const mentionPattern = new RegExp(`<@${slackUserId}>`, 'gi');
      
      // Also check username mentions
      const username = slackUser?.name;
      const displayName = slackUser?.profile?.display_name;
      
      let mentionCount = 0;
      
      for (const msg of messages) {
        if (msg.text) {
          // Check <@userId> pattern
          const userIdMatches = msg.text.match(mentionPattern);
          if (userIdMatches) {
            mentionCount += userIdMatches.length;
          }
          
          // Check @username mentions
          if (username) {
            const usernamePattern = new RegExp(`@${username}\\b`, 'gi');
            const usernameMatches = msg.text.match(usernamePattern);
            if (usernameMatches) {
              mentionCount += usernameMatches.length;
            }
          }
          
          // Check display name mentions
          if (displayName && displayName !== username) {
            const displayPattern = new RegExp(
              `@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
              'gi'
            );
            const displayMatches = msg.text.match(displayPattern);
            if (displayMatches) {
              mentionCount += displayMatches.length;
            }
          }
        }
      }
      
      console.log(`✅ Slack Nango: Found ${mentionCount} mentions in ${channelId}`);
      
      if (mentionCount > 0) {
        return {
          mentioned: true,
          username: displayName || slackUser?.real_name || username,
          userId: slackUserId,
          mentionCount,
        };
      }
      
      return { mentioned: false };
    } catch (error) {
      console.error('❌ Slack Nango: Error checking mentions:', error);
      return { mentioned: false };
    }
  }

  /**
   * Fetch channels with mention info
   */
  async fetchChannelsWithMentions(
    userId: string,
    tenantId?: string
  ): Promise<Array<SlackChannel & { mentions: SlackMentions }>> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const channels = await this.fetchChannels(userId, tenant);
      const connectedUser = await this.getConnectedUser(userId, tenant);
      
      if (!connectedUser) {
        console.warn('Slack Nango: Could not get connected user, returning channels without mentions');
        return channels.map((ch) => ({
          ...ch,
          mentions: { mentioned: false },
        }));
      }
      
      // Check mentions for each channel in parallel
      const channelsWithMentions = await Promise.all(
        channels.map(async (ch) => {
          try {
            const mentions = await this.checkUserMentions(
              userId,
              ch.id,
              connectedUser.id,
              100,
              connectedUser,
              tenant
            );
            return { ...ch, mentions };
          } catch {
            return { ...ch, mentions: { mentioned: false } };
          }
        })
      );
      
      return channelsWithMentions;
    } catch (error) {
      console.error('❌ Slack Nango: Error in fetchChannelsWithMentions:', error);
      throw error;
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(
    userId: string,
    channelId: string,
    text: string,
    tenantId?: string
  ): Promise<SlackMessage> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      
      const response = await fetch(`${this.apiBase}/chat.postMessage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          text,
        }),
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      
      console.log(`✅ Slack Nango: Sent message to ${channelId}`);
      
      return data.message;
    } catch (error) {
      console.error('❌ Slack Nango: Error sending message:', error);
      throw error;
    }
  }

  /**
   * Post to webhook (for incoming webhooks)
   */
  async postToWebhook(webhookUrl: string, message: {
    text?: string;
    blocks?: any[];
    attachments?: any[];
  }): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      
      return response.ok;
    } catch (error) {
      console.error('❌ Slack Nango: Error posting to webhook:', error);
      return false;
    }
  }

  /**
   * Get channel info
   */
  async getChannelInfo(
    userId: string,
    channelId: string,
    tenantId?: string
  ): Promise<SlackChannel | null> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const data = await this.makeRequest<any>(
        userId,
        'conversations.info',
        { channel: channelId },
        tenant
      );
      
      return data.channel;
    } catch (error) {
      console.error('❌ Slack Nango: Error fetching channel info:', error);
      return null;
    }
  }

  /**
   * List users in workspace
   */
  async listUsers(userId: string, tenantId?: string): Promise<SlackUser[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const result: SlackUser[] = [];
      let cursor: string | undefined;
      
      do {
        const params: Record<string, string> = { limit: '200' };
        if (cursor) params.cursor = cursor;
        
        const data = await this.makeRequest<any>(
          userId,
          'users.list',
          params,
          tenant
        );
        
        result.push(...(data.members || []));
        cursor = data.response_metadata?.next_cursor;
      } while (cursor);
      
      return result;
    } catch (error) {
      console.error('❌ Slack Nango: Error listing users:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const slackNangoService = new SlackNangoService();

