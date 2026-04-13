import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import { jiraService } from '@/lib/integrations/jira-service'
import { trelloService } from '@/lib/integrations/trello-service'
import { testrailService } from '@/lib/integrations/testrail-service'
import { slackService } from '@/lib/integrations/slack-service'

// Helper to compute status/type counts from issues
function computeStatusTypeCounts(issues: any[]): { statusCounts: Record<string, number>, typeCounts: Record<string, number> } {
  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      // Handle both Jira issues and Trello cards
      let status = 'Unknown';
      let type = 'Unknown';
      
      // Check if this is a Trello card (has list property)
      if (issue.list && issue.list.name) {
        status = issue.list.name;
        // For Trello, use labels as type, or default to "Card"
        type = issue.labels && issue.labels.length > 0 ? issue.labels[0].name || 'Card' : 'Card';
      } else {
        // Jira API structure: issue.fields.status.name, issue.fields.issuetype.name
        status = issue.fields?.status?.name || issue.status?.name || 'Unknown';
        type = issue.fields?.issuetype?.name || issue.issuetype?.name || 'Unknown';
      }
      
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
  }
  return { statusCounts, typeCounts };
}

// Helper to extract status from issue/card
function getIssueStatus(issue: any): string {
  // Check if this is a Trello card (has list property)
  if (issue.list && issue.list.name) {
    return issue.list.name;
  }
  // Jira API structure: issue.fields.status.name, issue.status?.name
  return issue.fields?.status?.name || issue.status?.name || 'Unknown';
}

// Helper to check if data is stale (older than 5 minutes for production)
function isDataStale(lastSyncAt: Date | undefined): boolean {
  if (!lastSyncAt) return true;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastSyncAt < fiveMinutesAgo;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's integrations
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    
    // Respect fast=1 to avoid heavy auto-fetch during initial page paint
    const fast = request.nextUrl.searchParams.get('fast') === '1'
    // Force refresh analytics even if data is not stale (used after webhook events)
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === '1'
    
    // Get user's projects
    // If forceRefresh is true, ensure we get the latest projects from database
    // (this helps when refresh-analytics just updated them)
    const projects = await db.findProjectsByUserId(session.user.id)
    
    // Log for debugging
    if (forceRefresh) {
      console.log(`🔄 STATUS ENDPOINT (TENANT): forceRefresh=true, fetched ${projects.length} projects from database`);
    }

    // Check connection status for each integration with conservative approach
    // First check Nango (new way), then fall back to database (old way)
    let jiraConnected = false;
    let trelloConnected = false;
    let testrailConnected = false;
    let slackConnected = false;
    let jiraConnectedViaNango = false;
    let trelloConnectedViaNango = false;
    let slackConnectedViaNango = false;
    
    // Get tenant ID from request URL path or query param
    const tenantId = request.nextUrl.searchParams.get('tenantId') || 
                    request.nextUrl.pathname.split('/')[1] || 'default';
    
    console.log('🔍 STATUS ENDPOINT (TENANT): Checking connections for tenantId:', tenantId, 'userId:', session.user.id);
    
    // Check Jira connection - check Nango first, then database
    try {
      // First check Nango
      try {
        const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service');
        const nangoStatus = await jiraNangoService.getConnectionStatus(session.user.id, tenantId);
        if (nangoStatus.connected) {
          jiraConnected = true;
          jiraConnectedViaNango = true;
          console.log('✅ STATUS ENDPOINT (TENANT): Jira connected via Nango');
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Jira not connected via Nango, checking database');
        }
      } catch (nangoError) {
        // Nango not available or error - log but continue to database check
        const errorMsg = nangoError instanceof Error ? nangoError.message : String(nangoError);
        if (errorMsg.includes('offline') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ERR_NGROK')) {
          console.log('⚠️ STATUS ENDPOINT (TENANT): Nango unavailable for Jira check, falling back to database:', errorMsg.substring(0, 100));
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Jira Nango check failed, falling back to database:', errorMsg.substring(0, 100));
        }
      }
      
      // If not connected via Nango, check database
      if (!jiraConnected) {
        const jiraIntegration = integrations.find(i => i.type === 'JIRA')
        if (jiraIntegration && jiraIntegration.status === 'CONNECTED') {
          jiraConnected = await jiraService.isConnected(session.user.id)
          if (jiraConnected) {
            console.log('✅ STATUS ENDPOINT (TENANT): Jira connected via database');
          }
        }
      }
    } catch (error) {
      console.error('Error checking Jira connection:', error)
      // Fallback: check if integration exists and has valid token
      const jiraIntegration = integrations.find(i => i.type === 'JIRA')
      jiraConnected = !!(jiraIntegration && jiraIntegration.status === 'CONNECTED' && jiraIntegration.accessToken)
      if (jiraConnected) {
        console.log('✅ STATUS ENDPOINT (TENANT): Jira connected via fallback check');
      }
    }
    
    // Check Trello connection - check Nango first, then database
    try {
      // First check Nango
      try {
        const { trelloNangoService } = await import('@/lib/integrations/trello-nango-service');
        const nangoStatus = await trelloNangoService.getConnectionStatus(session.user.id, tenantId);
        if (nangoStatus.connected) {
          trelloConnected = true;
          trelloConnectedViaNango = true;
          console.log('✅ STATUS ENDPOINT (TENANT): Trello connected via Nango');
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Trello not connected via Nango, checking database');
        }
      } catch (nangoError) {
        // Nango not available or error - log but continue to database check
        const errorMsg = nangoError instanceof Error ? nangoError.message : String(nangoError);
        if (errorMsg.includes('offline') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ERR_NGROK')) {
          console.log('⚠️ STATUS ENDPOINT (TENANT): Nango unavailable for Trello check, falling back to database:', errorMsg.substring(0, 100));
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Trello Nango check failed, falling back to database:', errorMsg.substring(0, 100));
        }
      }
      
      // If not connected via Nango, check database
      if (!trelloConnected) {
        const trelloIntegration = integrations.find(i => i.type === 'TRELLO')
        if (trelloIntegration && trelloIntegration.status === 'CONNECTED') {
          trelloConnected = await trelloService.isConnected(session.user.id)
          if (trelloConnected) {
            console.log('✅ STATUS ENDPOINT (TENANT): Trello connected via database');
          }
        }
      }
    } catch (error) {
      console.error('Error checking Trello connection:', error)
      // Fallback: check if integration exists and has valid token
      const trelloIntegration = integrations.find(i => i.type === 'TRELLO')
      trelloConnected = !!(trelloIntegration && trelloIntegration.status === 'CONNECTED' && trelloIntegration.accessToken)
      if (trelloConnected) {
        console.log('✅ STATUS ENDPOINT (TENANT): Trello connected via fallback check');
      }
    }

    // Check Slack connection - check Nango first, then database
    try {
      // First check Nango
      try {
        const { slackNangoService } = await import('@/lib/integrations/slack-nango-service');
        const nangoStatus = await slackNangoService.getConnectionStatus(session.user.id, tenantId);
        if (nangoStatus.connected) {
          slackConnected = true;
          slackConnectedViaNango = true;
          console.log('✅ STATUS ENDPOINT (TENANT): Slack connected via Nango');
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Slack not connected via Nango, checking database');
        }
      } catch (nangoError) {
        // Nango not available or error - log but continue to database check
        const errorMsg = nangoError instanceof Error ? nangoError.message : String(nangoError);
        if (errorMsg.includes('offline') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ERR_NGROK')) {
          console.log('⚠️ STATUS ENDPOINT (TENANT): Nango unavailable for Slack check, falling back to database:', errorMsg.substring(0, 100));
        } else {
          console.log('ℹ️ STATUS ENDPOINT (TENANT): Slack Nango check failed, falling back to database:', errorMsg.substring(0, 100));
        }
      }
      
      // If not connected via Nango, check database
      if (!slackConnected) {
        const slackIntegration = integrations.find(i => i.type === 'SLACK')
        if (slackIntegration && slackIntegration.status === 'CONNECTED') {
          slackConnected = await slackService.isConnected(session.user.id)
          if (slackConnected) {
            console.log('✅ STATUS ENDPOINT (TENANT): Slack connected via database');
          }
        }
      }
    } catch (error) {
      console.error('Error checking Slack connection:', error)
      const slackIntegration = integrations.find(i => i.type === 'SLACK')
      slackConnected = !!(slackIntegration && slackIntegration.status === 'CONNECTED' && slackIntegration.accessToken)
      if (slackConnected) {
        console.log('✅ STATUS ENDPOINT (TENANT): Slack connected via fallback check');
      }
    }

    // Check TestRail connection - only database (not migrated to Nango yet)
    try {
      const testrailIntegration = integrations.find(i => i.type === 'TESTRAIL')
      if (testrailIntegration && testrailIntegration.status === 'CONNECTED') {
        testrailConnected = await testrailService.isConnected(session.user.id)
        
        // Also check if projects exist - if no projects, consider it not properly connected
        if (testrailConnected) {
          const testrailProjects = projects.filter(p => {
            if (!p.isActive) return false;
            // Primary: Check integrationType field (new reliable method)
            if ((p as any).integrationType === 'TESTRAIL') return true;
            // Fallback 1: Check for Nango virtual integration ID
            if (p.integrationId?.toString().startsWith('nango_testrail_')) return true;
            // Fallback 2: Check if integrationId matches the TestRail integration
            const testrailIntegrationId = testrailIntegration?._id?.toString();
            return testrailIntegrationId && p.integrationId?.toString() === testrailIntegrationId;
          })
          
          // If integration exists but no projects, it's not fully connected
          if (testrailProjects.length === 0) {
            console.log('⚠️ STATUS ENDPOINT (TENANT): TestRail integration exists but no projects found, marking as not connected')
            testrailConnected = false
          } else {
            console.log('✅ STATUS ENDPOINT (TENANT): TestRail connected via database with', testrailProjects.length, 'projects')
          }
        }
      }
    } catch (error) {
      console.error('Error checking TestRail connection:', error)
      // Fallback: check if integration exists and has valid token
      const testrailIntegration = integrations.find(i => i.type === 'TESTRAIL')
      testrailConnected = !!(testrailIntegration && testrailIntegration.status === 'CONNECTED' && testrailIntegration.accessToken)
    }
    
    console.log('🔍 STATUS ENDPOINT (TENANT): Connection status:', { jiraConnected, trelloConnected, slackConnected, testrailConnected });

    const integrationStatus = {
      jira: {
        connected: jiraConnected,
        integration: integrations.find(i => i.type === 'JIRA') || null,
      },
      trello: {
        connected: trelloConnected,
        integration: integrations.find(i => i.type === 'TRELLO') || null,
      },
      testrail: {
        connected: testrailConnected,
        integration: integrations.find(i => i.type === 'TESTRAIL') || null,
      },
      slack: {
        connected: slackConnected,
        integration: integrations.find(i => i.type === 'SLACK') || null,
      },
    }

    // Group projects by integration type and deduplicate by externalId
    // Helper function to deduplicate projects by externalId (keeping the most recent one)
    const deduplicateProjects = (projectList: any[]) => {
      const seen = new Map<string, any>();
      for (const project of projectList) {
        const key = project.externalId || project.key || project._id.toString();
        const existing = seen.get(key);
        if (!existing || (project.lastSyncAt && existing.lastSyncAt && project.lastSyncAt > existing.lastSyncAt)) {
          seen.set(key, project);
        }
      }
      return Array.from(seen.values());
    };

    // Build integration ID lookup maps for fallback filtering
    const integrationIdsByType: Record<string, Set<string>> = {
      JIRA: new Set(),
      TRELLO: new Set(),
      TESTRAIL: new Set(),
      SLACK: new Set(),
    };
    for (const i of integrations) {
      if (i.type && integrationIdsByType[i.type]) {
        integrationIdsByType[i.type].add(i._id.toString());
      }
    }

    const projectsByIntegration = {
      jira: deduplicateProjects(projects.filter(p => {
        if (!p.isActive) return false;
        // Primary: Check integrationType field (new reliable method)
        if ((p as any).integrationType === 'JIRA') return true;
        // Fallback 1: Check for Nango virtual integration ID
        if (p.integrationId?.toString().startsWith('nango_jira_')) return true;
        // Fallback 2: Check if integrationId is in JIRA integrations set
        return integrationIdsByType.JIRA.has(p.integrationId?.toString() || '');
      })),
      trello: deduplicateProjects(projects.filter(p => {
        if (!p.isActive) return false;
        // Primary: Check integrationType field
        if ((p as any).integrationType === 'TRELLO') return true;
        // Fallback 1: Check for Nango virtual integration ID
        if (p.integrationId?.toString().startsWith('nango_trello_')) return true;
        // Fallback 2: Check if integrationId is in TRELLO integrations set
        return integrationIdsByType.TRELLO.has(p.integrationId?.toString() || '');
      })),
      testrail: deduplicateProjects(projects.filter(p => {
        if (!p.isActive) return false;
        // Primary: Check integrationType field
        if ((p as any).integrationType === 'TESTRAIL') return true;
        // Fallback 1: Check for Nango virtual integration ID
        if (p.integrationId?.toString().startsWith('nango_testrail_')) return true;
        // Fallback 2: Check if integrationId is in TESTRAIL integrations set
        return integrationIdsByType.TESTRAIL.has(p.integrationId?.toString() || '');
      })),
      slack: deduplicateProjects(projects.filter(p => {
        if (!p.isActive) return false;
        // Primary: Check integrationType field
        if ((p as any).integrationType === 'SLACK') return true;
        // Fallback 1: Check for Nango virtual integration ID
        if (p.integrationId?.toString().startsWith('nango_slack_')) return true;
        // Fallback 2: Check if integrationId is in SLACK integrations set
        return integrationIdsByType.SLACK.has(p.integrationId?.toString() || '');
      })),
    }

    // Auto-fetch fresh data for newly connected integrations that don't have projects yet
    if (!fast && jiraConnected && projectsByIntegration.jira.length === 0) {
      try {
        console.log('Auto-fetching Jira projects for newly connected integration');
        if (jiraConnectedViaNango) {
          const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service');
          await jiraNangoService.fetchAndStoreProjects(session.user.id, tenantId);
        } else {
          await jiraService.fetchAndStoreProjects(session.user.id);
        }
        // Re-fetch projects after auto-sync
        const updatedProjects = await db.findProjectsByUserId(session.user.id);
        projectsByIntegration.jira = deduplicateProjects(updatedProjects.filter(p => {
          if (!p.isActive) return false;
          if ((p as any).integrationType === 'JIRA') return true;
          if (p.integrationId?.toString().startsWith('nango_jira_')) return true;
          return integrationIdsByType.JIRA.has(p.integrationId?.toString() || '');
        }));
      } catch (error) {
        console.error('Auto-fetch Jira projects failed:', error);
      }
    }

    if (!fast && trelloConnected && projectsByIntegration.trello.length === 0) {
      try {
        console.log('Auto-fetching Trello boards for newly connected integration');
        if (trelloConnectedViaNango) {
          const { trelloNangoService } = await import('@/lib/integrations/trello-nango-service');
          await trelloNangoService.fetchAndStoreBoards(session.user.id, tenantId);
        } else {
          await trelloService.fetchAndStoreBoards(session.user.id);
        }
        // Re-fetch projects after auto-sync
        const updatedProjects = await db.findProjectsByUserId(session.user.id);
        projectsByIntegration.trello = deduplicateProjects(updatedProjects.filter(p => {
          if (!p.isActive) return false;
          if ((p as any).integrationType === 'TRELLO') return true;
          if (p.integrationId?.toString().startsWith('nango_trello_')) return true;
          return integrationIdsByType.TRELLO.has(p.integrationId?.toString() || '');
        }));
      } catch (error) {
        console.error('Auto-fetch Trello boards failed:', error);
      }
    }

    if (!fast && testrailConnected && projectsByIntegration.testrail.length === 0) {
      try {
        console.log('Auto-fetching TestRail projects for newly connected integration');
        await testrailService.fetchAndStoreProjects(session.user.id);
        // Re-fetch projects after auto-sync
        const updatedProjects = await db.findProjectsByUserId(session.user.id);
        projectsByIntegration.testrail = updatedProjects.filter(p => {
          const integration = integrations.find(i => i._id.toString() === p.integrationId.toString())
          return integration?.type === 'TESTRAIL' && p.isActive
        });
      } catch (error) {
        console.error('Auto-fetch TestRail projects failed:', error);
      }
    }

    if (!fast && slackConnected && projectsByIntegration.slack.length === 0) {
      try {
        console.log('Auto-fetching Slack channels for newly connected integration');
        if (slackConnectedViaNango) {
          const { slackNangoService } = await import('@/lib/integrations/slack-nango-service');
          await slackNangoService.fetchAndStoreChannels(session.user.id, tenantId);
        } else {
          await slackService.fetchAndStoreChannels(session.user.id);
        }
        const updatedProjects = await db.findProjectsByUserId(session.user.id);
        projectsByIntegration.slack = deduplicateProjects(updatedProjects.filter(p => {
          if (!p.isActive) return false;
          if ((p as any).integrationType === 'SLACK') return true;
          if (p.integrationId?.toString().startsWith('nango_slack_')) return true;
          return integrationIdsByType.SLACK.has(p.integrationId?.toString() || '');
        }));
      } catch (error) {
        console.error('Auto-fetch Slack channels failed:', error);
      }
    }

    // Fetch issues for each project and compute analytics with better error handling
    async function getAnalyticsForProject(project: any, type: string) {
      let analytics = project.analytics || {};
      let issues: any[] = [];
      let dataSource = 'cached';
      
      console.log(`🔍 getAnalyticsForProject: Processing ${type} project ${project.name} (${project.key || project.externalId})`);
      console.log(`🔍 getAnalyticsForProject: Project lastSyncAt: ${project.lastSyncAt}, isDataStale: ${isDataStale(project.lastSyncAt)}`);
      
      try {
        // Only fetch fresh data if the project data is stale, doesn't exist, or forceRefresh is true
        if (forceRefresh || isDataStale(project.lastSyncAt)) {
          console.log(`🔄 getAnalyticsForProject: Fetching fresh data for ${type} project ${project.name}`);
          
          if (type === 'JIRA') {
            const integrationIdStr = project.integrationId?.toString() || '';
            const isNangoJiraProject = integrationIdStr.startsWith('nango_jira_');

            if (isNangoJiraProject && project.key) {
              try {
                const { jiraNangoService } = await import('@/lib/integrations/jira-nango-service');
                const jiraIssues = await jiraNangoService.fetchProjectIssues(
                  session.user.id,
                  project.key,
                  tenantId,
                  100
                );
                issues = jiraIssues.map((j) => ({
                  fields: {
                    status: j.status,
                    issuetype: j.issuetype,
                  },
                  status: j.status,
                  issuetype: j.issuetype,
                }));
                dataSource = 'live';
                console.log(`✅ getAnalyticsForProject: (Nango Jira) Fetched ${issues.length} issues for ${project.key}`);

                const { statusCounts, typeCounts } = computeStatusTypeCounts(issues);
                const freshAnalytics = {
                  totalIssues: issues.length,
                  openIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return !status.toLowerCase().includes('done') && !status.toLowerCase().includes('complete') && !status.toLowerCase().includes('closed');
                  }).length,
                  inProgressIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('progress') || status.toLowerCase().includes('doing') || status.toLowerCase().includes('review');
                  }).length,
                  doneIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('closed');
                  }).length,
                  statusCounts,
                  typeCounts,
                  dataSource: 'live' as const,
                  lastUpdated: new Date().toISOString()
                };
                await db.updateProject(project._id.toString(), {
                  lastSyncAt: new Date(),
                  analytics: freshAnalytics
                });
              } catch (apiError) {
                console.error(`Error fetching Jira issues (Nango) for project ${project.key}:`, apiError);
              }
            } else {
            const integration = integrations.find((i: any) => i._id.toString() === project.integrationId.toString());
            if (integration && integration.status === 'CONNECTED') {
              try {
                // Use the Jira API to fetch issues for this project
                const cloudId = integration.metadata?.cloudId;
                if (cloudId && project.key) {
                  const apiUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`;
                  const jql = `project = ${project.key} ORDER BY updated DESC`;
                  console.log(`🔍 getAnalyticsForProject: Jira API URL: ${apiUrl}, JQL: ${jql}`);
                  
                  const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${integration.accessToken}`,
                      'Accept': 'application/json',
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      jql: jql,
                      maxResults: 100,
                      fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated', 'duedate', 'resolutiondate', 'customfield_10015', 'customfield_10016', 'customfield_10018', 'customfield_10019']
                    })
                  });
                  if (response.ok) {
                    const data = await response.json();
                    issues = data.issues || [];
                    dataSource = 'live';
                    console.log(`✅ getAnalyticsForProject: Fetched ${issues.length} Jira issues for project ${project.key}`);
                    
                    // Compute analytics from fresh data
                    const { statusCounts, typeCounts } = computeStatusTypeCounts(issues);
                    const freshAnalytics = {
                      totalIssues: issues.length,
                      openIssues: issues.filter(i => {
                        const status = getIssueStatus(i);
                        return !status.toLowerCase().includes('done') && !status.toLowerCase().includes('complete') && !status.toLowerCase().includes('closed');
                      }).length,
                      inProgressIssues: issues.filter(i => {
                        const status = getIssueStatus(i);
                        return status.toLowerCase().includes('progress') || status.toLowerCase().includes('doing') || status.toLowerCase().includes('review');
                      }).length,
                      doneIssues: issues.filter(i => {
                        const status = getIssueStatus(i);
                        return status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('closed');
                      }).length,
                      statusCounts,
                      typeCounts,
                      dataSource: 'live' as const,
                      lastUpdated: new Date().toISOString()
                    };
                    
                    // Update project with analytics and lastSyncAt in database
                    await db.updateProject(project._id.toString(), { 
                      lastSyncAt: new Date(),
                      analytics: freshAnalytics
                    });
                  } else {
                    console.error(`❌ getAnalyticsForProject: Jira API error for project ${project.key}: ${response.status}`);
                  }
                } else {
                  console.error(`❌ getAnalyticsForProject: Missing cloudId or project key for Jira project ${project.key}`);
                }
              } catch (apiError) {
                console.error(`Error fetching Jira issues for project ${project.key}:`, apiError);
                // Keep existing analytics if API fails
              }
            } else {
              console.error(`❌ getAnalyticsForProject: Jira integration not found or not connected for project ${project.name}`);
            }
            }
          } else if (type === 'TRELLO') {
            // For Trello, fetch cards for the board (virtual id nango_trello_* does not match Mongo integration _id)
            const integrationIdStr = project.integrationId?.toString() || '';
            const isNangoTrelloProject = integrationIdStr.startsWith('nango_trello_');
            const integration = integrations.find((i: any) => i._id.toString() === project.integrationId.toString());
            const useNangoTrello = isNangoTrelloProject || integration?.metadata?.nangoManaged;

            if (useNangoTrello || (integration && integration.status === 'CONNECTED')) {
              try {
                let accessToken: string | undefined = integration?.accessToken;
                if (useNangoTrello) {
                  const { nangoService } = await import('@/lib/integrations/nango-service');
                  accessToken = await nangoService.getAccessToken('trello', tenantId, session.user.id);
                }
                
                if (!accessToken) {
                  throw new Error('Trello access token not available');
                }
                
                // Dynamically import fetchTrelloCards from trello-integration
                const { fetchTrelloCards } = await import('@/lib/integrations/trello-integration');
                console.log(`🔍 getAnalyticsForProject: Fetching Trello cards for board ${project.externalId}`);
                issues = await fetchTrelloCards(accessToken, project.externalId);
                dataSource = 'live';
                console.log(`✅ getAnalyticsForProject: Fetched ${issues.length} Trello cards for board ${project.externalId}`);
                
                // Compute analytics from fresh data
                const { statusCounts, typeCounts } = computeStatusTypeCounts(issues);
                const freshAnalytics = {
                  totalIssues: issues.length,
                  openIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return !status.toLowerCase().includes('done') && !status.toLowerCase().includes('complete') && !status.toLowerCase().includes('closed');
                  }).length,
                  inProgressIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('progress') || status.toLowerCase().includes('doing') || status.toLowerCase().includes('review');
                  }).length,
                  doneIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('closed');
                  }).length,
                  statusCounts,
                  typeCounts,
                  dataSource: 'live' as const,
                  lastUpdated: new Date().toISOString()
                };
                
                // Update project with analytics and lastSyncAt in database
                await db.updateProject(project._id.toString(), { 
                  lastSyncAt: new Date(),
                  analytics: freshAnalytics
                });
              } catch (apiError) {
                console.error(`Error fetching Trello cards for board ${project.externalId}:`, apiError);
                // Keep existing analytics if API fails
              }
            } else {
              console.error(`❌ getAnalyticsForProject: Trello integration not found or not connected for project ${project.name}`);
            }
          } else if (type === 'TESTRAIL') {
            const integration = integrations.find((i: any) => i._id.toString() === project.integrationId.toString());
            if (integration && integration.status === 'CONNECTED') {
              try {
                const { fetchTestRailTestCases } = await import('@/lib/integrations/testrail-integration');
                console.log(`🔍 getAnalyticsForProject: Fetching TestRail test cases for project ${project.externalId}`);
                issues = await fetchTestRailTestCases(integration, parseInt(project.externalId));
                dataSource = 'live';
                console.log(`✅ getAnalyticsForProject: Fetched ${issues.length} TestRail test cases for project ${project.externalId}`);

                // Compute analytics from fresh data
                const { statusCounts, typeCounts } = computeStatusTypeCounts(issues);
                const freshAnalytics = {
                  totalIssues: issues.length,
                  openIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return !status.toLowerCase().includes('done') && !status.toLowerCase().includes('complete') && !status.toLowerCase().includes('closed');
                  }).length,
                  inProgressIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('progress') || status.toLowerCase().includes('doing') || status.toLowerCase().includes('review');
                  }).length,
                  doneIssues: issues.filter(i => {
                    const status = getIssueStatus(i);
                    return status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('closed');
                  }).length,
                  statusCounts,
                  typeCounts,
                  dataSource: 'live' as const,
                  lastUpdated: new Date().toISOString()
                };

                // Update project with analytics and lastSyncAt in database
                await db.updateProject(project._id.toString(), { 
                  lastSyncAt: new Date(),
                  analytics: freshAnalytics
                });
              } catch (apiError) {
                console.error(`Error fetching TestRail test cases for project ${project.externalId}:`, apiError);
                // Keep existing analytics if API fails
              }
            } else {
              console.error(`❌ getAnalyticsForProject: TestRail integration not found or not connected for project ${project.name}`);
            }
          }
        } else {
          // If forceRefresh is true, we should NOT use cached data - fetch fresh instead
          if (forceRefresh) {
            console.log(`⚠️ getAnalyticsForProject: forceRefresh=true but data is not stale, re-fetching project from database for ${type} project ${project.name}`);
            // Re-fetch all projects from database to get latest analytics (refresh-analytics just updated them)
            const freshProjects = await db.findProjectsByUserId(session.user.id);
            const freshProject = freshProjects.find(p => p._id.toString() === project._id.toString());
            if (freshProject && freshProject.analytics) {
              console.log(`✅ getAnalyticsForProject: Using fresh analytics from database for ${type} project ${project.name}`);
              return {
                ...freshProject.analytics,
                statusCounts: freshProject.analytics.statusCounts || {},
                typeCounts: freshProject.analytics.typeCounts || {},
                dataSource: 'live' as const,
                lastUpdated: freshProject.analytics.lastUpdated || new Date().toISOString()
              };
            }
          }
          
          console.log(`📋 getAnalyticsForProject: Using cached data for ${type} project ${project.name}`);
          // When using cached data, return the existing analytics if they exist
          if (analytics && analytics.totalIssues !== undefined) {
            console.log(`📊 getAnalyticsForProject: Using existing cached analytics for ${type} project ${project.name}:`, {
              totalIssues: analytics.totalIssues,
              openIssues: analytics.openIssues,
              inProgressIssues: analytics.inProgressIssues,
              doneIssues: analytics.doneIssues,
              dataSource: 'cached'
            });
            
            // Ensure cached analytics have proper structure
            const cachedAnalytics = {
              ...analytics,
              statusCounts: analytics.statusCounts || { 'Unknown': analytics.totalIssues || 0 },
              typeCounts: analytics.typeCounts || { 'Unknown': analytics.totalIssues || 0 },
              dataSource: 'cached' as const,
              lastUpdated: new Date().toISOString()
            };
            
            return cachedAnalytics;
          }
        }
      } catch (e) {
        console.error(`Error in getAnalyticsForProject for ${type} project:`, e);
        // Keep existing analytics if everything fails
      }
      
      // Only compute analytics from issues if we have fresh data
      if (issues.length > 0 || dataSource === 'live') {
        const { statusCounts, typeCounts } = computeStatusTypeCounts(issues);
        const analyticsResult = { 
          ...analytics, 
          totalIssues: issues.length,
          openIssues: issues.filter(i => {
            const status = getIssueStatus(i);
            return !status.toLowerCase().includes('done') && !status.toLowerCase().includes('complete') && !status.toLowerCase().includes('closed');
          }).length,
          inProgressIssues: issues.filter(i => {
            const status = getIssueStatus(i);
            return status.toLowerCase().includes('progress') || status.toLowerCase().includes('doing') || status.toLowerCase().includes('review');
          }).length,
          doneIssues: issues.filter(i => {
            const status = getIssueStatus(i);
            return status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('closed');
          }).length,
          statusCounts, 
          typeCounts,
          dataSource: dataSource as 'live' | 'cached',
          lastUpdated: new Date().toISOString()
        };
        
        console.log(`📊 getAnalyticsForProject: Final analytics for ${type} project ${project.name}:`, {
          totalIssues: analyticsResult.totalIssues,
          openIssues: analyticsResult.openIssues,
          inProgressIssues: analyticsResult.inProgressIssues,
          doneIssues: analyticsResult.doneIssues,
          statusCounts: Object.keys(analyticsResult.statusCounts).length,
          typeCounts: Object.keys(analyticsResult.typeCounts).length,
          dataSource: analyticsResult.dataSource
        });
        
        return analyticsResult;
      } else {
        // Return default analytics if no data available
        const defaultAnalytics = {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          doneIssues: 0,
          statusCounts: {},
          typeCounts: {},
          dataSource: 'cached' as const,
          lastUpdated: new Date().toISOString()
        };
        
        console.log(`📊 getAnalyticsForProject: Default analytics for ${type} project ${project.name}:`, {
          totalIssues: defaultAnalytics.totalIssues,
          openIssues: defaultAnalytics.openIssues,
          inProgressIssues: defaultAnalytics.inProgressIssues,
          doneIssues: defaultAnalytics.doneIssues,
          dataSource: defaultAnalytics.dataSource
        });
        
        return defaultAnalytics;
      }
    }

    // Map projects and attach analytics
    async function mapProjects(projects: any[], type: string) {
      return await Promise.all(projects.map(async (p: any) => {
        const analytics = await getAnalyticsForProject(p, type);
        return {
          id: p._id.toString(),
          externalId: p.externalId,
          name: p.name,
          key: p.key,
          description: p.description,
          avatarUrl: p.avatarUrl,
          isActive: p.isActive,
          createdAt: p.createdAt.toISOString(),
          lastSyncAt: p.lastSyncAt?.toISOString(),
          projectTypeKey: type === 'JIRA' ? (p.projectTypeKey || 'N/A') : (type === 'TRELLO' ? 'Trello Board' : (type === 'TESTRAIL' ? 'TestRail Project' : 'Slack Channel')),
          integrationType: type,
          analytics,
        };
      }));
    }

    const jiraProjects = await mapProjects(projectsByIntegration.jira, 'JIRA');
    const trelloProjects = await mapProjects(projectsByIntegration.trello, 'TRELLO');
    const testrailProjects = await mapProjects(projectsByIntegration.testrail, 'TESTRAIL');
    const slackProjects = await mapProjects(projectsByIntegration.slack, 'SLACK');

    return NextResponse.json({
      integrations: integrationStatus,
      projects: {
        jira: jiraProjects,
        trello: trelloProjects,
        testrail: testrailProjects,
        slack: slackProjects,
      },
      summary: {
        totalIntegrations: integrations.filter(i => i.status === 'CONNECTED').length,
        totalProjects: projects.filter(p => p.isActive).length,
        jiraProjects: jiraProjects.length,
        trelloProjects: trelloProjects.length,
        testrailProjects: testrailProjects.length,
      },
    })
  } catch (error) {
    console.error('Integration status error:', error)
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    )
  }
} 