import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { nanoid } from 'nanoid';
import { getJiraProjectDetailsAction } from '@/lib/integrations/jira-integration';
import { getTrelloProjectDetailsAction } from '@/lib/integrations/trello-integration';
import { getTestRailProjectDetailsAction } from '@/lib/integrations/testrail-integration';
import { getCollection } from '@/lib/db/mongodb';
import { convertTrelloCardsToIssues } from '@/lib/chart-data-utils';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { projectId, projectType } = await request.json();
    if (!projectId || !projectType) {
      return NextResponse.json({ error: 'Missing projectId or projectType' }, { status: 400 });
    }
    let projectData, issues, analytics, name, key, externalId, description;
    if (projectType === 'jira') {
      const response = await getJiraProjectDetailsAction(projectId);
      if (!response.success || !response.project) {
        return NextResponse.json({ error: response.error || 'Failed to fetch Jira project' }, { status: 404 });
      }
      projectData = response.project;
      issues = response.issues || [];
      analytics = projectData.analytics || {};
      name = projectData.name;
      key = projectData.key;
      externalId = projectData.id;
      description = projectData.description;
    } else if (projectType === 'trello') {
      const response = await getTrelloProjectDetailsAction(projectId);
      if (!response.success || !response.project) {
        return NextResponse.json({ error: response.error || 'Failed to fetch Trello board' }, { status: 404 });
      }
      projectData = response.project;
      // Convert Trello cards to Jira-like issues for chart compatibility
      issues = convertTrelloCardsToIssues(response.cards || []);
      // Ensure analytics has all required fields for Trello
      const baseAnalytics: any = projectData.analytics || {};
      analytics = {
        totalIssues: baseAnalytics?.totalIssues || 0,
        openIssues: baseAnalytics?.openIssues || 0,
        inProgressIssues: baseAnalytics?.inProgressIssues || 0,
        doneIssues: baseAnalytics?.doneIssues || 0,
        statusCounts: baseAnalytics?.statusCounts || {},
        typeCounts: baseAnalytics?.typeCounts || {},
        dataSource: baseAnalytics?.dataSource || 'live',
        lastUpdated: baseAnalytics?.lastUpdated || new Date().toISOString(),
      };
      name = projectData.name;
      key = undefined;
      externalId = projectData.id;
      description = projectData.desc;
    } else if (projectType === 'testrail') {
      const response = await getTestRailProjectDetailsAction(projectId);
      if (!response.success || !response.project) {
        return NextResponse.json({ error: response.error || 'Failed to fetch TestRail project' }, { status: 404 });
      }
      projectData = response.project;
      // Convert TestRail test cases to Jira-like issues for chart compatibility
      issues = convertTestRailTestCasesToIssues(response.testCases || []);
      // Ensure analytics has all required fields for TestRail
      const baseAnalytics: any = projectData.analytics || {};
      analytics = {
        totalIssues: baseAnalytics?.totalTestCases || 0,
        openIssues: baseAnalytics?.untestedTestCases || 0,
        inProgressIssues: baseAnalytics?.blockedTestCases || 0,
        doneIssues: baseAnalytics?.passedTestCases || 0,
        statusCounts: baseAnalytics?.statusCounts || {},
        typeCounts: baseAnalytics?.typeCounts || {},
        dataSource: baseAnalytics?.dataSource || 'live',
        lastUpdated: baseAnalytics?.lastUpdated || new Date().toISOString(),
      };
      name = projectData.name;
      key = undefined;
      externalId = projectData.id.toString();
    } else {
      return NextResponse.json({ error: 'Invalid project type' }, { status: 400 });
    }
    // Generate a unique shareId
    const shareId = nanoid(12);
    // Ensure analytics has all required fields
    const analyticsFull: any = analytics || {};
    const {
      totalIssues = 0,
      openIssues = 0,
      inProgressIssues = 0,
      doneIssues = 0,
      statusCounts = {},
      typeCounts = {},
      dataSource = 'live',
      lastUpdated = new Date().toISOString(),
    } = analyticsFull;
    // Build the snapshot
    const sharedProject = {
      shareId,
      projectId,
      projectType,
      name,
      key,
      externalId,
      description,
      analytics: {
        totalIssues,
        openIssues,
        inProgressIssues,
        doneIssues,
        statusCounts,
        typeCounts,
        dataSource,
        lastUpdated,
      },
      issues,
      sharedAt: new Date(),
      sharedBy: session.user.email,
      expiresAt: undefined, // Optionally set an expiry
    };
    // Store in DB (in a new collection 'shared_projects')
    const collection = await getCollection('shared_projects');
    await collection.insertOne(sharedProject);
    // Return the share URL - use public URL that works from any browser
    // Priority: 1) Custom share URL, 2) Request origin (what user is accessing), 3) ngrok URL, 4) env vars
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const protocol = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http');
    
    let publicUrl = process.env.NEXT_PUBLIC_SHARE_URL;
    
    if (!publicUrl && host) {
      // Use the actual host the user is accessing (works for ngrok, domain, etc.)
      publicUrl = `${protocol}://${host}`;
    }
    
    if (!publicUrl) {
      // Fallback to ngrok URL or env vars
      publicUrl = process.env.NEXT_PUBLIC_NANGO_SERVER_URL?.replace('/oauth', '').replace(/\/$/, '') ||
                 process.env.NEXT_PUBLIC_APP_URL || 
                 process.env.APP_URL || 
                 'http://localhost:9003';
    }
    
    const shareUrl = `${publicUrl}/shared/project/${shareId}`;
    return NextResponse.json({ shareUrl, shareId });
  } catch (error) {
    console.error('Error creating shared project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');
    
    if (!shareId) {
      return NextResponse.json({ error: 'Missing shareId parameter' }, { status: 400 });
    }
    
    // Fetch the shared project from database
    const collection = await getCollection('shared_projects');
    const sharedProject = await collection.findOne({ shareId });
    
    if (!sharedProject) {
      return NextResponse.json({ error: 'Shared project not found' }, { status: 404 });
    }
    
    // Check if expired
    if (sharedProject.expiresAt && new Date(sharedProject.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Shared project has expired' }, { status: 410 });
    }
    
    return NextResponse.json({
      success: true,
      data: sharedProject
    });
  } catch (error) {
    console.error('Error fetching shared project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 

// Helper function to convert TestRail test cases to Jira-like issues
function convertTestRailTestCasesToIssues(testCases: any[]): any[] {
  return testCases.map(testCase => ({
    id: testCase.id.toString(),
    key: `TC-${testCase.id}`,
    summary: testCase.title,
    status: {
      id: testCase.status?.id || 1,
      name: testCase.status?.name || 'Untested'
    },
    issuetype: {
      id: testCase.type_id || 1,
      name: testCase.type_id === 1 ? 'Automated' : 'Manual'
    },
    assignee: null,
    priority: {
      id: testCase.priority_id || 1,
      name: getPriorityName(testCase.priority_id)
    },
    created: new Date(testCase.created_on * 1000).toISOString(),
    updated: new Date(testCase.updated_on * 1000).toISOString(),
    description: '',
    project: {
      id: testCase.suite_id,
      key: testCase.suite_id.toString(),
      name: 'TestRail Project'
    }
  }));
}

function getPriorityName(priorityId: number): string {
  switch (priorityId) {
    case 1: return 'Low';
    case 2: return 'Medium';
    case 3: return 'High';
    case 4: return 'Critical';
    default: return 'Medium';
  }
} 