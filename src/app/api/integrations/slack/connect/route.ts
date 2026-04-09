import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`🔌 Slack Disconnect: Disconnecting Slack for user ${session.user.id}`)

    // Get tenant ID from request or URL
    const tenantId = request.nextUrl.searchParams.get('tenantId') || 'default';
    
    // First, try to disconnect from Nango (if connected via Nango)
    try {
      const { slackNangoService } = await import('@/lib/integrations/slack-nango-service');
      const isNangoConnected = await slackNangoService.getConnectionStatus(session.user.id, tenantId);
      
      if (isNangoConnected.connected) {
        console.log('🔄 Slack Disconnect: Disconnecting from Nango');
        await slackNangoService.disconnect(session.user.id, tenantId);
        console.log('✅ Slack Disconnect: Successfully disconnected from Nango');
      }
    } catch (nangoError) {
      console.log('🔄 Slack Disconnect: Not connected via Nango or Nango disconnect failed:', nangoError);
      // Continue to database disconnect
    }

    // Find and remove the Slack integration from database
    const integrations = await db.findIntegrationsByUserId(session.user.id)
    const slackIntegration = integrations.find(i => i.type === 'SLACK')
    
    if (!slackIntegration) {
      // Treat as idempotent success – nothing to disconnect
      return NextResponse.json({ 
        success: true, 
        message: 'Slack was already disconnected',
        removedProjects: 0
      })
    }

    // Remove the integration
    await db.deleteIntegration(slackIntegration._id.toString())
    
    // Also remove any Slack projects
    const projects = await db.findProjectsByUserId(session.user.id)
    const slackProjects = projects.filter(p => {
      const integration = integrations.find(i => i._id.toString() === p.integrationId.toString())
      return integration?.type === 'SLACK'
    })

    for (const project of slackProjects) {
      try { await db.updateProject(project._id.toString(), { isActive: false }) } catch {}
    }

    console.log(`✅ Slack Disconnect: Successfully disconnected Slack for user ${session.user.id}`)
    console.log(`🗑️ Slack Disconnect: Removed ${slackProjects.length} Slack projects`)

    return NextResponse.json({ 
      success: true, 
      message: 'Slack integration disconnected successfully',
      removedProjects: slackProjects.length
    })

  } catch (error) {
    console.error('❌ Slack Disconnect Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to disconnect Slack integration' 
    }, { status: 200 })
  }
}
