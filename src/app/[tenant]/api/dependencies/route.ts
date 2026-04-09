import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import * as db from '@/lib/db/database'

/**
 * GET /api/dependencies
 * Fetch dependencies for projects/tasks
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean)
    const taskIds = searchParams.get('taskIds')?.split(',').filter(Boolean)

    if (!projectIds || projectIds.length === 0) {
      return NextResponse.json({ error: 'projectIds is required' }, { status: 400 })
    }

    const dependencies = await db.getTaskDependenciesForProjects(
      session.user.id,
      projectIds,
      taskIds
    )

    return NextResponse.json({ success: true, dependencies })
  } catch (error: any) {
    console.error('Error fetching dependencies:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dependencies' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/dependencies
 * Create a new dependency between tasks
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      sourceProjectId,
      sourceIntegrationType,
      sourceTaskId,
      sourceTaskKey,
      targetProjectId,
      targetIntegrationType,
      targetTaskId,
      targetTaskKey,
      targetTaskSummary,
      dependencyType,
    } = body

    if (!sourceProjectId || !sourceTaskId || !targetProjectId || !targetTaskId || !dependencyType) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceProjectId, sourceTaskId, targetProjectId, targetTaskId, dependencyType' },
        { status: 400 }
      )
    }

    const dependency = await db.upsertTaskDependency(
      session.user.id,
      sourceProjectId,
      sourceIntegrationType || 'JIRA',
      sourceTaskId,
      sourceTaskKey || '',
      targetProjectId,
      targetIntegrationType || 'JIRA',
      targetTaskId,
      targetTaskKey || '',
      targetTaskSummary || '',
      dependencyType
    )

    return NextResponse.json({ success: true, dependency })
  } catch (error: any) {
    console.error('Error creating dependency:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create dependency' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/dependencies
 * Resolve a dependency
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      sourceProjectId,
      sourceTaskId,
      targetProjectId,
      targetTaskId,
      dependencyType,
    } = body

    if (!sourceProjectId || !sourceTaskId || !targetProjectId || !targetTaskId || !dependencyType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    await db.resolveDependency(
      session.user.id,
      sourceProjectId,
      sourceTaskId,
      targetProjectId,
      targetTaskId,
      dependencyType,
      session.user.email || 'Unknown'
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error resolving dependency:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to resolve dependency' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dependencies
 * Delete a dependency
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dependencyId = searchParams.get('id')

    if (!dependencyId) {
      return NextResponse.json(
        { error: 'Dependency ID is required' },
        { status: 400 }
      )
    }

    await db.deleteDependency(session.user.id, dependencyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting dependency:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete dependency' },
      { status: 500 }
    )
  }
}

