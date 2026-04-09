"use server";

import { cookies } from 'next/headers';
import type { TestCase } from '@/lib/ai/test-case-types';
import { TestCaseGenerator } from '@/lib/ai/test-case-generator';
import { fetchWithJiraAuth } from '@/lib/jira-auth';
import { listTeams, listChannels } from '@/lib/teams-api';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { db } from '@/lib/db/database';
import { jiraService } from '@/lib/integrations/jira-service';
import { TrelloService } from '@/lib/integrations/trello-service';
const trelloService = new TrelloService();

export interface FileUploadResponse {
  success: boolean;
  message: string;
  fileId?: string;
  error?: string;
}

export interface TestCaseGenerationResponse {
  success: boolean;
  testCases: TestCase[];
  message: string;
  error?: string;
}

export interface IntegrationSendResponse {
  success: boolean;
  message: string;
  error?: string;
  issueKey?: string;
  cardId?: string;
  testCaseId?: string;
}

export interface IntegrationStatus {
  name: string;
  connected: boolean;
  icon: string;
}

export interface Integration {
  name: string;
  connected: boolean;
  icon: string;
}

export interface List {
  id: string;
  name: string;
}

export interface Sprint {
  id: string;
  name: string;
  state: string; // 'future', 'active', 'closed'
}

export interface Board {
  id: string;
  name: string;
  key?: string; // For Jira projects
  lists?: List[]; // For Trello boards
  sprints?: Sprint[]; // For Jira boards
}

/**
 * Process uploaded file and extract text content
 */
export async function processFileAction(formData: FormData): Promise<FileUploadResponse> {
  try {
    const file = formData.get('file') as File;
    
    if (!file) {
      return {
        success: false,
        message: 'No file provided',
        error: 'File is required'
      };
    }

    // Validate file type
    const allowedTypes = [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown'
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        message: 'Unsupported file type',
        error: 'Please upload a PDF, DOC, DOCX, TXT, or MD file'
      };
    }

    // Validate file size (50MB limit - increased from 10MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return {
        success: false,
        message: 'File too large',
        error: 'File size must be less than 50MB'
      };
    }

    // For now, we'll simulate file processing
    // In production, you would use libraries like pdf-parse, mammoth, etc.
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      message: 'File uploaded successfully',
      fileId
    };

  } catch (error: any) {
    console.error('Error processing file:', error);
    return {
      success: false,
      message: 'Failed to process file',
      error: error.message
    };
  }
}

/**
 * Generate test cases from uploaded file content
 */
export async function generateTestCasesAction(content: string, fileName: string): Promise<{ success: boolean; testCases?: TestCase[]; error?: string }> {
  try {
    console.log(`🚀 Generating test cases for file: ${fileName}`);
    console.log(`📄 Content length: ${content.length} characters`);
    
    const generator = new TestCaseGenerator();
    
    // Generate test cases using AI
    const testCases = await generator.generateTestCases(content, fileName);
    
    console.log(`✅ Successfully generated ${testCases.length} test cases`);
    
    return {
      success: true,
      testCases
    };
  } catch (error) {
    console.error('❌ Error generating test cases:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during test case generation'
    };
  }
}

/**
 * Get current integration status
 */
export async function getIntegrationStatusAction(): Promise<IntegrationStatus[]> {
  try {
    const cookieStore = await cookies();
    
    // Check Jira connection
    const jiraAuthMethod = cookieStore.get('jira_auth_method')?.value;
    const jiraConnected = !!jiraAuthMethod;
    
    // Check Trello connection
    const trelloToken = cookieStore.get('trello_access_token')?.value;
    const trelloConnected = !!trelloToken;

    return [
      {
        name: 'Jira',
        connected: jiraConnected,
        icon: '🔷'
      },
      {
        name: 'Trello',
        connected: trelloConnected,
        icon: '📋'
      }
    ];

  } catch (error) {
    console.error('Error getting integration status:', error);
    return [
      { name: 'Jira', connected: false, icon: '🔷' },
      { name: 'Trello', connected: false, icon: '📋' }
    ];
  }
}

/**
 * Get boards/projects from connected integrations
 */
export async function getBoardsAction(integration: string): Promise<Board[]> {
  try {
    if (integration === 'Jira') {
      return await getJiraProjects();
    } else if (integration === 'Trello') {
      return await getTrelloBoards();
    } else if (integration === 'TestRail') {
      return await getTestRailProjects();
    } else if (integration === 'Teams') {
      // Get Teams access token from cookie
      const cookieStore = await cookies();
      const accessToken = cookieStore.get('teams_access_token')?.value;
      if (!accessToken) throw new Error('Teams not connected');
      const teams = await listTeams(accessToken);
      // For each team, fetch channels
      const boards: Board[] = [];
      for (const team of teams) {
        const channels = await listChannels(accessToken, team.id);
        boards.push({
          id: team.id,
          name: team.displayName,
          lists: channels.map(c => ({ id: c.id, name: c.displayName })),
        });
      }
      return boards;
    } else {
      throw new Error(`Unsupported integration: ${integration}`);
    }
  } catch (error: any) {
    console.error(`Error fetching ${integration} boards:`, error);
    throw error;
  }
}

/**
 * Get sprints for a Jira project by finding boards associated with the project
 */
async function getJiraSprintsForProject(projectId: string): Promise<Sprint[]> {
  const cookieStore = await cookies();
  const jiraAuthMethod = cookieStore.get('jira_auth_method')?.value;
  
  if (!jiraAuthMethod) {
    return [];
  }

  let jiraSiteUrl: string | undefined;
  
  // Get the appropriate site URL based on auth method
  if (jiraAuthMethod === 'oauth') {
    jiraSiteUrl = cookieStore.get('jira_oauth_site_url')?.value;
  } else if (jiraAuthMethod === 'api_token') {
    jiraSiteUrl = cookieStore.get('jira_site_url')?.value;
  }

  if (!jiraSiteUrl) {
    return [];
  }

  try {
    console.log(`🔍 Fetching sprints for project ${projectId}`);
    
    // First, try to find boards associated with this project
    const boardsResponse = await fetchWithJiraAuth(
      `${jiraSiteUrl}/rest/agile/1.0/board?projectKeyOrId=${projectId}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!boardsResponse.ok) {
      console.log(`❌ Failed to fetch boards for project ${projectId}: ${boardsResponse.status}`);
      return [];
    }

    const boardsData = await boardsResponse.json();
    const boards = boardsData.values || [];
    
    if (boards.length === 0) {
      console.log(`📋 No boards found for project ${projectId}`);
      return [];
    }

    // Get sprints from the first board (most projects have one main board)
    const boardId = boards[0].id;
    console.log(`📋 Using board ${boardId} (${boards[0].name}) for project ${projectId}`);

    const sprintsResponse = await fetchWithJiraAuth(
      `${jiraSiteUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active,future`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!sprintsResponse.ok) {
      console.log(`❌ Failed to fetch sprints for board ${boardId}: ${sprintsResponse.status}`);
      return [];
    }

    const sprintsData = await sprintsResponse.json();
    const sprints = sprintsData.values || [];
    
    console.log(`🏃 Found ${sprints.length} sprints for project ${projectId}`);
    
    return sprints.map((sprint: any) => ({
      id: sprint.id.toString(),
      name: sprint.name,
      state: sprint.state
    }));

  } catch (error) {
    console.error(`Error fetching sprints for project ${projectId}:`, error);
    return [];
  }
}

/**
 * Get Jira projects
 */
async function getJiraProjects(): Promise<Board[]> {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    throw new Error('Not authenticated. Please log in and try again.');
  }
  try {
    const projects = await jiraService.fetchAndStoreProjects(session.user.id);
    // Map JiraProject[] to Board[]
    return projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      key: project.key,
      sprints: [], // You can fetch sprints separately if needed
      lists: [],
    }));
  } catch (err: any) {
    // If Jira was auto-disconnected, surface a clear message so the UI can prompt reconnect
    if (err instanceof Error && /reconnect jira|session expired/i.test(err.message)) {
      throw new Error('Jira is disconnected. Please reconnect to continue.');
    }
    // Provide helpful error messages
    if (err?.message?.includes('unauthorized') || err?.message?.includes('Unauthorized')) {
      throw new Error('Jira connection has expired. Please reconnect Jira in the integrations page.');
    }
    throw err;
  }
}

/**
 * Get Trello boards with lists
 */
async function getTrelloBoards(): Promise<Board[]> {
  const session = await getServerSession(authConfig);
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Not authenticated. Please log in and try again.');
  }
  
  const integration = await trelloService.getIntegration(userId);
  const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
  
  if (!TRELLO_API_KEY) {
    throw new Error('Trello API key not configured. Please contact your administrator.');
  }
  
  if (!integration || integration.status !== 'CONNECTED') {
    throw new Error('Trello is not connected. Please connect Trello in the integrations page first.');
  }
  
  // Get access token (handles both Nango and DB tokens)
  let trelloToken = integration.accessToken;
  if (integration.metadata?.nangoManaged) {
    try {
      const { nangoService } = await import('@/lib/integrations/nango-service');
      const tenantId = integration.metadata.tenantId || 'default';
      trelloToken = await nangoService.getAccessToken('trello', tenantId, userId);
    } catch (nangoError: any) {
      console.error('❌ getTrelloBoards: Failed to get Nango token:', nangoError);
      // Provide helpful error message
      if (nangoError?.message?.includes('unauthorized') || nangoError?.message?.includes('Unauthorized')) {
        throw new Error('Trello connection has expired. Please reconnect Trello in the integrations page.');
      }
      throw new Error(`Failed to get Trello access token: ${nangoError?.message || 'Unknown error'}`);
    }
  }
  
  if (!trelloToken) {
    throw new Error('Trello access token is not available. Please reconnect Trello in the integrations page.');
  }
  
  // Get user's boards
  const boardsResponse = await fetch(
    `https://api.trello.com/1/members/me/boards?key=${TRELLO_API_KEY}&token=${trelloToken}&fields=id,name&filter=open`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }
  );
  if (!boardsResponse.ok) {
    let errorMessage = 'Failed to fetch Trello boards';
    const errorText = await boardsResponse.text().catch(() => '');
    if (errorText) {
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }
  
  // Parse boards response
  const boardsText = await boardsResponse.text().catch(() => '');
  let boards;
  try {
    boards = JSON.parse(boardsText);
  } catch {
    throw new Error(boardsText || 'Invalid response from Trello API');
  }
  
  // Get lists for each board
  const boardsWithLists = await Promise.all(
    boards.map(async (board: any) => {
      try {
        const listsResponse = await fetch(
          `https://api.trello.com/1/boards/${board.id}/lists?key=${TRELLO_API_KEY}&token=${trelloToken}&fields=id,name&filter=open`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );
        if (listsResponse.ok) {
          const listsText = await listsResponse.text().catch(() => '');
          let lists;
          try {
            lists = JSON.parse(listsText);
          } catch {
            console.warn(`Failed to parse lists for board ${board.id}, using empty list`);
            lists = [];
          }
          return {
            id: board.id,
            name: board.name,
            lists: lists.map((list: any) => ({
              id: list.id,
              name: list.name,
            })),
          };
        } else {
          // If we can't get lists, still return the board
          return {
            id: board.id,
            name: board.name,
            lists: [],
          };
        }
      } catch (error) {
        console.error(`Error fetching lists for board ${board.id}:`, error);
        return {
          id: board.id,
          name: board.name,
          lists: [],
        };
      }
    })
  );
  return boardsWithLists;
}

/**
 * Get TestRail projects
 */
async function getTestRailProjects(): Promise<Board[]> {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Import TestRail service
  const { TestRailService } = await import('@/lib/integrations/testrail-service');
  const testrailService = new TestRailService();
  
  const integration = await testrailService.getIntegration(session.user.id);
  if (!integration || integration.status !== 'CONNECTED') {
    throw new Error('TestRail not connected');
  }
  
  // Fetch projects from database (they should already be synced)
  const projects = await db.findProjectsByUserId(session.user.id);
  const integrations = await db.findIntegrationsByUserId(session.user.id);
  const testrailProjects = projects.filter(p => {
    const projectIntegration = integrations.find(i => i._id.toString() === p.integrationId.toString());
    return projectIntegration?.type === 'TESTRAIL' && p.isActive;
  });
  
  // Map TestRail projects to Board format
  return testrailProjects.map((project: any) => ({
    id: project.externalId,
    name: project.name,
    key: project.key,
    lists: [],
    sprints: [],
  }));
}

/**
 * Send test case to Jira as an issue
 */
export async function sendTestCaseToJiraAction(
  testCase: TestCase, 
  projectKey: string, // <-- rename parameter for clarity
  sprintId?: string,
  testCaseId?: string,
  documentId?: string
): Promise<IntegrationSendResponse> {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Not authenticated',
        error: 'Not authenticated',
      };
    }
    // Check if Jira integration is connected
    const integration = await jiraService.getIntegration(session.user.id);
    if (!integration || integration.status !== 'CONNECTED') {
      return {
        success: false,
        message: 'Jira not connected',
        error: 'Please connect Jira in the integrations page first'
      };
    }

    // Use projectKey for permission check
    const hasPermission = await jiraService.checkProjectCreateIssuePermission(session.user.id, projectKey);
    if (!hasPermission) {
      return {
        success: false,
        message: 'Insufficient permissions to create Jira issues. Please reconnect to Jira to grant the required permissions.',
        error: 'Insufficient permissions to create Jira issues. Please reconnect to Jira to grant the required permissions.',
      };
    }

    // Get the site URL from integration metadata or Nango
    let jiraSiteUrl = integration.serverUrl;
    
    // For Nango-managed integrations, get serverUrl from Nango if not in DB
    if (!jiraSiteUrl && integration.metadata?.nangoManaged) {
      try {
        const { nangoService } = await import('@/lib/integrations/nango-service');
        const tenantId = integration.metadata.tenantId || 'default';
        const nangoMetadata = await nangoService.getConnectionMetadata('jira', tenantId, session.user.id);
        const cloudId = nangoMetadata.cloudId || nangoMetadata.cloud_id;
        if (cloudId) {
          jiraSiteUrl = `https://api.atlassian.com/ex/jira/${cloudId}`;
          console.log('🔍 TESTCASES: Got Jira serverUrl from Nango:', jiraSiteUrl);
        }
      } catch (nangoError) {
        console.error('⚠️ TESTCASES: Failed to get Jira serverUrl from Nango:', nangoError);
      }
    }
    
    if (!jiraSiteUrl) {
      return {
        success: false,
        message: 'Jira site URL not found',
        error: 'Please reconnect Jira in the integrations page'
      };
    }

    // If no sprint is specified, try to find the active sprint automatically
    let targetSprintId = sprintId;
    if (!targetSprintId) {
      console.log(`🔍 SPRINT DETECTION DEBUG: Starting auto-sprint detection for project ${projectKey}`);
      
      try {
        // Method 1: Try to get active sprint directly from the board
        console.log(`🔍 Method 1: Getting active sprint from board for project ${projectKey}`);
        const boardResponse = await fetchWithJiraAuth(
          `${jiraSiteUrl}/rest/agile/1.0/board`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (boardResponse.ok) {
          const boards = await boardResponse.json();
          console.log(`📋 Found ${boards.values?.length || 0} boards`);
          
          // Find board for this project
          const projectBoard = boards.values?.find((board: any) => 
            board.location?.projectKey === projectKey || 
            board.location?.projectId === projectKey
          );
          
          if (projectBoard) {
            console.log(`📋 Found board for project: ${projectBoard.name} (ID: ${projectBoard.id})`);
            
            // Get active sprint from this board
            const sprintResponse = await fetchWithJiraAuth(
              `${jiraSiteUrl}/rest/agile/1.0/board/${projectBoard.id}/sprint?state=active`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                },
              }
            );

            if (sprintResponse.ok) {
              const sprints = await sprintResponse.json();
              console.log(`🏃 Found ${sprints.values?.length || 0} active sprints`);
              
              if (sprints.values && sprints.values.length > 0) {
                const activeSprint = sprints.values[0]; // Get the first active sprint
                targetSprintId = activeSprint.id.toString();
                console.log(`✅ Found active sprint: ${activeSprint.name} (ID: ${activeSprint.id})`);
              }
            }
          }
        }

        // Method 2: If Method 1 failed, try searching for issues with sprint assignments
        if (!targetSprintId) {
          console.log(`🔍 Method 2: Searching for issues with sprint assignments`);
          
          const searchUrl = `${jiraSiteUrl}/rest/api/3/search/jql`;
          console.log(`🔎 Searching for issues with sprint assignments: ${searchUrl}`);
          
          const recentIssuesResponse = await fetchWithJiraAuth(searchUrl, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jql: `project=${projectKey} AND sprint is not EMPTY ORDER BY updated DESC`,
              maxResults: 10,
              fields: ['*all']
            })
          });

          if (recentIssuesResponse.ok) {
            const searchResult = await recentIssuesResponse.json();
            console.log(`📊 Search Result: Found ${searchResult.issues?.length || 0} issues with sprints`);
            
            // Look for sprint-related fields in issues that have sprint assignments
            for (const issue of searchResult.issues || []) {
              console.log(`🔍 Inspecting fields in issue ${issue.key}:`);
              
              // Log all field names to see what's available
              const fieldNames = Object.keys(issue.fields || {});
              const sprintFields = fieldNames.filter(field => 
                field.toLowerCase().includes('sprint') || 
                field.includes('customfield_')
              );
              console.log(`📋 Available sprint-related fields:`, sprintFields);
              
              // Try to find sprint data in any of these fields
              for (const fieldName of sprintFields) {
                const fieldValue = issue.fields[fieldName];
                if (fieldValue) {
                  console.log(`🔍 Field ${fieldName}:`, JSON.stringify(fieldValue, null, 2));
                  
                  // Check if this looks like sprint data
                  if (Array.isArray(fieldValue)) {
                    for (const item of fieldValue) {
                      if (item && (item.name || item.id) && item.state) {
                        console.log(`🏃 Found sprint in ${fieldName}: ${item.name} (ID: ${item.id}, State: ${item.state})`);
                        if (item.state === 'active') {
                          targetSprintId = item.id.toString();
                          console.log(`✅ Found active sprint: ${item.name} (${item.id})`);
                          break;
                        }
                      }
                    }
                  } else if (fieldValue && (fieldValue.name || fieldValue.id) && fieldValue.state) {
                    console.log(`🏃 Found sprint in ${fieldName}: ${fieldValue.name} (ID: ${fieldValue.id}, State: ${fieldValue.state})`);
                    if (fieldValue.state === 'active') {
                      targetSprintId = fieldValue.id.toString();
                      console.log(`✅ Found active sprint: ${fieldValue.name} (${fieldValue.id})`);
                      break;
                    }
                  } else if (typeof fieldValue === 'string' && fieldValue.includes('SCRUM Sprint')) {
                    // Handle string-based sprint data
                    console.log(`🏃 Found string-based sprint data in ${fieldName}: ${fieldValue}`);
                    // Try to extract sprint ID from string format
                    const sprintMatch = fieldValue.match(/id=(\d+)/);
                    if (sprintMatch) {
                      targetSprintId = sprintMatch[1];
                      console.log(`✅ Extracted sprint ID from string: ${targetSprintId}`);
                      break;
                    }
                  }
                }
                
                if (targetSprintId) break;
              }
              
              if (targetSprintId) break;
            }
            
            if (!targetSprintId) {
              console.log(`❌ No suitable sprint found in any fields`);
            }
          } else {
            console.log(`❌ Failed to search for issues: ${recentIssuesResponse.status}`);
          }
        }

        // Method 3: If still no sprint found, try to get any future sprint
        if (!targetSprintId) {
          console.log(`🔍 Method 3: Looking for any future sprint`);
          
          const futureSprintResponse = await fetchWithJiraAuth(
            `${jiraSiteUrl}/rest/agile/1.0/board`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            }
          );

          if (futureSprintResponse.ok) {
            const boards = await futureSprintResponse.json();
            const projectBoard = boards.values?.find((board: any) => 
              board.location?.projectKey === projectKey || 
              board.location?.projectId === projectKey
            );
            
            if (projectBoard) {
              const futureSprintResponse2 = await fetchWithJiraAuth(
                `${jiraSiteUrl}/rest/agile/1.0/board/${projectBoard.id}/sprint?state=future`,
                {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                  },
                }
              );

              if (futureSprintResponse2.ok) {
                const sprints = await futureSprintResponse2.json();
                if (sprints.values && sprints.values.length > 0) {
                  const futureSprint = sprints.values[0];
                  targetSprintId = futureSprint.id.toString();
                  console.log(`✅ Found future sprint: ${futureSprint.name} (ID: ${futureSprint.id})`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error during sprint detection:', error);
      }
    } else {
      console.log(`✅ Using provided sprint ID: ${targetSprintId}`);
    }

    // Format test case as Atlassian Document Format (ADF)
    const description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: `Test Case: ${testCase.title}` }]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Description: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.description }
          ]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Priority: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.priority }
          ]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Category: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.category }
          ]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Estimated Time: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.estimatedTime || 'Not specified' }
          ]
        },
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Test Steps:" }]
        },
        {
          type: "orderedList",
          content: testCase.steps.map(step => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: step }] }]
          }))
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Expected Result: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.expectedResult }
          ]
        },
        ...(testCase.preconditions && testCase.preconditions.length > 0 ? [
          {
            type: "heading",
            attrs: { level: 4 },
            content: [{ type: "text", text: "Preconditions:" }]
          },
          {
            type: "bulletList",
            content: testCase.preconditions.map(p => ({
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: p }] }]
            }))
          }
        ] : []),
        ...(testCase.testData && testCase.testData.length > 0 ? [
          {
            type: "heading",
            attrs: { level: 4 },
            content: [{ type: "text", text: "Test Data:" }]
          },
          {
            type: "bulletList",
            content: testCase.testData.map(d => ({
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: d }] }]
            }))
          }
        ] : []),
        ...(testCase.tags && testCase.tags.length > 0 ? [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Tags: ", marks: [{ type: "strong" }] },
              { type: "text", text: testCase.tags.join(', ') }
            ]
          }
        ] : []),
        {
          type: "rule"
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Generated by UPMY Test Case Generator", marks: [{ type: "em" }] }
          ]
        }
      ]
    };

    // Determine a valid issuetype for this project
    let issueTypeName = 'Story';
    try {
      const metaRes = await fetchWithJiraAuth(
        `${jiraSiteUrl}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const types: Array<{ name: string }> = meta?.projects?.[0]?.issuetypes || [];
        const candidates = ['Story', 'Task', 'Bug', 'Incident', 'Improvement'];
        const found = candidates.find(c => types.some(t => (t.name || '').toLowerCase() === c.toLowerCase()));
        issueTypeName = found || (types[0]?.name || 'Task');
      }
    } catch {}

    // Create Jira issue with more robust field handling
    const issueData: any = {
      fields: {
        project: {
          key: projectKey
        },
        summary: `[TEST] ${testCase.title}`,
        description: description,
        issuetype: {
          name: issueTypeName
        }
        // Remove priority and labels for now to avoid field validation issues
      }
    };

    // If sprint is specified, add it to the issue
    if (targetSprintId) {
      console.log(`🎯 SPRINT ASSIGNMENT: Attempting to assign to sprint ${targetSprintId}`);
      
      // Try multiple common sprint field names and formats
      const sprintFieldConfigs = [
        { fieldName: 'customfield_10020', value: parseInt(targetSprintId) }, // Most common
        { fieldName: 'customfield_10010', value: parseInt(targetSprintId) }, // Alternative common field
        { fieldName: 'customfield_10001', value: parseInt(targetSprintId) }, // Another alternative
        { fieldName: 'sprint', value: parseInt(targetSprintId) }, // Direct field name (less common)
        { fieldName: 'customfield_10020', value: targetSprintId }, // String format
        { fieldName: 'customfield_10010', value: targetSprintId }, // String format
        { fieldName: 'customfield_10001', value: targetSprintId }, // String format
        { fieldName: 'sprint', value: targetSprintId }, // String format
      ];
      
      // Use the most common field first (most likely to work)
      const primaryField = 'customfield_10020';
      issueData.fields[primaryField] = parseInt(targetSprintId);
      
      console.log(`🎯 Using sprint field ${primaryField} with value ${parseInt(targetSprintId)}`);
      console.log(`🎯 Final issue data with sprint:`, JSON.stringify(issueData, null, 2));
    } else {
      console.log(`⚠️  No sprint ID found, creating issue without sprint assignment`);
      
      // Try to get any available sprint as fallback
      try {
        console.log(`🔍 FALLBACK: Looking for any available sprint for project ${projectKey}`);
        const boardResponse = await fetchWithJiraAuth(
          `${jiraSiteUrl}/rest/agile/1.0/board`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (boardResponse.ok) {
          const boards = await boardResponse.json();
          const projectBoard = boards.values?.find((board: any) => 
            board.location?.projectKey === projectKey || 
            board.location?.projectId === projectKey
          );
          
          if (projectBoard) {
            // Try to get any sprint (active, future, or closed)
            const sprintResponse = await fetchWithJiraAuth(
              `${jiraSiteUrl}/rest/agile/1.0/board/${projectBoard.id}/sprint`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                },
              }
            );

            if (sprintResponse.ok) {
              const sprints = await sprintResponse.json();
              if (sprints.values && sprints.values.length > 0) {
                const anySprint = sprints.values[0];
                issueData.fields['customfield_10020'] = parseInt(anySprint.id.toString());
                console.log(`🎯 FALLBACK: Using any available sprint: ${anySprint.name} (ID: ${anySprint.id})`);
              }
            }
          }
        }
      } catch (error) {
        console.log(`❌ FALLBACK: Could not find any sprint:`, error);
      }
    }

    console.log('Creating Jira issue with payload:', JSON.stringify(issueData, null, 2));

    const response = await fetchWithJiraAuth(
      `${jiraSiteUrl}/rest/api/3/issue`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(issueData)
      }
    );

    if (!response.ok) {
      let errorMessage = 'Failed to create Jira issue';
      try {
        const errorData = await response.json();
        console.error('Jira issue creation failed:', response.status, errorData);
        
        // Extract detailed error information
        if (errorData.errorMessages && errorData.errorMessages.length > 0) {
          errorMessage = errorData.errorMessages.join('; ');
        } else if (errorData.errors) {
          // Handle field-specific errors
          const fieldErrors = Object.entries(errorData.errors).map(([field, error]) => `${field}: ${error}`);
          errorMessage = fieldErrors.join('; ');
          
          // Retry with alternative issue types on issuetype error
          if (fieldErrors.some(e => e.toLowerCase().includes('issuetype'))) {
            const fallbackTypes = ['Task', 'Bug'];
            for (const fb of fallbackTypes) {
              issueData.fields.issuetype = { name: fb };
              const retry = await fetchWithJiraAuth(
                `${jiraSiteUrl}/rest/api/3/issue`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(issueData)
                }
              );
              if (retry.ok) {
                const okRes = await retry.json();
                if (testCaseId && documentId && session?.user?.id) {
                  try { await db.updateTestcaseSentStatus(session.user.id, documentId, testCaseId, 'jira', true); } catch {}
                }
                return {
                  success: true,
                  message: `Test case sent to Jira project successfully`,
                  issueKey: okRes.key
                };
              }
            }
          }

          // Check if it's a sprint field error
          if (fieldErrors.some(error => error.includes('customfield_10020') || error.includes('sprint'))) {
            console.log(`🎯 SPRINT FIELD ERROR: ${errorMessage}`);
            // Try without sprint assignment
            delete issueData.fields['customfield_10020'];
            console.log('🔄 Retrying without sprint assignment...');
            
            const retryResponse = await fetchWithJiraAuth(
              `${jiraSiteUrl}/rest/api/3/issue`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(issueData)
              }
            );
            
            if (retryResponse.ok) {
              const retryResult = await retryResponse.json();
              console.log(`✅ Issue created without sprint: ${retryResult.key}`);
              
              // Mark test case as sent to Jira if we have the test case ID and document ID
              if (testCaseId && documentId && session?.user?.id) {
                try {
                  await db.updateTestcaseSentStatus(session.user.id, documentId, testCaseId, 'jira', true);
                  console.log(`✅ Marked test case ${testCaseId} as sent to Jira (without sprint)`);
                } catch (error) {
                  console.error('Error updating test case sent status:', error);
                }
              }
              
              return {
                success: true,
                message: `Test case sent to Jira (without sprint assignment)`,
                issueKey: retryResult.key,
                testCaseId
              };
            } else {
              const retryErrorData = await retryResponse.json();
              console.error('Retry failed:', retryResponse.status, retryErrorData);
              errorMessage = `Sprint assignment failed and retry without sprint also failed: ${JSON.stringify(retryErrorData)}`;
            }
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        
        // Check for scope/permission issues
        if (response.status === 401 && (errorMessage.includes('scope') || errorMessage.includes('Unauthorized'))) {
          errorMessage = 'Insufficient permissions to create Jira issues. Please reconnect to Jira to grant the required permissions.';
        }
      } catch (parseError) {
        // If response is not JSON, try to get text content
        try {
          const errorText = await response.text();
          console.error('Jira issue creation failed (non-JSON response):', response.status, errorText);
          
          // Check for scope issues in text response
          if (response.status === 401 && errorText.includes('scope')) {
            errorMessage = 'Insufficient permissions to create Jira issues. Please reconnect to Jira to grant the required permissions.';
          } else {
            errorMessage = `Jira API error: ${errorText.substring(0, 100)}...`;
          }
        } catch (textError) {
          console.error('Jira issue creation failed (unable to parse response):', response.status);
          if (response.status === 401) {
            errorMessage = 'Insufficient permissions to create Jira issues. Please reconnect to Jira to grant the required permissions.';
          }
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Mark test case as sent to Jira if we have the test case ID and document ID
    if (testCaseId && documentId && session?.user?.id) {
      try {
        await db.updateTestcaseSentStatus(session.user.id, documentId, testCaseId, 'jira', true);
        console.log(`✅ Marked test case ${testCaseId} as sent to Jira`);
      } catch (error) {
        console.error('Error updating test case sent status:', error);
        // Don't fail the entire operation if status update fails
      }
    }

    return {
      success: true,
      message: `Test case sent to Jira project successfully`,
      issueKey: result.key
    };

  } catch (error: any) {
    console.error('Error sending test case to Jira:', error);
    return {
      success: false,
      message: 'Failed to send test case to Jira',
      error: error.message
    };
  }
}

/**
 * Send test case to Trello as a card
 */
export async function sendTestCaseToTrelloAction(
  testCase: TestCase, 
  boardId: string, 
  listId: string,
  testCaseId?: string,
  documentId?: string
): Promise<IntegrationSendResponse> {
  try {
    const session = await getServerSession(authConfig);
    const userId = session?.user?.id;
    if (!userId) {
      return {
        success: false,
        message: 'Unauthorized',
        error: 'User not authenticated'
      };
    }
    const integration = await trelloService.getIntegration(userId);
    const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
    
    if (!integration || integration.status !== 'CONNECTED') {
      return {
        success: false,
        message: 'Trello not connected',
        error: 'Please connect Trello in the integrations page first'
      };
    }
    if (!TRELLO_API_KEY) {
      return {
        success: false,
        message: 'Trello API key not configured',
        error: 'Server configuration error'
      };
    }
    
    // Get access token (handles both Nango and DB tokens)
    let trelloToken = integration.accessToken;
    if (integration.metadata?.nangoManaged) {
      const { nangoService } = await import('@/lib/integrations/nango-service');
      const tenantId = integration.metadata.tenantId || 'default';
      trelloToken = await nangoService.getAccessToken('trello', tenantId, userId);
    }
    
    if (!trelloToken) {
      return {
        success: false,
        message: 'Trello not connected',
        error: 'Please connect Trello in the integrations page first'
      };
    }
    // Format test case description for Trello
    const description = `
**Test Case: ${testCase.title}**

**Description:**
${testCase.description}

**Priority:** ${testCase.priority}
**Category:** ${testCase.category}
**Estimated Time:** ${testCase.estimatedTime || 'Not specified'}

**Test Steps:**
${testCase.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

**Expected Result:**
${testCase.expectedResult}

${testCase.preconditions ? `**Preconditions:**\n${testCase.preconditions.map(p => `• ${p}`).join('\n')}\n` : ''}

${testCase.testData ? `**Test Data:**\n${testCase.testData.map(d => `• ${d}`).join('\n')}\n` : ''}

${testCase.tags ? `**Tags:** ${testCase.tags.join(', ')}` : ''}

---
_Generated by UPMY Test Case Generator_
    `.trim();
    // Create Trello card
    const cardData = {
      name: `[TEST] ${testCase.title}`,
      desc: description,
      idList: listId,
      pos: 'top'
    };
    const createCardResponse = await fetch(
      `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${trelloToken}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cardData)
      }
    );
    if (!createCardResponse.ok) {
      let errorMessage = 'Failed to create Trello card';
      const errorText = await createCardResponse.text().catch(() => '');
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = errorText;
        }
      }
      
      // Normalize common Trello error messages
      const lowerError = errorMessage.toLowerCase();
      if (lowerError.includes('unauthorized') || lowerError.includes('unauthoriz')) {
        if (lowerError.includes('permission') || lowerError.includes('card permission')) {
          errorMessage = 'You do not have permission to create cards on this Trello board. Please check your board permissions or try a different board.';
        } else {
          errorMessage = 'Trello connection has expired or is invalid. Please reconnect Trello in the integrations page.';
        }
      } else if (lowerError.includes('invalid token') || lowerError.includes('token')) {
        errorMessage = 'Trello token is invalid or expired. Please reconnect Trello in the integrations page.';
      } else if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
        errorMessage = 'The selected Trello board or list no longer exists. Please select a different board/list.';
      }
      
      console.error(`❌ Trello API Error [${createCardResponse.status}]:`, errorMessage);
      throw new Error(errorMessage);
    }
    
    // Parse response - handle both JSON and plain text
    const responseText = await createCardResponse.text().catch(() => '');
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(responseText || 'Invalid response from Trello API');
    }
    // Mark test case as sent to Trello if we have the test case ID and document ID
    if (testCaseId && documentId) {
      try {
        if (userId) {
          await db.updateTestcaseSentStatus(userId, documentId, testCaseId, 'trello', true);
          console.log(`✅ Marked test case ${testCaseId} as sent to Trello`);
        }
      } catch (error) {
        console.error('Error updating test case sent status:', error);
        // Don't fail the entire operation if status update fails
      }
    }
    return {
      success: true,
      message: `Test case sent to Trello board successfully`,
      cardId: result.id
    };
  } catch (error: any) {
    console.error('Error sending test case to Trello:', error);
    return {
      success: false,
      message: 'Failed to send test case to Trello',
      error: error.message
    };
  }
}

/**
 * Send test case to TestRail as a test case
 */
export async function sendTestCaseToTestRailAction(
  testCase: TestCase, 
  projectId: string,
  sectionId?: string,
  testCaseId?: string,
  documentId?: string
): Promise<IntegrationSendResponse> {
  try {
    const session = await getServerSession(authConfig);
    const userId = session?.user?.id;
    if (!userId) {
      return {
        success: false,
        message: 'Unauthorized',
        error: 'User not authenticated'
      };
    }

    // Import TestRail service
    const { TestRailService } = await import('@/lib/integrations/testrail-service');
    const testrailService = new TestRailService();
    
    const integration = await testrailService.getIntegration(userId);
    if (!integration || integration.status !== 'CONNECTED') {
      return {
        success: false,
        message: 'TestRail not connected',
        error: 'Please connect TestRail in the integrations page first'
      };
    }

    // Get or create a section in the project
    let targetSectionId = sectionId ? parseInt(sectionId) : undefined;
    if (!targetSectionId) {
      // Try to get or create a default section in the project
      try {
        targetSectionId = await testrailService.getOrCreateDefaultSection(integration, parseInt(projectId));
        console.log('TestRail: Using section ID:', targetSectionId);
      } catch (error) {
        console.error('Error getting or creating TestRail section:', error);
        return {
          success: false,
          message: 'Failed to get TestRail section',
          error: 'Unable to find or create a section in the selected project. Please check your TestRail permissions or create a section manually.'
        };
      }
    }

    // Map priority to TestRail priority ID
    const getPriorityId = (priority: string): number => {
      switch (priority.toLowerCase()) {
        case 'critical':
          return 4;
        case 'high':
          return 3;
        case 'medium':
          return 2;
        case 'low':
          return 1;
        default:
          return 2; // Default to medium
      }
    };

    // Format test case for TestRail - start with basic fields
    const testCaseData: any = {
      title: testCase.title,
      template_id: 1, // Default template
      type_id: 1, // Manual test case
      priority_id: getPriorityId(testCase.priority),
      estimate: testCase.estimatedTime || '15m',
    };

    // Try to add custom fields, but don't fail if they don't exist
    const customFields: Array<{ id: number; value: any }> = [];

    // Add description if available
    if (testCase.description) {
      customFields.push({
        id: 1, // Description field
        value: testCase.description
      });
    }

    // Add steps if available
    if (testCase.steps && testCase.steps.length > 0) {
      customFields.push({
        id: 2, // Steps field
        value: testCase.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
      });
    }

    // Add expected result if available
    if (testCase.expectedResult) {
      customFields.push({
        id: 3, // Expected Result field
        value: testCase.expectedResult
      });
    }

    // Add preconditions if available
    if (testCase.preconditions && testCase.preconditions.length > 0) {
      customFields.push({
        id: 4, // Preconditions field
        value: testCase.preconditions.join('\n')
      });
    }

    // Add test data if available
    if (testCase.testData && testCase.testData.length > 0) {
      customFields.push({
        id: 5, // Test Data field
        value: testCase.testData.join('\n')
      });
    }

    // Add tags if available
    if (testCase.tags && testCase.tags.length > 0) {
      customFields.push({
        id: 6, // Tags field
        value: testCase.tags.join(', ')
      });
    }

    // Only add custom_fields if we have any
    if (customFields.length > 0) {
      testCaseData.custom_fields = customFields;
    }

    console.log('TestRail: Creating test case with data:', testCaseData);

    // Create test case in TestRail
    const createdTestCase = await testrailService.createTestCase(
      integration,
      targetSectionId,
      testCaseData
    );

    console.log('TestRail: Test case created successfully:', createdTestCase);

    // Mark test case as sent to TestRail if we have the test case ID and document ID
    if (testCaseId && documentId) {
      try {
        await db.updateTestcaseSentStatus(userId, documentId, testCaseId, 'testrail', true);
        console.log(`✅ Marked test case ${testCaseId} as sent to TestRail`);
      } catch (error) {
        console.error('Error updating test case sent status:', error);
        // Don't fail the entire operation if status update fails
      }
    }

    return {
      success: true,
      message: `Test case sent to TestRail project successfully`,
      testCaseId: createdTestCase.id.toString()
    };

  } catch (error: any) {
    console.error('Error sending test case to TestRail:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message;
    if (error.message.includes('400')) {
      errorMessage = 'Invalid test case data. Please check the test case format.';
    } else if (error.message.includes('401')) {
      errorMessage = 'TestRail authentication failed. Please reconnect your TestRail integration.';
    } else if (error.message.includes('403')) {
      errorMessage = 'You do not have permission to create test cases in this project.';
    } else if (error.message.includes('404')) {
      errorMessage = 'Project or section not found. Please check your TestRail configuration.';
    } else if (error.message.includes('Failed to get or create TestRail section')) {
      errorMessage = 'Unable to create a section in the project. Please create a section manually in TestRail or check your permissions.';
    }
    
    return {
      success: false,
      message: 'Failed to send test case to TestRail',
      error: errorMessage
    };
  }
}

export async function saveGeneratedTestcasesAction({
  documentId,
  documentName,
  testCases
}: {
  documentId: string;
  documentName: string;
  testCases: TestCase[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }
    await db.saveGeneratedTestcases({
      userId: session.user.id,
      documentId,
      documentName,
      testCases
    });
    return { success: true };
  } catch (error) {
    console.error('Error saving generated testcases:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
