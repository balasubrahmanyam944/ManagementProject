import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's projects and integrations
    const projects = await db.findProjectsByUserId(session.user.id)
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    
    // Get the SWAGGER DOCUMENT project specifically
    const swaggerProject = projects.find(p => p.name === 'SWAGGER DOCUMENT' || p.key === 'SCRUM')
    
    return NextResponse.json({
      userId: session.user.id,
      totalProjects: projects.length,
      totalIntegrations: integrations.length,
      swaggerProject: swaggerProject ? {
        id: swaggerProject._id.toString(),
        name: swaggerProject.name,
        key: swaggerProject.key,
        externalId: swaggerProject.externalId,
        analytics: swaggerProject.analytics,
        lastSyncAt: swaggerProject.lastSyncAt,
        integrationId: swaggerProject.integrationId.toString()
      } : null,
      allProjects: projects.map(p => ({
        id: p._id.toString(),
        name: p.name,
        key: p.key,
        externalId: p.externalId,
        hasAnalytics: !!p.analytics,
        totalIssues: p.analytics?.totalIssues || 0,
        lastSyncAt: p.lastSyncAt,
        integrationId: p.integrationId.toString()
      })),
      integrations: integrations.map(i => ({
        id: i._id.toString(),
        type: i.type,
        status: i.status,
        hasAccessToken: !!i.accessToken,
        metadata: i.metadata
      }))
    })

  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: 'Failed to get debug data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 