import { db } from '../db/database'
import type { 
  TestRailProject, 
  TestRailTestCase, 
  TestRailSuite,
  TestRailSection,
  TestRailRun,
  DetailedTestRailProject
} from '@/types/integrations'
import type { Integration } from '@/lib/db/database'

export class TestRailService {
  /**
   * Store TestRail integration data for a user
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
      const integration = await db.upsertIntegration(userId, 'TESTRAIL', {
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
      console.error('Error storing TestRail integration:', error)
      throw new Error('Failed to store TestRail integration')
    }
  }

  /**
   * Get TestRail integration for a user
   */
  async getIntegration(userId: string): Promise<Integration | null> {
    try {
      const integrations = await db.findIntegrationsByUserId(userId)
      return integrations.find(integration => integration.type === 'TESTRAIL') || null
    } catch (error) {
      console.error('Error getting TestRail integration:', error)
      return null
    }
  }

  /**
   * Test TestRail connection and API key format
   */
  async testConnection(integration: Integration): Promise<boolean> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const authHeader = integration.accessToken || ''
      console.log('TestRail: API key format test - length:', authHeader.length, 'starts with:', authHeader.substring(0, 5))
      
      // Validate API key format first
      if (!this.validateApiKey(authHeader)) {
        console.log('TestRail: API key format validation failed')
        return false
      }
      
      // Try different API endpoints and authentication methods
      const testConfigs = [
        // TestRail Cloud format
        {
          name: 'TestRail Cloud - Bearer',
          url: `${baseUrl}/api/v2/get_case/1`,
          auth: `Bearer ${authHeader}`
        },
        {
          name: 'TestRail Cloud - Basic',
          url: `${baseUrl}/api/v2/get_case/1`,
          auth: `Basic ${Buffer.from(`${integration.consumerKey}:${authHeader}`).toString('base64')}`
        },
        // Traditional TestRail format
        {
          name: 'Traditional - Bearer',
          url: `${baseUrl}/index.php?/api/v2/get_case/1`,
          auth: `Bearer ${authHeader}`
        },
        {
          name: 'Traditional - Basic',
          url: `${baseUrl}/index.php?/api/v2/get_case/1`,
          auth: `Basic ${Buffer.from(`${integration.consumerKey}:${authHeader}`).toString('base64')}`
        },
        // Try with different API versions
        {
          name: 'API v1 - Basic',
          url: `${baseUrl}/index.php?/api/v1/get_case/1`,
          auth: `Basic ${Buffer.from(`${integration.consumerKey}:${authHeader}`).toString('base64')}`
        },
        {
          name: 'API v1 - Bearer',
          url: `${baseUrl}/index.php?/api/v1/get_case/1`,
          auth: `Bearer ${authHeader}`
        }
      ]
      
      for (const config of testConfigs) {
        console.log(`TestRail: Testing ${config.name}...`)
        console.log(`TestRail: URL: ${config.url}`)
        
        const response = await fetch(config.url, {
          headers: {
            'Authorization': config.auth,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        })
        
        console.log(`TestRail: ${config.name} response status:`, response.status)
        
        // If we get a 404, it means authentication worked but the test case doesn't exist
        // If we get a 401, authentication failed
        // If we get a 403, authentication worked but no permission
        if (response.status === 404) {
          console.log(`TestRail: ${config.name} authentication successful (404 expected for test case)`)
          return true
        } else if (response.status === 403) {
          console.log(`TestRail: ${config.name} authentication successful (403 - permission issue)`)
          return true
        } else if (response.status === 401) {
          console.log(`TestRail: ${config.name} authentication failed`)
          continue
        } else if (response.status === 200) {
          console.log(`TestRail: ${config.name} authentication successful (200 - unexpected but good)`)
          return true
        }
      }
      
      console.log('TestRail: All authentication methods failed')
      return false
    } catch (error) {
      console.error('TestRail: Connection test failed:', error)
      return false
    }
  }

  /**
   * Validate TestRail API key format
   */
  private validateApiKey(apiKey: string): boolean {
    // TestRail API keys are typically 20-50 characters
    if (!apiKey || apiKey.length < 10 || apiKey.length > 100) {
        console.log('TestRail: API key length invalid:', apiKey.length)
        return false
    }

    // Include common characters found in API keys: base64 chars, special chars
    const validChars = /^[a-zA-Z0-9\-_\.\/\+=]+$/
    if (!validChars.test(apiKey)) {
        console.log('TestRail: API key contains invalid characters')
        return false
    }

    console.log('TestRail: API key format appears valid')
    return true
}


  /**
   * Fetch projects from TestRail API
   */
  async fetchProjectsFromTestRail(integration: Integration): Promise<TestRailProject[]> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const authHeader = integration.accessToken || ''
      
      // Try different project endpoints - TestRail instances might use different endpoints
      const endpointConfigs = [
        {
          name: 'Traditional format',
          url: `${baseUrl}/index.php?/api/v2/get_projects`
        },
        {
          name: 'Modern format', 
          url: `${baseUrl}/api/v2/get_projects`
        },
        {
          name: 'API v1 format',
          url: `${baseUrl}/index.php?/api/v1/get_projects`
        },
        {
          name: 'Projects endpoint',
          url: `${baseUrl}/index.php?/api/v2/get_projects`
        },
        {
          name: 'Alternative projects endpoint',
          url: `${baseUrl}/api/v2/projects`
        },
        {
          name: 'User projects endpoint',
          url: `${baseUrl}/index.php?/api/v2/get_projects&is_completed=0`
        },
        {
          name: 'Active projects endpoint',
          url: `${baseUrl}/index.php?/api/v2/get_projects&is_completed=0&is_active=1`
        }
      ]
  
      for (const config of endpointConfigs) {
        console.log(`TestRail: Trying ${config.name}: ${config.url}`)
        
        // Try Bearer authentication first (since it worked in connection test)
        const response = await fetch(config.url, {
          headers: {
            'Authorization': `Bearer ${authHeader}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        })
        
        console.log(`TestRail: Response status (Bearer, ${config.name}):`, response.status)
        
        if (response.ok) {
          const projects = await response.json()
          console.log(`TestRail: Successfully fetched projects with ${config.name}:`, projects.length)
          return Array.isArray(projects) ? projects : projects.projects || []
        }
        
        // If Bearer fails with this endpoint, try Basic auth
        if (response.status === 401 || response.status === 403) {
          console.log(`TestRail: Bearer auth failed for ${config.name}, trying Basic auth...`)
          const basicAuth = Buffer.from(`${integration.consumerKey}:${authHeader}`).toString('base64')
          const basicResponse = await fetch(config.url, {
            headers: {
              'Authorization': `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          })
          
          if (basicResponse.ok) {
            const projects = await basicResponse.json()
            console.log(`TestRail: Successfully fetched projects with Basic auth (${config.name}):`, projects.length)
            return Array.isArray(projects) ? projects : projects.projects || []
          }
        }
        
        // If we get 404, this endpoint format doesn't exist - try next format
        if (response.status === 404) {
          console.log(`TestRail: Endpoint ${config.name} not found (404), trying next format...`)
          continue
        }
      }
      
      // If all project endpoints fail, try to get user info first
      console.log('TestRail: All project endpoints failed, trying to get user info...')
      const userResponse = await fetch(`${baseUrl}/index.php?/api/v2/get_user_by_email&email=${encodeURIComponent(integration.consumerKey || '')}`, {
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
      
      if (userResponse.ok) {
        const userData = await userResponse.json()
        console.log('TestRail: User data retrieved:', userData)
        
        // Try to get projects for this specific user
        if (userData && userData.id) {
          const userProjectsResponse = await fetch(`${baseUrl}/index.php?/api/v2/get_projects&user_id=${userData.id}`, {
            headers: {
              'Authorization': `Bearer ${authHeader}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          })
          
          if (userProjectsResponse.ok) {
            const projects = await userProjectsResponse.json()
            console.log('TestRail: Successfully fetched user projects:', projects.length)
            return Array.isArray(projects) ? projects : projects.projects || []
          }
        }
      }
      
      // If all endpoint formats fail, try to get a list of available endpoints
      console.log('TestRail: All project endpoints failed, trying to discover available endpoints...')
      const discoveryResponse = await fetch(`${baseUrl}/api/v2/`, {
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
      
      if (discoveryResponse.ok) {
        const discoveryData = await discoveryResponse.text()
        console.log('TestRail: Available endpoints:', discoveryData)
      }
      
      // If all endpoint formats fail
      throw new Error(`TestRail API error: No working endpoint found for get_projects`)
      
    } catch (error) {
      console.error('Error fetching TestRail projects:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to fetch TestRail projects: ${errorMessage}`)
    }
  }
  
  
  

  /**
   * Fetch test cases from TestRail API
   */
  async fetchTestCasesFromTestRail(integration: Integration, projectId: number): Promise<TestRailTestCase[]> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/get_cases/${projectId}`
      const authHeader = integration.accessToken || ''
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`TestRail API error: ${response.status}`)
      }

      const testCases = await response.json()
      return testCases
    } catch (error) {
      console.error('Error fetching TestRail test cases:', error)
      throw new Error('Failed to fetch TestRail test cases')
    }
  }

  /**
   * Fetch suites from TestRail API
   */
  async fetchSuitesFromTestRail(integration: Integration, projectId: number): Promise<TestRailSuite[]> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/get_suites/${projectId}`
      const authHeader = integration.accessToken || ''
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`TestRail API error: ${response.status}`)
      }

      const suites = await response.json()
      return suites
    } catch (error) {
      console.error('Error fetching TestRail suites:', error)
      throw new Error('Failed to fetch TestRail suites')
    }
  }

  /**
   * Fetch and store TestRail projects for a user
   */
  async fetchAndStoreProjects(userId: string): Promise<TestRailProject[]> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        throw new Error('TestRail integration not connected')
      }

      // Fetch projects from TestRail API
      const projects = await this.fetchProjectsFromTestRail(integration)
      
      console.log('TestRail: Fetched projects:', projects)
      
      // Handle empty projects list
      if (!projects || projects.length === 0) {
        console.log('TestRail: No projects found, but connection is successful')
        return []
      }
      
      // Store projects in database
      for (const project of projects) {
        await db.upsertProject(userId, integration._id.toString(), {
          externalId: project.id.toString(),
          name: project.name,
          key: project.id.toString(),
          description: project.announcement,
          avatarUrl: undefined,
          isActive: !project.is_completed,
          lastSyncAt: new Date(),
          integrationType: 'TESTRAIL',  // Store type directly for reliable filtering
        })
      }

      return projects
    } catch (error) {
      console.error('Error fetching and storing TestRail projects:', error)
      throw new Error('Failed to fetch TestRail projects')
    }
  }

  /**
   * Create a test case in TestRail
   */
  async createTestCase(integration: Integration, sectionId: number, testCaseData: {
    title: string
    template_id?: number
    type_id?: number
    priority_id?: number
    estimate?: string
    milestone_id?: number
    refs?: string
    custom_steps_separated?: Array<{ content: string; expected: string }>
    custom_preconds?: string
    custom_fields?: Array<{ id: number; value: any }>
  }): Promise<TestRailTestCase> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/add_case/${sectionId}`
      const username = integration.consumerKey || ''
      const password = integration.accessToken || ''
      
      console.log('TestRail: Creating test case at:', url)
      console.log('TestRail: Test case data:', testCaseData)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCaseData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('TestRail test case creation failed:', response.status, errorText)
        throw new Error(`TestRail API error: ${response.status} - ${errorText}`)
      }

      const testCase = await response.json()
      console.log('TestRail: Created test case:', testCase)
      return testCase
    } catch (error) {
      console.error('Error creating TestRail test case:', error)
      throw new Error(`Failed to create TestRail test case: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a test case in TestRail
   */
  async updateTestCase(integration: Integration, caseId: number, testCaseData: {
    title?: string
    template_id?: number
    type_id?: number
    priority_id?: number
    estimate?: string
    milestone_id?: number
    refs?: string
    custom_steps_separated?: Array<{ content: string; expected: string }>
    custom_preconds?: string
    custom_fields?: Array<{ id: number; value: any }>
  }): Promise<TestRailTestCase> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/update_case/${caseId}`
      const username = integration.consumerKey || ''
      const password = integration.accessToken || ''
      
      console.log('TestRail: Updating test case at:', url)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCaseData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('TestRail test case update failed:', response.status, errorText)
        throw new Error(`TestRail API error: ${response.status} - ${errorText}`)
      }

      const testCase = await response.json()
      return testCase
    } catch (error) {
      console.error('Error updating TestRail test case:', error)
      throw new Error(`Failed to update TestRail test case: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Fetch sections for a TestRail project
   */
  async fetchSectionsFromTestRail(integration: Integration, projectId: number): Promise<any[]> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/get_sections/${projectId}`
      const username = integration.consumerKey || ''
      const password = integration.accessToken || ''
      
      console.log('TestRail: Fetching sections from:', url)
      console.log('TestRail: Using Basic auth with username:', username)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('TestRail API error response:', response.status, errorText)
        throw new Error(`TestRail API error: ${response.status} - ${errorText}`)
      }

      const sections = await response.json()
      console.log('TestRail: Found sections:', sections)
      return sections
    } catch (error) {
      console.error('Error fetching TestRail sections:', error)
      throw new Error(`Failed to fetch TestRail sections: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a section in TestRail
   */
  async createSection(integration: Integration, projectId: number, sectionData: {
    name: string
    description?: string
    parent_id?: number
  }): Promise<any> {
    try {
      let baseUrl = integration.serverUrl || ''
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }
      
      const url = `${baseUrl}/index.php?/api/v2/add_section/${projectId}`
      const username = integration.consumerKey || ''
      const password = integration.accessToken || ''
      
      console.log('TestRail: Creating section at:', url)
      console.log('TestRail: Section data:', sectionData)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sectionData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('TestRail section creation failed:', response.status, errorText)
        throw new Error(`TestRail API error: ${response.status} - ${errorText}`)
      }

      const section = await response.json()
      console.log('TestRail: Created section:', section)
      return section
    } catch (error) {
      console.error('Error creating TestRail section:', error)
      throw new Error(`Failed to create TestRail section: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get or create a default section for a project
   */
  async getOrCreateDefaultSection(integration: Integration, projectId: number): Promise<number> {
    try {
      console.log(`TestRail: Getting or creating default section for project ${projectId}`)
      
      // First, try to get existing sections
      const sections = await this.fetchSectionsFromTestRail(integration, projectId)
      
      if (sections && sections.length > 0) {
        console.log(`TestRail: Found ${sections.length} existing sections, using first one: ${sections[0].name} (ID: ${sections[0].id})`)
        // Return the first section
        return sections[0].id
      }
      
      // If no sections exist, create a default one
      console.log('TestRail: No sections found, creating default section')
      const defaultSection = await this.createSection(integration, projectId, {
        name: 'Default Section',
        description: 'Default section for test cases created by UPMY'
      })
      
      console.log(`TestRail: Successfully created default section: ${defaultSection.name} (ID: ${defaultSection.id})`)
      return defaultSection.id
    } catch (error) {
      console.error('Error getting or creating default section:', error)
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error('TestRail authentication failed. Please check your API key and permissions.')
        } else if (error.message.includes('403')) {
          throw new Error('Insufficient permissions to access TestRail sections. Please check your user permissions.')
        } else if (error.message.includes('404')) {
          throw new Error('TestRail project not found. Please check the project ID.')
        } else {
          throw new Error(`TestRail API error: ${error.message}`)
        }
      }
      
      throw new Error('Unable to find or create a section in the selected project. Please check your TestRail permissions or create a section manually.')
    }
  }

  /**
   * Remove TestRail integration for a user
   */
  async removeIntegration(userId: string): Promise<void> {
    try {
      if (!userId) {
        console.log('TestRail: No userId provided for removeIntegration')
        return
      }
      
      const integrations = await db.findIntegrationsByUserId(userId)
      const testrailIntegration = integrations.find(integration => integration.type === 'TESTRAIL')
      
      if (testrailIntegration) {
        await db.deleteIntegration(testrailIntegration._id.toString())
        console.log('TestRail: Successfully removed integration for user:', userId)
      } else {
        console.log('TestRail: No TestRail integration found for user:', userId)
        // Don't throw an error if no integration exists - this is a valid state
      }
    } catch (error) {
      console.error('Error removing TestRail integration:', error)
      // Don't throw an error for disconnect operations - just log it
      // This prevents the UI from showing error messages for normal disconnect operations
    }
  }

  /**
   * Check if user has active TestRail integration
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const integration = await this.getIntegration(userId)
      if (!integration || integration.status !== 'CONNECTED') {
        return false
      }

      // Validate credentials by making a simple API call
      try {
        let baseUrl = integration.serverUrl || ''
        if (baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1)
        }
        const url = `${baseUrl}/index.php?/api/v2/get_user_by_email&email=${integration.consumerKey}`
        const response = await fetch(url, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${integration.consumerKey}:${integration.accessToken}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          console.error('TestRail credentials validation failed:', response.status)
          
          // Only disconnect on clear authentication errors
          if (response.status === 401 || response.status === 403) {
            console.log('TestRail: Clear authentication failure, disconnecting integration')
            await this.removeIntegration(userId)
            return false
          }
          
          // For other errors (network, API issues), keep the integration connected
          console.log('TestRail: Non-authentication error, keeping integration connected')
          return true
        }
        
        return true
      } catch (apiError) {
        console.error('TestRail API validation failed:', apiError)
        
        // For network errors, keep the integration connected
        console.log('TestRail: Network error, keeping integration connected')
        return true
      }
    } catch (error) {
      console.error('Error checking TestRail connection:', error)
      return false
    }
  }
}

export const testrailService = new TestRailService() 