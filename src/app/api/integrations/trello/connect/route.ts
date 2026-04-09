import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { trelloService } from '@/lib/integrations/trello-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accessToken, refreshToken, expiresAt, serverUrl, consumerKey, metadata } = await request.json()

    if (!accessToken || !consumerKey) {
      return NextResponse.json(
        { error: 'Access token and consumer key are required' },
        { status: 400 }
      )
    }

    // Store integration in database
    const integration = await trelloService.storeIntegration(session.user.id, {
      accessToken,
      refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      serverUrl,
      consumerKey,
      metadata,
    })

    // Fetch and store boards
    const boards = await trelloService.fetchAndStoreBoards(session.user.id)

    return NextResponse.json({
      message: 'Trello integration connected successfully',
      integration: {
        id: integration._id.toString(),
        type: integration.type,
        status: integration.status,
        serverUrl: integration.serverUrl,
      },
      boards: boards.map(board => ({
        id: board.id,
        name: board.name,
        desc: board.desc,
        url: board.url,
        shortUrl: board.shortUrl,
        closed: board.closed,
      })),
    })
  } catch (error) {
    console.error('Trello connection error:', error)
    return NextResponse.json(
      { error: 'Failed to connect Trello integration' },
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

    console.log('Trello Disconnect: Disconnecting user:', session.user.id)
    
    // Get tenant ID from request or URL
    const tenantId = request.nextUrl.searchParams.get('tenantId') || 'default'
    
    try {
      // First, try to disconnect from Nango (if connected via Nango)
      try {
        const { trelloNangoService } = await import('@/lib/integrations/trello-nango-service')
        const isNangoConnected = await trelloNangoService.getConnectionStatus(session.user.id, tenantId)
        
        if (isNangoConnected.connected) {
          console.log('Trello Disconnect: Disconnecting from Nango')
          await trelloNangoService.disconnect(session.user.id, tenantId)
          console.log('Trello Disconnect: Successfully disconnected from Nango')
        }
      } catch (nangoError) {
        console.log('Trello Disconnect: Not connected via Nango or Nango disconnect failed:', nangoError)
        // Continue to database disconnect
      }
      
      // Also remove from database (old integrations)
      await trelloService.removeIntegration(session.user.id)
      console.log('Trello Disconnect: Successfully disconnected from database')
      
      return NextResponse.json({
        success: true,
        message: 'Trello integration disconnected successfully',
      })
    } catch (error) {
      console.error('Trello Disconnect: Error during disconnect:', error)
      
      // Don't return an error for disconnect operations - just log it
      return NextResponse.json({
        success: true,
        message: 'Trello integration disconnected successfully',
      })
    }
  } catch (error) {
    console.error('Trello disconnection error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect Trello integration' },
      { status: 500 }
    )
  }
} 