import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { trelloService } from '@/lib/integrations/trello-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('boardId')

    if (!boardId) {
      return NextResponse.json(
        { error: 'Board ID is required' },
        { status: 400 }
      )
    }

    // Check if user has Trello integration
    const isConnected = await trelloService.isConnected(session.user.id)
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Trello integration not connected' },
        { status: 400 }
      )
    }

    // Fetch lists from Trello
    const lists = await trelloService.fetchLists(session.user.id, boardId)

    return NextResponse.json({
      lists: lists.map(list => ({
        id: list.id,
        name: list.name,
        closed: list.closed,
        idBoard: list.idBoard,
        pos: list.pos,
      })),
    })
  } catch (error) {
    console.error('Trello lists error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Trello lists' },
      { status: 500 }
    )
  }
} 