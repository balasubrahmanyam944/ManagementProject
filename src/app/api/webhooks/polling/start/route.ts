/**
 * Start Jira Polling API
 * Starts polling for changes in user's Jira projects
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { startPollingForUser } from '@/lib/services/jira-polling-service'

/**
 * POST /api/webhooks/polling/start
 * Start polling for Jira changes
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authConfig)
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    console.log(`🔄 POLLING START API: Request received for user ${userId}`)
    await startPollingForUser(userId)
    
    console.log(`✅ POLLING START API: Successfully started polling for user ${userId}`)
    return NextResponse.json({
      success: true,
      message: 'Polling started for all Jira projects',
      userId,
    })
  } catch (error) {
    console.error('❌ POLLING START API: Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

