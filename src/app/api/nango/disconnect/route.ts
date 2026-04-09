/**
 * Nango Disconnect API
 * 
 * Disconnect a user's integration connection.
 * Uses tenant-scoped connection IDs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nangoService, NangoProvider } from '@/lib/integrations/nango-service';
import { db } from '@/lib/db/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { provider, tenantId, userId } = body as {
      provider: NangoProvider;
      tenantId: string;
      userId: string;
    };
    
    if (!provider || !tenantId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: provider, tenantId, userId' },
        { status: 400 }
      );
    }
    
    // Validate provider
    const validProviders: NangoProvider[] = ['jira', 'trello', 'slack', 'testrail'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }
    
    console.log(`🔄 Nango API: Disconnecting ${provider} (tenant: ${tenantId}, user: ${userId})`);
    
    // Delete the connection from Nango
    await nangoService.deleteConnection(provider, tenantId, userId);
    
    // Also mark related projects as inactive in local DB
    try {
      const virtualIntegrationId = `nango_${provider}_${tenantId}_${userId}`;
      const projects = await db.findProjectsByUserId(userId);
      
      for (const project of projects) {
        if (project.integrationId === virtualIntegrationId) {
          await db.updateProject(project._id.toString(), { isActive: false });
        }
      }
    } catch (dbError) {
      console.error('⚠️ Nango API: Error updating local projects:', dbError);
      // Don't fail the request for this
    }
    
    console.log(`✅ Nango API: Disconnected ${provider}`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully disconnected from ${provider}`,
    });
  } catch (error) {
    console.error('❌ Nango API: Error disconnecting:', error);
    
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}

