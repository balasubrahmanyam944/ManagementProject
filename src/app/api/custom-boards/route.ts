import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import * as dbFunctions from '@/lib/db/database'

/**
 * GET /api/custom-boards
 * List custom boards - optionally filter by subscribed only
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const subscribedOnly = searchParams.get('subscribedOnly') === 'true'

    // Check user role to determine access filtering
    const currentUser = await db.findUserByEmail(session.user.email!)
    const isManagerOrAdmin = currentUser && ['MANAGER', 'ADMIN'].includes(currentUser.role)

    let boards
    if (subscribedOnly) {
      // getCustomBoardsForUser now includes boards user has access to via allowedUsers
      boards = await dbFunctions.getCustomBoardsForUser(session.user.id)
    } else {
      // Managers see all boards, others see only boards they have access to
      if (isManagerOrAdmin) {
        boards = await dbFunctions.getCustomBoards()
      } else {
        boards = await dbFunctions.getCustomBoards(session.user.id)
      }
    }

    return NextResponse.json({ success: true, boards })
  } catch (error: any) {
    console.error('Error fetching custom boards:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch boards' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/custom-boards
 * Create a new custom board (MANAGER/ADMIN only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - only MANAGER and ADMIN can create boards
    const user = await db.findUserByEmail(session.user.email)
    if (!user || !['MANAGER', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Only managers and admins can create boards' }, { status: 403 })
    }

    const body = await request.json()
    const { name, columns } = body

    if (!name || !columns || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: 'Board name and at least one column are required' },
        { status: 400 }
      )
    }

    // Sanitize column names
    const cleanColumns = columns.map((c: string) => c.trim()).filter((c: string) => c.length > 0)
    if (cleanColumns.length === 0) {
      return NextResponse.json({ error: 'At least one valid column name is required' }, { status: 400 })
    }

    const board = await dbFunctions.createCustomBoard(
      name.trim(),
      cleanColumns,
      session.user.id,
      user.name || session.user.email
    )

    return NextResponse.json({ success: true, board })
  } catch (error: any) {
    console.error('Error creating custom board:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create board' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/custom-boards?id=xxx
 * Delete a custom board (creator only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('id')

    if (!boardId) {
      return NextResponse.json({ error: 'Board ID is required' }, { status: 400 })
    }

    await dbFunctions.deleteCustomBoard(boardId, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting custom board:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete board' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/custom-boards
 * Subscribe/unsubscribe from a board, or add a column
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { boardId, action, columnName, allowedUsers, columns } = body

    if (!boardId || !action) {
      return NextResponse.json({ error: 'boardId and action are required' }, { status: 400 })
    }

    if (action === 'subscribe') {
      await dbFunctions.subscribeToBoard(boardId, session.user.id)
      return NextResponse.json({ success: true })
    }

    if (action === 'unsubscribe') {
      await dbFunctions.unsubscribeFromBoard(boardId, session.user.id)
      return NextResponse.json({ success: true })
    }

    if (action === 'addColumn') {
      if (!columnName || !columnName.trim()) {
        return NextResponse.json({ error: 'Column name is required' }, { status: 400 })
      }
      const board = await dbFunctions.addColumnToBoard(boardId, columnName.trim())
      return NextResponse.json({ success: true, board })
    }

    if (action === 'reorderColumns') {
      if (!Array.isArray(columns) || columns.length === 0) {
        return NextResponse.json({ error: 'columns array is required' }, { status: 400 })
      }
      const board = await dbFunctions.reorderBoardColumns(boardId, columns)
      return NextResponse.json({ success: true, board })
    }

    if (action === 'removeColumn') {
      if (!columnName || !columnName.trim()) {
        return NextResponse.json({ error: 'columnName is required' }, { status: 400 })
      }
      const board = await dbFunctions.removeColumnFromBoard(boardId, columnName.trim())
      return NextResponse.json({ success: true, board })
    }

    if (action === 'updateAccess') {
      // Only MANAGER/ADMIN can update access control
      const user = await db.findUserByEmail(session.user.email!)
      if (!user || !['MANAGER', 'ADMIN'].includes(user.role)) {
        return NextResponse.json({ error: 'Only managers can update board access' }, { status: 403 })
      }
      if (!Array.isArray(allowedUsers)) {
        return NextResponse.json({ error: 'allowedUsers must be an array' }, { status: 400 })
      }
      const board = await dbFunctions.updateBoardAccessControl(boardId, allowedUsers)
      return NextResponse.json({ success: true, board })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error updating custom board:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update board' },
      { status: 500 }
    )
  }
}

