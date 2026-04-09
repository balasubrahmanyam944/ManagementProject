/**
 * Trello Polling Start API
 * Starts polling for Trello boards when webhooks aren't working
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { startPollingForUser } from '@/lib/services/trello-polling-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    
    console.log('🔄 TRELLO POLLING START API: Request received for user', userId)
    
    // Start polling for user's Trello boards
    await startPollingForUser(userId)
    
    console.log('✅ TRELLO POLLING START API: Successfully started polling for user', userId)
    
    return NextResponse.json({
      success: true,
      message: 'Polling started for all Trello boards',
      userId,
    })
  } catch (error) {
    console.error('❌ TRELLO POLLING START API: Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start polling' },
      { status: 500 }
    )
  }
}

