/**
 * Jira Transitions API (Tenant-specific)
 * Get available transitions for an issue and transition to a new status
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'

/**
 * GET /[tenant]/api/integrations/jira/transitions?issueKey=PROJ-123
 * Get available transitions for an issue
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const issueKey = searchParams.get('issueKey')

    if (!issueKey) {
      return NextResponse.json(
        { error: 'issueKey is required' },
        { status: 400 }
      )
    }

    console.log('🔍 JIRA TRANSITIONS API (TENANT): Fetching transitions for:', issueKey)

    const transitions = await jiraService.getIssueTransitions(session.user.id, issueKey)

    return NextResponse.json({
      success: true,
      transitions: transitions.map(t => ({
        id: t.id,
        name: t.name,
        to: {
          id: t.to.id,
          name: t.to.name,
          statusCategory: t.to.statusCategory
        }
      }))
    })
  } catch (error) {
    console.error('❌ JIRA TRANSITIONS API (TENANT): Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transitions' },
      { status: 500 }
    )
  }
}

/**
 * POST /[tenant]/api/integrations/jira/transitions
 * Transition an issue to a new status
 * Body: { issueKey: string, transitionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { issueKey, transitionId } = body

    if (!issueKey || !transitionId) {
      return NextResponse.json(
        { error: 'issueKey and transitionId are required' },
        { status: 400 }
      )
    }

    console.log('🔄 JIRA TRANSITIONS API (TENANT): Transitioning issue:', issueKey, 'to:', transitionId)

    await jiraService.transitionIssue(session.user.id, issueKey, transitionId)

    return NextResponse.json({
      success: true,
      message: `Issue ${issueKey} transitioned successfully`
    })
  } catch (error) {
    console.error('❌ JIRA TRANSITIONS API (TENANT): Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to transition issue' },
      { status: 500 }
    )
  }
}

