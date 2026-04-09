import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'
import { jiraService } from '@/lib/integrations/jira-service'
import { trelloService } from '@/lib/integrations/trello-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user with basic details
    const user = await db.findUserWithSubscription(session.user.id)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's integrations
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    
    // Get user's projects
    const projects = await db.findProjectsByUserId(session.user.id)

    // Check connection status for each integration
    const jiraConnected = await jiraService.isConnected(session.user.id)
    const trelloConnected = await trelloService.isConnected(session.user.id)

    // Get basic counts
    const [projectCount, integrationCount, connectedIntegrations] = await Promise.all([
      db.countProjectsByUserId(session.user.id),
      db.countIntegrationsByUserId(session.user.id),
      db.countConnectedIntegrationsByUserId(session.user.id)
    ])

    // Get recent audit logs
    const recentActivity = await db.findRecentAuditLogsByUserId(session.user.id, 5)

    // Get system stats (for admin users)
    const [totalUsers, totalProjects, totalIntegrations] = user.role === 'ADMIN' ? await Promise.all([
      db.countUsers(),
      db.countProjects(),
      db.countIntegrations()
    ]) : [0, 0, 0]

    // Calculate account age
    const accountAge = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))

    // Group projects by integration type
    const projectsByIntegration = {
      jira: projects.filter(p => {
        const integration = integrations.find(i => i._id.toString() === p.integrationId.toString())
        return integration?.type === 'JIRA' && p.isActive
      }),
      trello: projects.filter(p => {
        const integration = integrations.find(i => i._id.toString() === p.integrationId.toString())
        return integration?.type === 'TRELLO' && p.isActive
      }),
    }

    const dashboardStats = {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        subscription: user.subscription?.type || 'FREE',
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
      },
      stats: {
        projectCount,
        integrationCount,
        accountAge,
        lastLogin: user.lastLoginAt?.toISOString() || null,
        isActive: user.isActive,
        subscription: user.subscription?.type || 'FREE',
        role: user.role,
      },
      integrations: {
        jira: {
          connected: jiraConnected,
          integration: integrations.find(i => i.type === 'JIRA') || null,
          projects: projectsByIntegration.jira.map(p => ({
            id: p._id.toString(),
            externalId: p.externalId,
            name: p.name,
            key: p.key,
            description: p.description,
            avatarUrl: p.avatarUrl,
            isActive: p.isActive,
            createdAt: p.createdAt.toISOString(),
            lastSyncAt: p.lastSyncAt?.toISOString(),
          })),
        },
        trello: {
          connected: trelloConnected,
          integration: integrations.find(i => i.type === 'TRELLO') || null,
          projects: projectsByIntegration.trello.map(p => ({
            id: p._id.toString(),
            externalId: p.externalId,
            name: p.name,
            key: p.key,
            description: p.description,
            avatarUrl: p.avatarUrl,
            isActive: p.isActive,
            createdAt: p.createdAt.toISOString(),
            lastSyncAt: p.lastSyncAt?.toISOString(),
          })),
        },
        total: integrationCount,
        connected: connectedIntegrations,
      },
      projects: projects.map(project => ({
        id: project._id.toString(),
        externalId: project.externalId,
        name: project.name,
        key: project.key,
        description: project.description,
        avatarUrl: project.avatarUrl,
        isActive: project.isActive,
        createdAt: project.createdAt.toISOString(),
        lastSyncAt: project.lastSyncAt?.toISOString(),
        integrationType: integrations.find(i => i._id.toString() === project.integrationId.toString())?.type,
      })),
      recentActivity: recentActivity.map(activity => ({
        id: activity._id.toString(),
        action: activity.action,
        description: `${activity.action} - ${activity.resource || 'No resource'}`,
        timestamp: activity.createdAt.toISOString(),
        location: activity.ipAddress || 'Unknown',
      })),
      systemStats: {
        totalUsers,
        totalProjects,
        totalIntegrations,
      },
    }

    return NextResponse.json(dashboardStats)
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
} 