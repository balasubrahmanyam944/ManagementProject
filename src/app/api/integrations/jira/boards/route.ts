import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectKey = searchParams.get('projectKey')

    if (!projectKey) {
      return NextResponse.json(
        { error: 'Project key is required' },
        { status: 400 }
      )
    }

    // Check if user has Jira integration
    const isConnected = await jiraService.isConnected(session.user.id)
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Jira integration not connected' },
        { status: 400 }
      )
    }

    // Fetch boards from Jira
    const boards = await jiraService.fetchBoards(session.user.id, projectKey)

    return NextResponse.json({
      boards: boards.map(board => ({
        id: board.id,
        name: board.name,
        type: board.type,
        location: board.location,
      })),
    })
  } catch (error) {
    console.error('Jira boards error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Jira boards' },
      { status: 500 }
    )
  }
} 