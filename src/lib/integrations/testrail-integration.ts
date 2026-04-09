'use server'

import { TestRailService } from './testrail-service'
import { db } from '../db/database'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import type { 
  DetailedTestRailProject, 
  TestRailTestCase 
} from '@/types/integrations'

export async function getTestRailProjectDetailsAction(projectId: string) {
  try {
    console.log('getTestRailProjectDetailsAction called for project:', projectId);
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    const testrailService = new TestRailService()
    const integration = await testrailService.getIntegration(session.user.id)
    
    if (!integration || integration.status !== 'CONNECTED') {
      return { success: false, error: 'TestRail integration not connected' }
    }

    // Get project from database
    const projects = await db.findProjectsByUserId(session.user.id)
    const project = projects.find(p => p.externalId === projectId && p.isActive)
    
    if (!project) {
      return { success: false, error: 'Project not found' }
    }

    // Fetch test cases from TestRail API
    const testCases = await fetchTestRailTestCases(integration, parseInt(projectId))
    console.log('Test cases fetched for project', projectId, ':', testCases.length, testCases[0]);

    // Calculate analytics for TestRail project
    const analytics = calculateTestRailAnalytics(testCases);

    const detailedProject: DetailedTestRailProject = {
      id: parseInt(project.externalId) || 0,
      name: project.name,
      announcement: project.description || '',
      show_announcement: false,
      is_completed: false,
      completed_on: undefined,
      suite_mode: 1,
      url: `https://your-testrail-instance.testrail.io/index.php?/projects/overview/${projectId}`,
      analytics
    }

    return {
      success: true,
      project: detailedProject,
      testCases: testCases,
      message: 'Project details loaded successfully'
    }
  } catch (error) {
    console.error('Error getting TestRail project details:', error)
    return { success: false, error: 'Failed to load project details' }
  }
}

export async function fetchTestRailTestCases(integration: any, projectId: number): Promise<TestRailTestCase[]> {
  try {
    let baseUrl = integration.serverUrl || ''
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1)
    }
    
    const url = `${baseUrl}/index.php?/api/v2/get_cases/${projectId}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${integration.consumerKey}:${integration.accessToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`TestRail API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.cases || []
  } catch (error) {
    console.error('Error fetching TestRail test cases for project', projectId, ':', error)
    return []
  }
}

// Add analytics calculation helper
function calculateTestRailAnalytics(testCases: TestRailTestCase[]) {
  const totalTestCases = testCases.length;
  let automatedTestCases = 0, manualTestCases = 0, passedTestCases = 0, failedTestCases = 0, blockedTestCases = 0, untestedTestCases = 0;
  
  for (const testCase of testCases) {
    // Determine if automated based on custom fields or type_id
    if (testCase.type_id === 1) { // Assuming type_id 1 is automated
      automatedTestCases++;
    } else {
      manualTestCases++;
    }
    
    // Determine status based on custom fields or status
    if (testCase.status) {
      const statusName = testCase.status.name.toLowerCase();
      if (statusName.includes('passed') || statusName.includes('pass')) {
        passedTestCases++;
      } else if (statusName.includes('failed') || statusName.includes('fail')) {
        failedTestCases++;
      } else if (statusName.includes('blocked') || statusName.includes('block')) {
        blockedTestCases++;
      } else {
        untestedTestCases++;
      }
    } else {
      untestedTestCases++;
    }
  }
  
  return { 
    totalTestCases, 
    automatedTestCases, 
    manualTestCases, 
    passedTestCases, 
    failedTestCases, 
    blockedTestCases, 
    untestedTestCases 
  };
} 