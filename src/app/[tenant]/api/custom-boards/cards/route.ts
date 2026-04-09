import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import * as dbFunctions from '@/lib/db/database'
import { toObjectId } from '@/lib/db/mongodb'

async function getUserInfo(session: any) {
  const user = await db.findUserByEmail(session.user.email)
  return {
    userId: session.user.id,
    userName: user?.name || session.user.email || 'Unknown',
  }
}

async function logActivity(
  cardId: string,
  boardId: string,
  type: dbFunctions.CardActivityType,
  userId: string,
  userName: string,
  fromValue?: string,
  toValue?: string,
  metadata?: Record<string, any>,
  isBackwardMove?: boolean
) {
  try {
    await dbFunctions.createCardActivity(cardId, boardId, type, userId, userName, fromValue, toValue, metadata, isBackwardMove)
  } catch (err) {
    console.error('Failed to log activity:', err)
  }
}

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

    const cards = await dbFunctions.getCustomBoardCards(boardId)
    return NextResponse.json({ success: true, cards })
  } catch (error: any) {
    console.error('Error fetching cards:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch cards' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, userName } = await getUserInfo(session)
    const body = await request.json()
    const {
      boardId, columnName, title, description = '',
      assigneeId, assigneeName, assigneeEmail,
      priority = 'MEDIUM', dueDate, labels = [],
      storyPoints,
    } = body

    if (!boardId || !columnName || !title) {
      return NextResponse.json({ error: 'boardId, columnName, and title are required' }, { status: 400 })
    }

    const card = await dbFunctions.createCustomBoardCard(
      boardId, columnName, title.trim(), description,
      session.user.id, userName,
      assigneeId, assigneeName, assigneeEmail,
      priority, dueDate ? new Date(dueDate) : undefined, labels,
      body.sprintId || undefined,
      storyPoints != null ? Number(storyPoints) : undefined
    )

    await logActivity(
      card._id.toString(), boardId, 'created', userId, userName,
      undefined, columnName, { title: title.trim() }
    )

    if (assigneeName) {
      await logActivity(
        card._id.toString(), boardId, 'assigned', userId, userName,
        undefined, assigneeName
      )
    }

    return NextResponse.json({ success: true, card })
  } catch (error: any) {
    console.error('Error creating card:', error)
    return NextResponse.json({ error: error.message || 'Failed to create card' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, userName } = await getUserInfo(session)
    const body = await request.json()
    const { cardId, action, cardIds, updates: bulkUpdates, ...data } = body

    if (action === 'bulkUpdate') {
      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json({ error: 'cardIds array is required for bulk update' }, { status: 400 })
      }
      const updates: any = {}
      if (bulkUpdates.assigneeId !== undefined) updates.assigneeId = bulkUpdates.assigneeId
      if (bulkUpdates.assigneeName !== undefined) updates.assigneeName = bulkUpdates.assigneeName
      if (bulkUpdates.assigneeEmail !== undefined) updates.assigneeEmail = bulkUpdates.assigneeEmail
      if (bulkUpdates.priority !== undefined) updates.priority = bulkUpdates.priority
      if (bulkUpdates.columnName !== undefined) updates.columnName = bulkUpdates.columnName
      if (bulkUpdates.sprintId !== undefined) updates.sprintId = bulkUpdates.sprintId ? toObjectId(bulkUpdates.sprintId) : null
      if (bulkUpdates.storyPoints !== undefined) updates.storyPoints = bulkUpdates.storyPoints
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
      }
      for (const cid of cardIds) {
        await dbFunctions.updateCustomBoardCard(cid, updates)
      }
      return NextResponse.json({ success: true, updated: cardIds.length })
    }

    if (action === 'reorder') {
      const orderedCardIds = data.orderedCardIds
      if (!Array.isArray(orderedCardIds) || orderedCardIds.length === 0) {
        return NextResponse.json({ error: 'orderedCardIds array is required for reorder' }, { status: 400 })
      }
      for (let i = 0; i < orderedCardIds.length; i++) {
        await dbFunctions.updateCustomBoardCard(orderedCardIds[i], { order: i })
      }
      return NextResponse.json({ success: true })
    }

    if (!cardId) {
      return NextResponse.json({ error: 'cardId is required' }, { status: 400 })
    }

    // Fetch the existing card for comparison
    const existingCard = await dbFunctions.getCustomBoardCards('').then(() => null).catch(() => null)
    // Actually fetch via direct lookup
    const { getCollection, COLLECTIONS } = await import('@/lib/db/mongodb')
    const cardsCol = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
    const existingDoc = await cardsCol.findOne({ _id: toObjectId(cardId) })
    const boardId = existingDoc?.boardId?.toString() || ''

    if (action === 'move') {
      const { targetColumn, targetOrder, backwardReason } = data
      if (!targetColumn) {
        return NextResponse.json({ error: 'targetColumn is required for move action' }, { status: 400 })
      }

      const fromColumn = existingDoc?.columnName || 'Unknown'

      // Detect backward move: check if target column index < source column index
      let isBackwardMove = false
      if (boardId && fromColumn !== targetColumn) {
        const boardsCol = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
        const boardDoc = await boardsCol.findOne({ _id: toObjectId(boardId) })
        if (boardDoc?.columns) {
          const fromIdx = boardDoc.columns.indexOf(fromColumn)
          const toIdx = boardDoc.columns.indexOf(targetColumn)
          if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
            isBackwardMove = true
          }
        }
      }

      const card = await dbFunctions.moveCustomBoardCard(cardId, targetColumn, targetOrder)

      const activityType = isBackwardMove ? 'moved_backward' : 'moved'
      const metadata = isBackwardMove && (backwardReason != null && String(backwardReason).trim() !== '')
        ? { backwardReason: String(backwardReason).trim() }
        : undefined
      await logActivity(cardId, boardId, activityType, userId, userName, fromColumn, targetColumn, metadata, isBackwardMove)

      return NextResponse.json({ success: true, card })
    }

    if (action === 'addDependency') {
      const { targetCardId, targetCardTitle, type } = data
      if (!targetCardId || !type) {
        return NextResponse.json({ error: 'targetCardId and type are required' }, { status: 400 })
      }
      await dbFunctions.addCardDependency(cardId, targetCardId, targetCardTitle || '', type)

      await logActivity(
        cardId, boardId, 'dependency_added', userId, userName,
        undefined, targetCardTitle || targetCardId,
        { targetCardId, type }
      )

      return NextResponse.json({ success: true })
    }

    if (action === 'removeDependency') {
      const { targetCardId, type } = data
      if (!targetCardId || !type) {
        return NextResponse.json({ error: 'targetCardId and type are required' }, { status: 400 })
      }
      await dbFunctions.removeCardDependency(cardId, targetCardId, type)

      await logActivity(
        cardId, boardId, 'dependency_removed', userId, userName,
        targetCardId, undefined, { targetCardId, type }
      )

      return NextResponse.json({ success: true })
    }

    // General update — log each changed field
    const updates: any = {}

    if (data.title !== undefined && data.title !== existingDoc?.title) {
      updates.title = data.title
      await logActivity(cardId, boardId, 'title_changed', userId, userName, existingDoc?.title, data.title)
    } else if (data.title !== undefined) {
      updates.title = data.title
    }

    if (data.description !== undefined && data.description !== existingDoc?.description) {
      updates.description = data.description
      await logActivity(cardId, boardId, 'description_changed', userId, userName, 'Previous description', 'Updated description')
    } else if (data.description !== undefined) {
      updates.description = data.description
    }

    if (data.priority !== undefined && data.priority !== existingDoc?.priority) {
      updates.priority = data.priority
      await logActivity(cardId, boardId, 'priority_changed', userId, userName, existingDoc?.priority, data.priority)
    } else if (data.priority !== undefined) {
      updates.priority = data.priority
    }

    if (data.dueDate !== undefined) {
      updates.dueDate = data.dueDate ? new Date(data.dueDate) : null
      const oldDate = existingDoc?.dueDate ? new Date(existingDoc.dueDate).toISOString().split('T')[0] : 'None'
      const newDate = data.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : 'None'
      if (oldDate !== newDate) {
        await logActivity(cardId, boardId, 'due_date_changed', userId, userName, oldDate, newDate)
      }
    }

    if (data.labels !== undefined) {
      updates.labels = data.labels
      const oldLabels = (existingDoc?.labels || []).join(', ') || 'None'
      const newLabels = (data.labels || []).join(', ') || 'None'
      if (oldLabels !== newLabels) {
        await logActivity(cardId, boardId, 'labels_changed', userId, userName, oldLabels, newLabels)
      }
    }

    if (data.columnName !== undefined && data.columnName !== existingDoc?.columnName) {
      updates.columnName = data.columnName

      let isBackwardMove = false
      if (boardId) {
        const boardsCol = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
        const boardDoc = await boardsCol.findOne({ _id: toObjectId(boardId) })
        if (boardDoc?.columns) {
          const fromIdx = boardDoc.columns.indexOf(existingDoc?.columnName)
          const toIdx = boardDoc.columns.indexOf(data.columnName)
          if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
            isBackwardMove = true
          }
          const doneColumn = boardDoc.columns[boardDoc.columns.length - 1]
          if (data.columnName === doneColumn) {
            updates.completedAt = new Date()
          } else if (existingDoc?.columnName === doneColumn) {
            updates.completedAt = null
          }
        }
      }

      const activityType = isBackwardMove ? 'moved_backward' : 'moved'
      await logActivity(cardId, boardId, activityType, userId, userName, existingDoc?.columnName, data.columnName, undefined, isBackwardMove)
    } else if (data.columnName !== undefined) {
      updates.columnName = data.columnName
    }

    // Handle assignee changes
    if (data.assigneeId !== undefined) {
      const oldAssignee = existingDoc?.assigneeName || existingDoc?.assigneeId
      const newAssigneeName = data.assigneeName

      if (data.assigneeId !== existingDoc?.assigneeId) {
        if (!data.assigneeId && oldAssignee) {
          await logActivity(cardId, boardId, 'unassigned', userId, userName, oldAssignee, undefined)
        } else if (data.assigneeId && newAssigneeName) {
          await logActivity(cardId, boardId, 'assigned', userId, userName, oldAssignee || 'Unassigned', newAssigneeName)
        }
      }

      updates.assigneeId = data.assigneeId
    }
    if (data.assigneeName !== undefined) updates.assigneeName = data.assigneeName
    if (data.assigneeEmail !== undefined) updates.assigneeEmail = data.assigneeEmail

    if (data.sprintId !== undefined) {
      updates.sprintId = data.sprintId ? toObjectId(data.sprintId) : null
      const oldSprintId = existingDoc?.sprintId?.toString() || 'Backlog'
      const newSprintId = data.sprintId || 'Backlog'
      if (oldSprintId !== newSprintId) {
        await logActivity(cardId, boardId, 'sprint_changed', userId, userName, oldSprintId, newSprintId)
      }
    }

    if (data.storyPoints !== undefined) {
      const oldVal = existingDoc?.storyPoints != null ? String(existingDoc.storyPoints) : 'None'
      const newVal = data.storyPoints != null ? String(data.storyPoints) : 'None'
      if (oldVal !== newVal) {
        await logActivity(cardId, boardId, 'story_points_changed', userId, userName, oldVal, newVal)
      }
      updates.storyPoints = data.storyPoints != null ? Number(data.storyPoints) : undefined
    }

    const card = await dbFunctions.updateCustomBoardCard(cardId, updates)
    return NextResponse.json({ success: true, card })
  } catch (error: any) {
    console.error('Error updating card:', error)
    return NextResponse.json({ error: error.message || 'Failed to update card' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, userName } = await getUserInfo(session)
    const { searchParams } = new URL(request.url)
    const cardId = searchParams.get('id')

    if (!cardId) {
      return NextResponse.json({ error: 'Card ID is required' }, { status: 400 })
    }

    // Get the card before deleting for activity log
    const { getCollection, COLLECTIONS } = await import('@/lib/db/mongodb')
    const cardsCol = await getCollection(COLLECTIONS.CUSTOM_BOARD_CARDS)
    const existingDoc = await cardsCol.findOne({ _id: toObjectId(cardId) })
    const boardId = existingDoc?.boardId?.toString() || ''

    await dbFunctions.deleteCustomBoardCard(cardId)

    if (boardId) {
      await logActivity(
        cardId, boardId, 'deleted', userId, userName,
        existingDoc?.title || 'Unknown', undefined
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting card:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete card' }, { status: 500 })
  }
}
