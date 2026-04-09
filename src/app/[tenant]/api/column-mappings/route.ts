import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import * as db from '@/lib/db/database'

/**
 * GET /api/column-mappings
 * Fetch column mappings for user/projects
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean)

    const mappings = await db.getColumnMappings(
      session.user.id,
      projectIds
    )

    return NextResponse.json({ success: true, mappings })
  } catch (error: any) {
    console.error('Error fetching column mappings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch column mappings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/column-mappings
 * Create a new column mapping (merge columns)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mergedColumnName, originalColumns, displayOrder, color } = body

    if (!mergedColumnName || !originalColumns || originalColumns.length < 2) {
      return NextResponse.json(
        { error: 'Merged column name and at least 2 original columns are required' },
        { status: 400 }
      )
    }

    const mapping = await db.upsertColumnMapping(
      session.user.id,
      mergedColumnName,
      originalColumns,
      displayOrder,
      color
    )

    return NextResponse.json({ success: true, mapping })
  } catch (error: any) {
    console.error('Error creating column mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create column mapping' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/column-mappings
 * Delete a column mapping
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const mappingId = searchParams.get('id')

    if (!mappingId) {
      return NextResponse.json(
        { error: 'Mapping ID is required' },
        { status: 400 }
      )
    }

    await db.deleteColumnMapping(session.user.id, mappingId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting column mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete column mapping' },
      { status: 500 }
    )
  }
}

