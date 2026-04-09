import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { trelloService } from '@/lib/integrations/trello-service'
import { db } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the current Trello integration
    const integration = await trelloService.getIntegration(session.user.id)
    
    if (!integration || integration.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Trello integration not connected' }, { status: 400 })
    }

    // Update the integration with missing fields if needed
    if (!integration.serverUrl || !integration.consumerKey) {
      console.log('🔧 Updating Trello integration with missing fields')
      await db.upsertIntegration(session.user.id, 'TRELLO', {
        status: 'CONNECTED',
        accessToken: integration.accessToken,
        expiresAt: integration.expiresAt,
        serverUrl: 'https://api.trello.com',
        consumerKey: process.env.TRELLO_API_KEY || '',
        metadata: integration.metadata,
        lastSyncAt: new Date(),
      })
    }

    // Fetch and store boards
    console.log('🔄 Syncing Trello boards')
    const boards = await trelloService.fetchAndStoreBoards(session.user.id)
    
    console.log(`✅ Successfully synced ${boards.length} Trello boards`)

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${boards.length} Trello boards`,
      boards: boards.map(board => ({
        id: board.id,
        name: board.name,
        desc: board.desc,
        url: board.url,
        shortUrl: board.shortUrl,
        closed: board.closed
      }))
    })
  } catch (error) {
    console.error('Error syncing Trello boards:', error)
    return NextResponse.json(
      { error: 'Failed to sync Trello boards', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 