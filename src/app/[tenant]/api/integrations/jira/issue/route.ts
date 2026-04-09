/**
 * Jira issue metadata and update (tenant)
 * GET: assignable users + priorities for a project
 * PATCH: update issue fields (assignee, priority, duedate)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { jiraService } from '@/lib/integrations/jira-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const projectKey = searchParams.get('projectKey')
    if (!projectKey) {
      return NextResponse.json({ error: 'projectKey is required' }, { status: 400 })
    }
    const [assignableUsers, priorities] = await Promise.all([
      jiraService.getAssignableUsers(session.user.id, projectKey),
      jiraService.getPriorities(session.user.id),
    ])
    return NextResponse.json({
      success: true,
      assignableUsers,
      priorities,
    })
  } catch (error) {
    console.error('Jira issue metadata error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch metadata' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { issueKey, assigneeAccountId, priorityId, duedate } = body
    if (!issueKey || typeof issueKey !== 'string') {
      return NextResponse.json({ error: 'issueKey is required' }, { status: 400 })
    }
    const fields: { assigneeAccountId?: string | null; priorityId?: string; duedate?: string | null } = {}
    if (assigneeAccountId !== undefined) fields.assigneeAccountId = assigneeAccountId === '' ? null : assigneeAccountId
    if (priorityId !== undefined) fields.priorityId = priorityId
    if (duedate !== undefined) fields.duedate = duedate === '' || duedate == null ? null : duedate
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ success: true })
    }
    await jiraService.updateIssueFields(session.user.id, issueKey, fields)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Jira issue update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update issue' },
      { status: 500 }
    )
  }
}
