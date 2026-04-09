/**
 * Jira Service with Nango Integration
 * 
 * This service replaces the OAuth token management with Nango while
 * keeping the exact same interface and functionality as the original JiraService.
 * 
 * Key changes:
 * - Token storage/refresh handled by Nango (automatic!)
 * - Tenant-scoped connections for multi-tenant support
 * - Same API interface - drop-in replacement
 */

import { db } from '../db/database';
import type { Integration } from '../db/database';
import { nangoService, NangoError } from './nango-service';

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  avatarUrl?: string;
  description?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    projectName: string;
    projectKey: string;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: { name: string; statusCategory?: { key: string } };
  issuetype: { name: string; iconUrl?: string };
  assignee?: { displayName: string; avatarUrls?: Record<string, string> };
  priority?: { name: string; iconUrl?: string };
  created: string;
  updated: string;
  duedate?: string;
  description?: string;
}

export interface JiraTransition {
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
}

/**
 * Jira Service using Nango for OAuth management
 */
export class JiraNangoService {
  private provider: 'jira' = 'jira';

  /**
   * Get tenant ID from context
   * Override this method if you have a different way to get tenant ID
   */
  private getTenantId(): string {
    // Default to 'default' if no tenant context
    // In your app, this should come from session/context
    return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
  }

  /**
   * Check if user has active Jira integration via Nango
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
   * Get Jira cloud ID from connection metadata
   */
  async getCloudId(userId: string, tenantId?: string): Promise<string> {
    const tenant = tenantId || this.getTenantId();
    const metadata = await nangoService.getConnectionMetadata(this.provider, tenant, userId);
    
    const cloudId = metadata.cloudId || metadata.cloud_id;
    if (!cloudId) {
      throw new Error('No cloud ID found in Jira connection metadata');
    }
    
    return cloudId;
  }

  /**
   * Get connection status with details
   */
  async getConnectionStatus(userId: string, tenantId?: string) {
    const tenant = tenantId || this.getTenantId();
    return await nangoService.getConnectionStatus(this.provider, tenant, userId);
  }

  /**
   * Disconnect Jira integration
   */
  async disconnect(userId: string, tenantId?: string): Promise<void> {
    const tenant = tenantId || this.getTenantId();
    
    console.log(`🔄 Jira Nango: Disconnecting for user ${userId} in tenant ${tenant}`);
    
    await nangoService.deleteConnection(this.provider, tenant, userId);
    
    // Also mark Jira projects as inactive in local DB (only Jira projects, not all projects)
    try {
      const projects = await db.findProjectsByUserId(userId);
      const virtualIntegrationId = `nango_${this.provider}_${tenant}_${userId}`;
      
      for (const project of projects) {
        // Only deactivate projects that belong to this Jira integration
        if (project.integrationId?.toString() === virtualIntegrationId || 
            (project as any).integrationType === 'JIRA' ||
            (project.integrationId && project.integrationId.toString().startsWith('nango_jira_'))) {
          await db.updateProject(project._id.toString(), { isActive: false });
          console.log(`🔄 Jira Nango: Deactivated Jira project: ${project.name}`);
        }
      }
    } catch (error) {
      console.error('Error deactivating Jira projects:', error);
    }
    
    console.log(`✅ Jira Nango: Disconnected for user ${userId}`);
  }

  /**
   * Fetch projects from Jira API
   */
  async fetchProjects(userId: string, tenantId?: string): Promise<JiraProject[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`;
      
      console.log(`🔍 Jira Nango: Fetching projects from ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'UPMY-Integration/1.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jira Nango: API error:', response.status, errorText);
        
        // Check for auth errors
        if (response.status === 401 || response.status === 403) {
          throw new Error('Jira authentication failed. Please reconnect.');
        }
        
        throw new Error(`Jira API error: ${response.status}`);
      }

      const projects = await response.json();
      console.log(`✅ Jira Nango: Found ${projects.length} projects`);
      
      return projects.map((project: any) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        projectTypeKey: project.projectTypeKey,
        avatarUrl: project.avatarUrls?.['48x48'],
        description: project.description,
      }));
    } catch (error) {
      console.error('❌ Jira Nango: Error fetching projects:', error);
      throw error;
    }
  }

  /**
   * Fetch and store projects with analytics
   */
  async fetchAndStoreProjects(userId: string, tenantId?: string): Promise<JiraProject[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const projects = await this.fetchProjects(userId, tenant);
      
      console.log(`🔍 Jira Nango: Processing ${projects.length} projects for analytics`);
      
      // Store projects in database with analytics
      for (const project of projects) {
        let analytics = {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          doneIssues: 0,
          statusCounts: {} as Record<string, number>,
          typeCounts: {} as Record<string, number>,
          dataSource: 'live' as const,
          lastUpdated: new Date().toISOString()
        };

        try {
          const issues = await this.fetchProjectIssues(userId, project.key, tenant);
          
          if (issues.length > 0) {
            const statusCounts: Record<string, number> = {};
            const typeCounts: Record<string, number> = {};
            let openCount = 0, inProgressCount = 0, doneCount = 0;

            for (const issue of issues) {
              const status = issue.status?.name || 'Unknown';
              const type = issue.issuetype?.name || 'Unknown';
              
              statusCounts[status] = (statusCounts[status] || 0) + 1;
              typeCounts[type] = (typeCounts[type] || 0) + 1;

              const statusLower = status.toLowerCase();
              if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed')) {
                doneCount++;
              } else if (statusLower.includes('progress') || statusLower.includes('doing') || statusLower.includes('review')) {
                inProgressCount++;
              } else {
                openCount++;
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
            };
          }
        } catch (issueError) {
          console.error(`⚠️ Jira Nango: Failed to fetch issues for ${project.key}:`, issueError);
        }

        // Store in local database
        // Note: We use a virtual integration ID since Nango handles the actual connection
        const virtualIntegrationId = `nango_jira_${tenant}_${userId}`;
        
        await db.upsertProject(userId, virtualIntegrationId, {
          externalId: project.key,
          name: project.name,
          key: project.key,
          description: project.description,
          avatarUrl: project.avatarUrl,
          isActive: true,
          lastSyncAt: new Date(),
          analytics
        });
        
        console.log(`✅ Jira Nango: Stored project ${project.key} with ${analytics.totalIssues} issues`);
      }

      return projects;
    } catch (error) {
      console.error('❌ Jira Nango: Error in fetchAndStoreProjects:', error);
      throw error;
    }
  }

  /**
   * Fetch issues for a project
   */
  async fetchProjectIssues(
    userId: string, 
    projectKey: string, 
    tenantId?: string,
    maxResults: number = 100
  ): Promise<JiraIssue[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`;
      const jql = `project = ${projectKey} ORDER BY updated DESC`;
      
      console.log(`🔍 Jira Nango: Fetching issues for ${projectKey}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'UPMY-Integration/1.0',
        },
        body: JSON.stringify({
          jql,
          maxResults,
          fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated', 'duedate', 'description']
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      return (data.issues || []).map((issue: any) => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields?.summary || 'No summary',
        status: issue.fields?.status || { name: 'Unknown' },
        issuetype: issue.fields?.issuetype || { name: 'Unknown' },
        assignee: issue.fields?.assignee,
        priority: issue.fields?.priority,
        created: issue.fields?.created,
        updated: issue.fields?.updated,
        duedate: issue.fields?.duedate,
        description: issue.fields?.description
      }));
    } catch (error) {
      console.error(`❌ Jira Nango: Error fetching issues for ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Get available transitions for an issue
   */
  async getIssueTransitions(
    userId: string, 
    issueKey: string, 
    tenantId?: string
  ): Promise<JiraTransition[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
      
      console.log(`🔍 Jira Nango: Fetching transitions for ${issueKey}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch transitions: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Jira Nango: Found ${data.transitions?.length || 0} transitions`);
      
      return data.transitions || [];
    } catch (error) {
      console.error(`❌ Jira Nango: Error fetching transitions:`, error);
      throw error;
    }
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(
    userId: string, 
    issueKey: string, 
    transitionId: string, 
    tenantId?: string
  ): Promise<boolean> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`;
      
      console.log(`🔄 Jira Nango: Transitioning ${issueKey} to transition ${transitionId}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transition: { id: transitionId }
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to transition issue: ${response.status} - ${errorText}`);
      }
      
      console.log(`✅ Jira Nango: Successfully transitioned ${issueKey}`);
      return true;
    } catch (error) {
      console.error(`❌ Jira Nango: Error transitioning issue:`, error);
      throw error;
    }
  }

  /**
   * Create an issue in Jira
   */
  async createIssue(
    userId: string,
    projectKey: string,
    issueData: {
      summary: string;
      description?: string;
      issuetype: { name: string };
      priority?: { name: string };
      assignee?: { accountId: string };
      labels?: string[];
    },
    tenantId?: string
  ): Promise<{ id: string; key: string }> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`;
      
      console.log(`🔄 Jira Nango: Creating issue in ${projectKey}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            ...issueData
          }
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create issue: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Jira Nango: Created issue ${result.key}`);
      
      return { id: result.id, key: result.key };
    } catch (error) {
      console.error(`❌ Jira Nango: Error creating issue:`, error);
      throw error;
    }
  }

  /**
   * Update an issue in Jira
   */
  async updateIssue(
    userId: string,
    issueKey: string,
    updateData: {
      summary?: string;
      description?: string;
      priority?: { name: string };
      assignee?: { accountId: string };
      labels?: string[];
    },
    tenantId?: string
  ): Promise<boolean> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`;
      
      console.log(`🔄 Jira Nango: Updating issue ${issueKey}`);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: updateData
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update issue: ${response.status} - ${errorText}`);
      }
      
      console.log(`✅ Jira Nango: Updated issue ${issueKey}`);
      return true;
    } catch (error) {
      console.error(`❌ Jira Nango: Error updating issue:`, error);
      throw error;
    }
  }

  /**
   * Get project statuses
   */
  async getProjectStatuses(
    userId: string, 
    projectKey: string, 
    tenantId?: string
  ): Promise<{ id: string; name: string; statusCategory: any }[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${projectKey}/statuses`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch statuses: ${response.status} - ${errorText}`);
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
      
      return allStatuses;
    } catch (error) {
      console.error(`❌ Jira Nango: Error fetching project statuses:`, error);
      throw error;
    }
  }

  /**
   * Check CREATE_ISSUES permission for a project
   */
  async checkProjectCreateIssuePermission(
    userId: string, 
    projectKey: string, 
    tenantId?: string
  ): Promise<boolean> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=CREATE_ISSUES`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.permissions?.CREATE_ISSUES?.havePermission === true;
    } catch (error) {
      console.error(`❌ Jira Nango: Error checking permissions:`, error);
      return false;
    }
  }

  /**
   * Fetch boards for a project
   */
  async fetchBoards(userId: string, projectKey: string, tenantId?: string): Promise<JiraBoard[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      // Note: Agile API uses a different base URL
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board?projectKeyOrId=${projectKey}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return (data.values || []).map((board: any) => ({
        id: board.id,
        name: board.name,
        type: board.type,
        location: board.location,
      }));
    } catch (error) {
      console.error(`❌ Jira Nango: Error fetching boards:`, error);
      throw error;
    }
  }

  /**
   * Fetch sprints for a board
   */
  async fetchSprints(userId: string, boardId: number, tenantId?: string): Promise<JiraSprint[]> {
    const tenant = tenantId || this.getTenantId();
    
    try {
      const accessToken = await this.getAccessToken(userId, tenant);
      const cloudId = await this.getCloudId(userId, tenant);
      
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board/${boardId}/sprint`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return (data.values || []).map((sprint: any) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal,
      }));
    } catch (error) {
      console.error(`❌ Jira Nango: Error fetching sprints:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const jiraNangoService = new JiraNangoService();

