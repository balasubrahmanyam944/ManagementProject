/**
 * Trello Card Move API (Tenant-specific)
 * Get available lists for a board and move cards between lists
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { trelloService } from '@/lib/integrations/trello-service'

/**
 * GET /[tenant]/api/integrations/trello/cards/move?boardId=xxx
 * Get available lists for a board (these are the statuses in Trello)
 */
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
        { error: 'boardId is required' },
        { status: 400 }
      )
    }

    console.log('🔍 TRELLO CARDS API (TENANT): Fetching lists for board:', boardId)

    const lists = await trelloService.getBoardLists(session.user.id, boardId)

    return NextResponse.json({
      success: true,
      lists: lists.map(l => ({
        id: l.id,
        name: l.name,
        pos: l.pos
      }))
    })
  } catch (error) {
    console.error('❌ TRELLO CARDS API (TENANT): Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch lists' },
      { status: 500 }
    )
  }
}

/**
 * POST /[tenant]/api/integrations/trello/cards/move
 * Move a card to a different list (change status)
 * Body: { cardId: string, listId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { cardId, listId } = body

    if (!cardId || !listId) {
      return NextResponse.json(
        { error: 'cardId and listId are required' },
        { status: 400 }
      )
    }

    console.log('🔄 TRELLO CARDS API (TENANT): Moving card:', cardId, 'to list:', listId)

    await trelloService.moveCard(session.user.id, cardId, listId)

    return NextResponse.json({
      success: true,
      message: `Card moved successfully`
    })
  } catch (error) {
    console.error('❌ TRELLO CARDS API (TENANT): Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to move card' },
      { status: 500 }
    )
  }
}

