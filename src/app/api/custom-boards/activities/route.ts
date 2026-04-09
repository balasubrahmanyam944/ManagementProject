import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import * as dbFunctions from '@/lib/db/database'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cardId = searchParams.get('cardId')
    const boardId = searchParams.get('boardId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (cardId) {
      const activities = await dbFunctions.getCardActivities(cardId, limit)
      return NextResponse.json({ success: true, activities })
    }

    if (boardId) {
      const activities = await dbFunctions.getBoardActivities(boardId, limit)
      return NextResponse.json({ success: true, activities })
    }

    return NextResponse.json({ error: 'cardId or boardId is required' }, { status: 400 })
  } catch (error: any) {
    console.error('Error fetching activities:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch activities' },
      { status: 500 }
    )
  }
}
