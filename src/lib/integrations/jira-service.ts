import { db } from '../db/database'
import type { Integration } from '../db/database'
import { refreshJiraAccessToken } from '../jira-oauth';
import { nangoService } from './nango-service';

export interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  description?: string
}

export interface JiraBoard {
  id: number
  name: string
  type: string
  location?: {
    projectId: number
    projectName: string
    projectKey: string
  }
}

export interface JiraSprint {
  id: number
  name: string
  state: string
  startDate?: string
  endDate?: string
  goal?: string
}

export class JiraService {
  /**
   * Get access token - from Nango if Nango-managed, otherwise from DB
   */
  private async getAccessToken(userId: string, integration: Integration): Promise<string> {
    // Check if this is a Nango-managed integration
    if (integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 
                       process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                       'default';
      console.log('🔑 JiraService: Getting access token from Nango');
      return await nangoService.getAccessToken('jira', tenantId, userId);
    }
    
    // Otherwise use the token from DB
    if (!integration.accessToken) {
      throw new Error('No access token available');
    }
    return integration.accessToken;
  }

  /**
   * Get cloud ID - from Nango metadata or DB integration metadata
   */
  private async getCloudId(userId: string, integration: Integration): Promise<string> {
    // Check if this is a Nango-managed integration
    if (integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 
                       process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                       'default';
      console.log('🔑 JiraService: Getting cloud ID from Nango');
      const metadata = await nangoService.getConnectionMetadata('jira', tenantId, userId);
      return metadata.cloudId || metadata.cloud_id;
    }
    
    // Otherwise use the cloudId from DB metadata
    return integration.metadata?.cloudId;
  }

  /**
   * Store Jira integration data for a user
   */
  async storeIntegration(userId: string, integrationData: {
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
    serverUrl: string
    consumerKey?: string
    metadata?: any
  }) {
    try {
      const integration = await db.upsertIntegration(userId, 'JIRA', {
        status: 'CONNECTED',
        accessToken: integrationData.accessToken,
        refreshToken: integrationData.refreshToken,
        expiresAt: integrationData.expiresAt,
        serverUrl: integrationData.serverUrl,
        consumerKey: integrationData.consumerKey,
        metadata: integrationData.metadata,
        lastSyncAt: new Date(),
      })

      return integration
    } catch (error) {
      console.error('Error storing Jira integration:', error)
      throw new Error('Failed to store Jira integration')
    }
  }

  /**
   * Get Jira integration for a user
   */
  async getIntegration(userId: string): Promise<Integration | null> {
    try {
      const integrations = await db.findIntegrationsByUserId(userId)
      return integrations.find(integration => integration.type === 'JIRA') || null
    } catch (error) {
      console.error('Error getting Jira integration:', error)
      return null
    }
  }

  /**
   * Remove Jira integration for a user
   */
  async removeIntegration(userId: string) {
    try {
      if (!userId) {
        console.log('Jira: No userId provided for removeIntegration')
        return
      }
      
      console.log('Jira: Removing integration for user:', userId)
      
      // Update integration status to disconnected
      await db.upsertIntegration(userId, 'JIRA', {
        status: 'DISCONNECTED',
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
        lastSyncAt: new Date(),
      })

      // Remove associated Jira projects only (not all projects)
      const projects = await db.findProjectsByUserId(userId)
      const jiraIntegration = await db.findIntegrationsByUserId(userId);
      const jiraIntegrationIds = new Set(
        jiraIntegration
          .filter(i => i.type === 'JIRA')
          .map(i => i._id.toString())
      );
      
      for (const project of projects) {
        // Only deactivate projects that belong to Jira integration
        if (project.integrationId && 
            (jiraIntegrationIds.has(project.integrationId.toString()) ||
             (project as any).integrationType === 'JIRA' ||
             project.integrationId.toString().startsWith('nango_jira_'))) {
          await db.updateProject(project._id.toString(), { isActive: false })
          console.log(`🔄 Jira Service: Deactivated Jira project: ${project.name}`);
        }
      }
      
      console.log('Jira: Successfully removed integration for user:', userId)
    } catch (error) {
      console.error('Error removing Jira integration:', error)
      // Don't throw an error for disconnect operations - just log it
      // This prevents the UI from showing error messages for normal disconnect operations
    }
  }

  /**
   * Fetch and store Jira projects for a user with analytics
   */
  async fetchAndStoreProjects(userId: string): Promise<JiraProject[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Jira integration not connected')
      }

      // Fetch projects from Jira API
      const projects = await this.fetchProjectsFromJira(integration)
      console.log(`🔍 JiraService: Fetched ${projects.length} projects, now calculating analytics...`)
      
      // Store projects in database with analytics
      for (const project of projects) {
        console.log(`🔍 JiraService: Processing project ${project.key}...`)
        
        // Fetch issues for analytics calculation
        let analytics = {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          doneIssues: 0,
          statusCounts: {} as Record<string, number>,
          typeCounts: {} as Record<string, number>,
          dataSource: 'live' as const,
          lastUpdated: new Date().toISOString()
        }

        try {
          // Fetch issues to calculate analytics
          const issues = await this.fetchProjectIssues(integration, project.key)
          console.log(`🔍 JiraService: Fetched ${issues.length} issues for project ${project.key}`)
          
          if (issues.length > 0) {
            // Calculate analytics from issues
            const statusCounts: Record<string, number> = {}
            const typeCounts: Record<string, number> = {}
            let openCount = 0, inProgressCount = 0, doneCount = 0

            for (const issue of issues) {
              const status = issue.fields?.status?.name || 'Unknown'
              const type = issue.fields?.issuetype?.name || 'Unknown'
              
              statusCounts[status] = (statusCounts[status] || 0) + 1
              typeCounts[type] = (typeCounts[type] || 0) + 1

              const statusLower = status.toLowerCase()
              if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed')) {
                doneCount++
              } else if (statusLower.includes('progress') || statusLower.includes('doing') || statusLower.includes('review')) {
                inProgressCount++
              } else {
                openCount++
              }
            }

            analytics = {
              totalIssues: issues.length,
              openIssues: openCount,
              inProgressIssues: inProgressCount,
              doneIssues: doneCount,
              statusCounts,
              typeCounts,
              dataSource: 'live' as const,
              lastUpdated: new Date().toISOString()
            }
          }
        } catch (issueError) {
          console.error(`⚠️ JiraService: Failed to fetch issues for project ${project.key}:`, issueError)
          // Continue with empty analytics rather than failing the entire process
        }

        // Store project with analytics
        await db.upsertProject(userId, integration._id.toString(), {
          externalId: project.key,
          name: project.name,
          key: project.key,
          description: project.description,
          avatarUrl: project.avatarUrl,
          isActive: true,
          lastSyncAt: new Date(),
          analytics,
          integrationType: 'JIRA',  // Store type directly for reliable filtering
        })
        
        console.log(`✅ JiraService: Stored project ${project.key} with ${analytics.totalIssues} issues`)
      }

      console.log(`✅ JiraService: Successfully processed all ${projects.length} projects with analytics`)
      return projects
    } catch (error) {
      console.error('Error fetching and storing Jira projects:', error)
      try {
        const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
        // If we hit an auth-style error, proactively disconnect so UI reflects reality
        if (
          message.includes('401') ||
          message.includes('403') ||
          message.includes('unauthorized') ||
          message.includes('forbidden') ||
          message.includes('invalid token') ||
          message.includes('expired')
        ) {
          console.log('JiraService: Authentication failure detected while fetching projects. Marking integration as DISCONNECTED.')
          await this.removeIntegration(userId)
          throw new Error('Jira session expired. Please reconnect Jira.')
        }
      } catch { /* ignore secondary failures */ }
      throw new Error('Failed to fetch Jira projects')
    }
  }

  /**
   * Fetch issues for a specific project (helper method)
   */
  private async fetchProjectIssues(integration: Integration, projectKey: string): Promise<any[]> {
    // Get cloudId - from Nango if Nango-managed, otherwise from DB metadata
    let cloudId = integration.metadata?.cloudId;
    
    if (!cloudId && integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 
                       process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                       'default';
      const nangoMetadata = await nangoService.getConnectionMetadata('jira', tenantId, integration.userId.toString());
      cloudId = nangoMetadata.cloudId || nangoMetadata.cloud_id;
    }
    
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata')
    }

    const accessToken = await this.getValidAccessToken(integration)
    const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`
    const jql = `project = ${projectKey} ORDER BY updated DESC`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'UPMY-Integration/1.0',
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 100,
        fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated']
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Jira API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.issues || []
  }

  async getValidAccessToken(integration: Integration): Promise<string> {
    // Check if this is a Nango-managed integration
    if (integration.metadata?.nangoManaged) {
      const tenantId = integration.metadata.tenantId || 
                       process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                       'default';
      console.log('🔑 JiraService: Getting access token from Nango');
      return await nangoService.getAccessToken('jira', tenantId, integration.userId.toString());
    }
    
    // If token is not expired, return it
    if (integration.expiresAt && integration.expiresAt > new Date()) {
      return integration.accessToken!;
    }
    // If expired and refreshToken exists, refresh it
    if (integration.refreshToken) {
      const tokenData = await refreshJiraAccessToken(integration.refreshToken);
      // Update DB with new token and expiry (don't spread entire integration to avoid createdAt conflict)
      await db.upsertIntegration(integration.userId.toString(), 'JIRA', {
        status: integration.status,
        accessToken: tokenData.access_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        refreshToken: tokenData.refresh_token || integration.refreshToken,
        serverUrl: integration.serverUrl,
        consumerKey: integration.consumerKey,
        metadata: integration.metadata,
        lastSyncAt: integration.lastSyncAt,
      });
      return tokenData.access_token;
    }
    throw new Error('No valid Jira access token and no refresh token available');
  }

  // Update fetchProjectsFromJira to use getValidAccessToken
  private async fetchProjectsFromJira(integration: Integration): Promise<JiraProject[]> {
    try {
      console.log('🔍 JiraService: Fetching projects from:', integration.serverUrl);
      console.log('🔍 JiraService: Using access token:', integration.accessToken ? 'present' : 'Nango-managed');
      console.log('🔍 JiraService: Integration metadata:', integration.metadata);
      
      // Get cloudId - from Nango if Nango-managed, otherwise from DB metadata
      let cloudId = integration.metadata?.cloudId;
      
      if (!cloudId && integration.metadata?.nangoManaged) {
        // Try to get cloudId from Nango connection metadata
        const tenantId = integration.metadata.tenantId || 
                         process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 
                         'default';
        const nangoMetadata = await nangoService.getConnectionMetadata('jira', tenantId, integration.userId.toString());
        cloudId = nangoMetadata.cloudId || nangoMetadata.cloud_id;
      }
      
      if (!cloudId) {
        throw new Error('No cloud ID found in integration metadata');
      }
      const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`;
      console.log('🔍 JiraService: API URL:', apiUrl);
      const accessToken = await this.getValidAccessToken(integration);
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'UPMY-Integration/1.0',
        },
      })
      console.log('🔍 JiraService: Response status:', response.status);
      console.log('🔍 JiraService: Response headers:', Object.fromEntries(response.headers.entries()));
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ JiraService: API error response:', errorText);
        throw new Error(`Jira API error: ${response.status} - ${errorText}`);
      }
      const projects = await response.json();
      console.log('🔍 JiraService: Found projects:', projects.length);
      return projects.map((project: any) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        projectTypeKey: project.projectTypeKey,
        avatarUrl: project.avatarUrls?.['48x48'],
        description: project.description,
      }))
    } catch (error) {
      console.error('Error fetching projects from Jira:', error)
      throw new Error('Failed to fetch projects from Jira')
    }
  }

  /**
   * Fetch boards for a specific project
   */
  async fetchBoards(userId: string, projectKey: string): Promise<JiraBoard[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Jira integration not connected')
      }

      const accessToken = await this.getValidAccessToken(integration)
      const response = await fetch(
        `${integration.serverUrl}/rest/agile/1.0/board?projectKeyOrId=${projectKey}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`)
      }

      const data = await response.json()
      return data.values.map((board: any) => ({
        id: board.id,
        name: board.name,
        type: board.type,
        location: board.location,
      }))
    } catch (error) {
      console.error('Error fetching Jira boards:', error)
      throw new Error('Failed to fetch Jira boards')
    }
  }

  /**
   * Fetch sprints for a specific board
   */
  async fetchSprints(userId: string, boardId: number): Promise<JiraSprint[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('Jira integration not connected')
      }

      const accessToken = await this.getValidAccessToken(integration)
      const response = await fetch(
        `${integration.serverUrl}/rest/agile/1.0/board/${boardId}/sprint`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`)
      }

      const data = await response.json()
      return data.values.map((sprint: any) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal,
      }))
    } catch (error) {
      console.error('Error fetching Jira sprints:', error)
      throw new Error('Failed to fetch Jira sprints')
    }
  }

  /**
   * Check if user has active Jira integration
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return false
      }

      // Check if token is valid or can be refreshed
      try {
        await this.getValidAccessToken(integration)
        return true
      } catch (tokenError) {
        console.error('Jira token validation failed:', tokenError)
        
        // Only disconnect if it's a clear authentication error, not network issues
        if (tokenError instanceof Error) {
          const errorMessage = tokenError.message.toLowerCase()
          if (errorMessage.includes('unauthorized') || 
              errorMessage.includes('forbidden') || 
              errorMessage.includes('invalid token') ||
              errorMessage.includes('expired')) {
            console.log('Jira: Clear authentication failure, disconnecting integration')
            await this.removeIntegration(userId)
            return false
          }
        }
        
        // For other errors (network, API issues), keep the integration connected
        console.log('Jira: Non-authentication error, keeping integration connected')
        return true
      }
    } catch (error) {
      console.error('Error checking Jira connection:', error)
      return false
    }
  }

  async checkProjectCreateIssuePermission(userId: string, projectKey: string): Promise<boolean> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=CREATE_ISSUES`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to check Jira permissions:', response.status, errorText);
      throw new Error('Failed to check Jira permissions');
    }
    const data = await response.json();
    return data.permissions?.CREATE_ISSUES?.havePermission === true;
  }

  /**
   * Disconnect Jira integration for a user
   */
  async disconnectIntegration(userId: string) {
    try {
      console.log('🔄 JIRA SERVICE: Disconnecting integration for user:', userId);
      
      // Remove the integration from the database
      await db.removeIntegration(userId, 'JIRA');
      
      console.log('✅ JIRA SERVICE: Integration disconnected successfully');
      return true;
    } catch (error) {
      console.error('❌ JIRA SERVICE: Failed to disconnect integration:', error);
      throw new Error('Failed to disconnect Jira integration');
    }
  }

  /**
   * Get available transitions for an issue
   * Returns the list of statuses the issue can be moved to
   */
  async getIssueTransitions(userId: string, issueKey: string): Promise<{
    id: string;
    name: string;
    to: {
      id: string;
      name: string;
      statusCategory: {
        id: number;
        name: string;
        colorName: string;
      };
    };
  }[]> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
    
    console.log('🔍 JIRA SERVICE: Fetching transitions for issue:', issueKey);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to fetch transitions:', response.status, errorText);
      throw new Error(`Failed to fetch transitions: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ JIRA SERVICE: Found', data.transitions?.length || 0, 'transitions for issue:', issueKey);
    
    return data.transitions || [];
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(userId: string, issueKey: string, transitionId: string): Promise<boolean> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
    
    console.log('🔄 JIRA SERVICE: Transitioning issue:', issueKey, 'to transition:', transitionId);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transition: {
          id: transitionId
        }
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to transition issue:', response.status, errorText);
      throw new Error(`Failed to transition issue: ${response.status} - ${errorText}`);
    }
    
    console.log('✅ JIRA SERVICE: Successfully transitioned issue:', issueKey);
    return true;
  }

  /**
   * Update issue fields (assignee, priority, duedate)
   */
  async updateIssueFields(
    userId: string,
    issueKey: string,
    fields: {
      assigneeAccountId?: string | null;
      priorityId?: string;
      duedate?: string | null;
    }
  ): Promise<boolean> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) throw new Error('No cloud ID found in integration metadata');
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`;
    const body: { assignee?: { accountId: string } | null; priority?: { id: string }; duedate?: string | null } = {};
    if (fields.assigneeAccountId !== undefined) {
      body.assignee = fields.assigneeAccountId ? { accountId: fields.assigneeAccountId } : null;
    }
    if (fields.priorityId !== undefined) body.priority = { id: fields.priorityId };
    if (fields.duedate !== undefined) body.duedate = fields.duedate || null;
    if (Object.keys(body).length === 0) return true;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: body }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to update issue fields:', response.status, errorText);
      throw new Error(`Failed to update issue: ${response.status} - ${errorText}`);
    }
    return true;
  }

  /**
   * Get users assignable to a project
   */
  async getAssignableUsers(
    userId: string,
    projectKey: string
  ): Promise<Array<{ accountId: string; displayName: string; avatarUrls?: { '48x48': string } }>> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) throw new Error('No cloud ID found in integration metadata');
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((u: any) => ({
      accountId: u.accountId,
      displayName: u.displayName || u.name || 'Unknown',
      avatarUrls: u.avatarUrls ? { '48x48': u.avatarUrls['48x48'] || '' } : undefined,
    }));
  }

  /**
   * Get all Jira priorities
   */
  async getPriorities(userId: string): Promise<Array<{ id: string; name: string; iconUrl?: string }>> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) throw new Error('No cloud ID found in integration metadata');
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/priority`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((p: any) => ({
      id: p.id,
      name: p.name,
      iconUrl: p.iconUrl,
    }));
  }

  /**
   * Create a new issue in Jira
   */
  async createIssue(
    userId: string, 
    projectKey: string, 
    summary: string, 
    description: string = '',
    issueType: string = 'Task'
  ): Promise<{ id: string; key: string; self: string }> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`;
    
    console.log('🆕 JIRA SERVICE: Creating issue in project:', projectKey, 'Type:', issueType);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: {
            key: projectKey
          },
          summary: summary,
          description: description ? {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: description
                  }
                ]
              }
            ]
          } : undefined,
          issuetype: {
            name: issueType
          }
        }
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to create issue:', response.status, errorText);
      throw new Error(`Failed to create issue: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ JIRA SERVICE: Successfully created issue:', data.key);
    return data;
  }

  /**
   * Create a new issue in Jira with automatic sprint assignment
   * This matches the behavior of the testcases feature
   */
  async createIssueWithSprint(
    userId: string, 
    projectKey: string, 
    summary: string, 
    description: string = '',
    issueType: string = 'Story'
  ): Promise<{ id: string; key: string; self: string }> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    
    const accessToken = await this.getValidAccessToken(integration);
    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`;
    
    console.log('🆕 JIRA SERVICE: Creating issue with sprint in project:', projectKey, 'Type:', issueType);
    
    // First, try to find an active sprint for this project
    let sprintId: number | null = null;
    try {
      // Get boards for this project
      const boardsResponse = await fetch(
        `${baseUrl}/rest/agile/1.0/board?projectKeyOrId=${projectKey}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (boardsResponse.ok) {
        const boardsData = await boardsResponse.json();
        const boards = boardsData.values || [];
        
        if (boards.length > 0) {
          const boardId = boards[0].id;
          console.log(`📋 JIRA SERVICE: Found board ${boardId} for project ${projectKey}`);
          
          // Get active sprint from this board
          const sprintsResponse = await fetch(
            `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          );
          
          if (sprintsResponse.ok) {
            const sprintsData = await sprintsResponse.json();
            const sprints = sprintsData.values || [];
            
            if (sprints.length > 0) {
              sprintId = sprints[0].id;
              console.log(`🏃 JIRA SERVICE: Found active sprint: ${sprints[0].name} (ID: ${sprintId})`);
            } else {
              // Try to get any future sprint
              const futureSprintsResponse = await fetch(
                `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=future`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                  },
                }
              );
              
              if (futureSprintsResponse.ok) {
                const futureSprintsData = await futureSprintsResponse.json();
                const futureSprints = futureSprintsData.values || [];
                
                if (futureSprints.length > 0) {
                  sprintId = futureSprints[0].id;
                  console.log(`🏃 JIRA SERVICE: Found future sprint: ${futureSprints[0].name} (ID: ${sprintId})`);
                }
              }
            }
          }
        }
      }
    } catch (sprintError) {
      console.warn('⚠️ JIRA SERVICE: Could not find sprint for project:', sprintError);
    }
    
    // Build the issue data
    const issueData: any = {
      fields: {
        project: {
          key: projectKey
        },
        summary: summary,
        description: description ? {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description
                }
              ]
            }
          ]
        } : undefined,
        issuetype: {
          name: issueType
        }
      }
    };
    
    // Add sprint assignment if we found one
    if (sprintId) {
      // customfield_10020 is the common sprint field
      issueData.fields['customfield_10020'] = sprintId;
      console.log(`🎯 JIRA SERVICE: Assigning to sprint ${sprintId}`);
    }
    
    // Create the issue
    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issueData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to create issue:', response.status, errorText);
      
      // If sprint assignment failed, retry without it
      if (errorText.includes('customfield_10020') || errorText.includes('sprint')) {
        console.log('🔄 JIRA SERVICE: Retrying without sprint assignment...');
        delete issueData.fields['customfield_10020'];
        
        const retryResponse = await fetch(`${baseUrl}/rest/api/3/issue`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(issueData),
        });
        
        if (!retryResponse.ok) {
          const retryErrorText = await retryResponse.text();
          throw new Error(`Failed to create issue: ${retryResponse.status} - ${retryErrorText}`);
        }
        
        const retryData = await retryResponse.json();
        console.log('✅ JIRA SERVICE: Created issue without sprint:', retryData.key);
        return retryData;
      }
      
      throw new Error(`Failed to create issue: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ JIRA SERVICE: Successfully created issue:', data.key, sprintId ? `(Sprint: ${sprintId})` : '(No sprint)');
    return data;
  }

  /**
   * Get all statuses for a project
   */
  async getProjectStatuses(userId: string, projectKey: string): Promise<{
    id: string;
    name: string;
    statusCategory: {
      id: number;
      name: string;
      colorName: string;
    };
  }[]> {
    const integration = await this.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new Error('Jira integration not connected');
    }
    
    const cloudId = integration.metadata?.cloudId;
    if (!cloudId) {
      throw new Error('No cloud ID found in integration metadata');
    }
    
    const accessToken = await this.getValidAccessToken(integration);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${projectKey}/statuses`;
    
    console.log('🔍 JIRA SERVICE: Fetching statuses for project:', projectKey);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ JIRA SERVICE: Failed to fetch project statuses:', response.status, errorText);
      throw new Error(`Failed to fetch project statuses: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Flatten statuses from all issue types
    const allStatuses: any[] = [];
    const seenStatuses = new Set<string>();
    
    for (const issueType of data) {
      for (const status of issueType.statuses || []) {
        if (!seenStatuses.has(status.id)) {
          seenStatuses.add(status.id);
          allStatuses.push(status);
        }
      }
    }
    
    console.log('✅ JIRA SERVICE: Found', allStatuses.length, 'unique statuses for project:', projectKey);
    return allStatuses;
  }
}

export const jiraService = new JiraService() 