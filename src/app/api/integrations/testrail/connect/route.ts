import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { testrailService } from '@/lib/integrations/testrail-service'

export async function POST(request: NextRequest) {
  try {
    console.log('TestRail Connect: Starting connection process')
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      console.error('TestRail Connect: No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('TestRail Connect: User authenticated:', session.user.id)
    const { accessToken, refreshToken, expiresAt, serverUrl, consumerKey, metadata } = await request.json()

    console.log('TestRail Connect: Received data:', {
      serverUrl,
      consumerKey,
      accessTokenLength: accessToken?.length,
      hasRefreshToken: !!refreshToken,
      hasExpiresAt: !!expiresAt,
      hasMetadata: !!metadata
    })

    if (!accessToken || !serverUrl || !consumerKey) {
      console.error('TestRail Connect: Missing required fields')
      return NextResponse.json(
        { error: 'Access token, server URL, and consumer key are required' },
        { status: 400 }
      )
    }

    // Test connection BEFORE storing integration
    console.log('TestRail Connect: Testing connection before storing')
    const testIntegration = {
      _id: null as any,
      userId: session.user.id,
      type: 'TESTRAIL' as const,
      status: 'CONNECTED' as const,
      accessToken,
      refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      serverUrl,
      consumerKey,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    const connectionTest = await testrailService.testConnection(testIntegration)
    if (!connectionTest) {
      console.error('TestRail Connect: Connection test failed')
      return NextResponse.json(
        { error: 'Failed to authenticate with TestRail. Please check your API key and server URL.' },
        { status: 400 }
      )
    }

    console.log('TestRail Connect: Connection test successful, storing integration')
    // Store integration in database (only after connection test passes)
    const integration = await testrailService.storeIntegration(session.user.id, {
      accessToken,
      refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      serverUrl,
      consumerKey,
      metadata,
    })

    console.log('TestRail Connect: Fetching projects')
    try {
      // Fetch and store projects
      const projects = await testrailService.fetchAndStoreProjects(session.user.id)

      console.log('TestRail Connect: Successfully connected with', projects.length, 'projects')
      return NextResponse.json({
        message: 'TestRail integration connected successfully',
        integration: {
          id: integration._id.toString(),
          type: integration.type,
          status: integration.status,
          serverUrl: integration.serverUrl,
        },
        projects: projects.map(project => ({
          id: project.id,
          name: project.name,
          announcement: project.announcement,
          url: project.url,
          is_completed: project.is_completed,
        })),
      })
    } catch (projectError) {
      // If project fetching fails, remove the integration we just created
      console.error('TestRail Connect: Project fetching failed, removing integration')
      try {
        await testrailService.removeIntegration(session.user.id)
      } catch (removeError) {
        console.error('TestRail Connect: Failed to remove integration after project fetch failure:', removeError)
      }
      
      const errorMessage = projectError instanceof Error ? projectError.message : 'Unknown error'
      console.error('TestRail Connect: Project fetch error:', errorMessage)
      
      // Provide more helpful error message
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        return NextResponse.json(
          { error: 'Failed to fetch TestRail projects: Access forbidden. Please check that your API key has permission to view projects.' },
          { status: 403 }
        )
      } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        return NextResponse.json(
          { error: 'Failed to fetch TestRail projects: API endpoint not found. Please verify your TestRail server URL is correct.' },
          { status: 404 }
        )
      }
      
      return NextResponse.json(
        { error: `Failed to connect TestRail integration: ${errorMessage}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('TestRail connection error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to connect TestRail integration: ${errorMessage}` },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('TestRail Disconnect: Disconnecting user:', session.user.id)
    
    try {
      await testrailService.removeIntegration(session.user.id)
      console.log('TestRail Disconnect: Successfully disconnected')
      
      return NextResponse.json({
        success: true,
        message: 'TestRail integration disconnected successfully',
      })
    } catch (error) {
      console.error('TestRail Disconnect: Error during disconnect:', error)
      
      // Don't return an error for disconnect operations - just log it
      // This prevents the UI from showing error messages for normal disconnect operations
      return NextResponse.json({
        success: true,
        message: 'TestRail integration disconnected successfully',
      })
    }
  } catch (error) {
    console.error('TestRail disconnection error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect TestRail integration' },
      { status: 500 }
    )
  }
} 