import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import * as dbFunctions from '@/lib/db/database'
import { calculateAllUsersSprintPerformance } from '@/lib/performance/sprint-performance'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('boardId')

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 })
    }

    const sprints = await dbFunctions.getSprintsByBoard(boardId)
    const activeSprint = await dbFunctions.getActiveSprintForBoard(boardId)

    return NextResponse.json({ success: true, sprints, activeSprint })
  } catch (error: any) {
    console.error('Error fetching sprints:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sprints' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await db.findUserByEmail(session.user.email)
    if (!currentUser || !['MANAGER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only managers can create sprints' }, { status: 403 })
    }

    const body = await request.json()
    const { boardId, name, goal, startDate, endDate } = body

    if (!boardId || !name?.trim()) {
      return NextResponse.json({ error: 'boardId and name are required' }, { status: 400 })
    }

    const sprint = await dbFunctions.createSprint(
      boardId,
      name.trim(),
      goal || '',
      session.user.id,
      currentUser.name || session.user.email,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )

    return NextResponse.json({ success: true, sprint })
  } catch (error: any) {
    console.error('Error creating sprint:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create sprint' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await db.findUserByEmail(session.user.email)
    if (!currentUser || !['MANAGER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only managers can manage sprints' }, { status: 403 })
    }

    const body = await request.json()
    const { sprintId, action, ...data } = body

    if (!sprintId || !action) {
      return NextResponse.json({ error: 'sprintId and action are required' }, { status: 400 })
    }

    if (action === 'start') {
      const { startDate, endDate } = data
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'startDate and endDate are required to start a sprint' }, { status: 400 })
      }
      const sprint = await dbFunctions.startSprint(sprintId, new Date(startDate), new Date(endDate))
      return NextResponse.json({ success: true, sprint })
    }

    if (action === 'complete') {
      const { moveToBacklog = true, moveToSprintId } = data
      const sprint = await dbFunctions.completeSprint(sprintId, moveToBacklog, moveToSprintId)
      if (sprint) {
        try {
          await calculateAllUsersSprintPerformance(sprint.boardId.toString(), sprintId)
        } catch (perfError) {
          console.error('Performance calculation failed (non-blocking):', perfError)
        }
      }
      return NextResponse.json({ success: true, sprint })
    }

    if (action === 'update') {
      const updates: any = {}
      if (data.name !== undefined) updates.name = data.name
      if (data.goal !== undefined) updates.goal = data.goal
      if (data.startDate !== undefined) updates.startDate = data.startDate ? new Date(data.startDate) : undefined
      if (data.endDate !== undefined) updates.endDate = data.endDate ? new Date(data.endDate) : undefined

      const sprint = await dbFunctions.updateSprint(sprintId, updates)
      return NextResponse.json({ success: true, sprint })
    }

    if (action === 'moveCards') {
      const { cardIds, targetSprintId, columnName } = data
      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json({ error: 'cardIds array is required' }, { status: 400 })
      }
      await dbFunctions.moveCardsToSprint(cardIds, targetSprintId || null, columnName)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error updating sprint:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update sprint' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await db.findUserByEmail(session.user.email)
    if (!currentUser || !['MANAGER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Only managers can delete sprints' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const sprintId = searchParams.get('id')

    if (!sprintId) {
      return NextResponse.json({ error: 'Sprint ID is required' }, { status: 400 })
    }

    await dbFunctions.deleteSprint(sprintId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting sprint:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete sprint' },
      { status: 500 }
    )
  }
}
