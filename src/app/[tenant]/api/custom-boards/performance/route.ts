import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import * as dbFunctions from '@/lib/db/database'
import {
  calculateUserSprintPerformance,
  calculateAllUsersSprintPerformance,
  calculateTeamPerformance,
} from '@/lib/performance/sprint-performance'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('boardId')
    const boardIdsParam = searchParams.get('boardIds') // comma-separated for view=overall
    const sprintId = searchParams.get('sprintId')
    const userId = searchParams.get('userId')
    const view = searchParams.get('view') // 'sprint' | 'history' | 'team' | 'overall'

    const currentUser = await db.findUserByEmail(session.user.email)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isManager = ['MANAGER', 'ADMIN'].includes(currentUser.role)

    if (view === 'overall') {
      const boardIds = boardIdsParam ? boardIdsParam.split(',').map((id) => id.trim()).filter(Boolean) : []
      if (boardIds.length === 0) {
        return NextResponse.json({ error: 'boardIds is required for overall view (comma-separated)' }, { status: 400 })
      }
      const allRecords = await dbFunctions.getPerformanceForBoards(boardIds)
      const targetUserId = userId || session.user.id
      const filteredRecords = isManager ? allRecords : allRecords.filter((r) => r.userId === targetUserId)

      const byUser = new Map<
        string,
        {
          userId: string
          userName: string
          userEmail: string
          totalIssues: number
          completedIssues: number
          veryEarlyCount: number
          earlyCount: number
          onTimeCount: number
          lateCount: number
          notCompletedCount: number
          rawScore: number
          sprintCount: number
        }
      >()

      for (const r of filteredRecords) {
        const existing = byUser.get(r.userId)
        if (!existing) {
          byUser.set(r.userId, {
            userId: r.userId,
            userName: r.userName,
            userEmail: r.userEmail,
            totalIssues: r.totalIssues,
            completedIssues: r.completedIssues,
            veryEarlyCount: r.veryEarlyCount,
            earlyCount: r.earlyCount,
            onTimeCount: r.onTimeCount,
            lateCount: r.lateCount,
            notCompletedCount: r.notCompletedCount,
            rawScore: r.rawScore,
            sprintCount: 1,
          })
        } else {
          existing.totalIssues += r.totalIssues
          existing.completedIssues += r.completedIssues
          existing.veryEarlyCount += r.veryEarlyCount
          existing.earlyCount += r.earlyCount
          existing.onTimeCount += r.onTimeCount
          existing.lateCount += r.lateCount
          existing.notCompletedCount += r.notCompletedCount
          existing.rawScore += r.rawScore
          existing.sprintCount += 1
        }
      }

      const records = Array.from(byUser.values()).map((agg) => {
        const maxPossible = agg.totalIssues * 100
        const normalizedPercentage = maxPossible > 0 ? Math.round(Math.min(100, Math.max(0, (agg.rawScore / maxPossible) * 100))) : 0
        return {
          _id: agg.userId,
          boardId: '',
          sprintId: '',
          sprintName: `All (${agg.sprintCount} sprints)`,
          userId: agg.userId,
          userName: agg.userName,
          userEmail: agg.userEmail,
          totalIssues: agg.totalIssues,
          completedIssues: agg.completedIssues,
          veryEarlyCount: agg.veryEarlyCount,
          earlyCount: agg.earlyCount,
          onTimeCount: agg.onTimeCount,
          lateCount: agg.lateCount,
          notCompletedCount: agg.notCompletedCount,
          rawScore: agg.rawScore,
          normalizedPercentage,
          issueEvaluations: [],
          calculatedAt: new Date().toISOString(),
          isFinal: true,
        }
      })

      const teamScore = records.length > 0
        ? Math.round(records.reduce((s, r) => s + r.normalizedPercentage, 0) / records.length)
        : 0

      return NextResponse.json({ success: true, records, teamScore, view: 'overall' })
    }

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 })
    }

    if (view === 'history') {
      const targetUserId = userId || session.user.id
      if (targetUserId !== session.user.id && !isManager) {
        return NextResponse.json({ error: 'Only managers can view other users\' performance' }, { status: 403 })
      }
      const history = await dbFunctions.getUserPerformanceHistory(boardId, targetUserId)
      return NextResponse.json({ success: true, history })
    }

    if (view === 'team') {
      if (!isManager) {
        return NextResponse.json({ error: 'Only managers can view team performance' }, { status: 403 })
      }
      if (!sprintId) {
        return NextResponse.json({ error: 'sprintId is required for team view' }, { status: 400 })
      }
      const records = await dbFunctions.getSprintPerformance(boardId, sprintId)
      const config = await dbFunctions.getPerformanceConfig(boardId)
      const teamScore = calculateTeamPerformance(records, config?.teamAggregation || 'average')
      return NextResponse.json({ success: true, records, teamScore, config })
    }

    if (sprintId) {
      const targetUserId = userId || session.user.id
      if (targetUserId !== session.user.id && !isManager) {
        return NextResponse.json({ error: 'Only managers can view other users\' performance' }, { status: 403 })
      }
      const records = await dbFunctions.getSprintPerformance(boardId, sprintId, targetUserId)
      return NextResponse.json({ success: true, records })
    }

    if (isManager) {
      const allRecords = await dbFunctions.getAllPerformanceForBoard(boardId)
      return NextResponse.json({ success: true, records: allRecords })
    }

    const myHistory = await dbFunctions.getUserPerformanceHistory(boardId, session.user.id)
    return NextResponse.json({ success: true, records: myHistory })
  } catch (error: any) {
    console.error('Error fetching performance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch performance data' },
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

    const body = await request.json()
    const { boardId, sprintId, action } = body

    if (!boardId || !sprintId) {
      return NextResponse.json({ error: 'boardId and sprintId are required' }, { status: 400 })
    }

    const currentUser = await db.findUserByEmail(session.user.email)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isManager = ['MANAGER', 'ADMIN'].includes(currentUser.role)

    if (action === 'recalculate') {
      if (!isManager) {
        return NextResponse.json({ error: 'Only managers can trigger recalculation' }, { status: 403 })
      }
      const records = await calculateAllUsersSprintPerformance(boardId, sprintId)
      const config = await dbFunctions.getPerformanceConfig(boardId)
      const teamScore = calculateTeamPerformance(records, config?.teamAggregation || 'average')
      return NextResponse.json({ success: true, records, teamScore })
    }

    if (action === 'calculate') {
      const records = await calculateAllUsersSprintPerformance(boardId, sprintId)
      const config = await dbFunctions.getPerformanceConfig(boardId)
      const teamScore = calculateTeamPerformance(records, config?.teamAggregation || 'average')
      return NextResponse.json({ success: true, records, teamScore })
    }

    if (action === 'calculate_user') {
      const record = await calculateUserSprintPerformance(
        boardId,
        sprintId,
        session.user.id,
        currentUser.name || session.user.email,
        session.user.email
      )
      return NextResponse.json({ success: true, record })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error calculating performance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to calculate performance' },
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
      return NextResponse.json({ error: 'Only managers can update configuration' }, { status: 403 })
    }

    const body = await request.json()
    const { boardId, config: configUpdate } = body

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 })
    }

    const config = await dbFunctions.upsertPerformanceConfig(boardId, configUpdate)
    return NextResponse.json({ success: true, config })
  } catch (error: any) {
    console.error('Error updating performance config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update configuration' },
      { status: 500 }
    )
  }
}
