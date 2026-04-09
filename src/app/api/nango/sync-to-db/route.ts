/**
 * API endpoint to sync Nango connection status to the database
 * 
 * When a tool is connected via Nango, we need to create a "shadow" integration
 * record in the database so existing features (polling, analytics, etc.) work.
 * 
 * The DB record stores:
 * - status: 'CONNECTED' 
 * - NO tokens (Nango manages those)
 * - metadata: { nangoManaged: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { db } from '@/lib/db/database';
import { nangoService } from '@/lib/integrations/nango-service';

// Helper to extract tenantId from request
function getTenantIdFromRequest(request: NextRequest): string {
  const queryTenantId = request.nextUrl.searchParams.get('tenantId');
  if (queryTenantId) return queryTenantId;
  
  const pathname = request.nextUrl.pathname;
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length > 0 && pathParts[0] !== 'api') {
    return pathParts[0];
  }
  
  return process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider } = await request.json();
    
    if (!provider || !['jira', 'trello', 'slack'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const tenantId = getTenantIdFromRequest(request);
    const userId = session.user.id;

    console.log(`🔄 Nango Sync: Syncing ${provider} connection to database for user ${userId}`);

    // Check if Nango connection exists
    const isNangoConnected = await nangoService.isConnected(
      provider as 'jira' | 'trello' | 'slack',
      tenantId,
      userId
    );

    if (!isNangoConnected) {
      console.log(`⚠️ Nango Sync: ${provider} not connected in Nango`);
      return NextResponse.json({ 
        success: false, 
        error: `${provider} not connected in Nango` 
      }, { status: 400 });
    }

    // Get connection metadata from Nango
    let metadata: Record<string, any> = { nangoManaged: true, tenantId };
    
    try {
      const nangoMetadata = await nangoService.getConnectionMetadata(
        provider as 'jira' | 'trello' | 'slack',
        tenantId,
        userId
      );
      metadata = { ...metadata, ...nangoMetadata };
    } catch (e) {
      console.warn(`⚠️ Nango Sync: Could not get metadata for ${provider}:`, e);
    }

    // Create/update DB integration record
    const integrationType = provider.toUpperCase() as 'JIRA' | 'TRELLO' | 'SLACK';
    
    await db.upsertIntegration(userId, integrationType, {
      status: 'CONNECTED',
      // No tokens - Nango manages those
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      metadata,
      lastSyncAt: new Date(),
    });

    console.log(`✅ Nango Sync: ${provider} DB record created/updated for user ${userId}`);

    // Automatically register webhooks after successful connection
    let webhookResult: { success: boolean; error?: string } = { success: false };
    try {
      console.log(`🔗 Nango Sync: Attempting to register webhooks for ${provider}...`);
      
      // Get base URL from request headers
      const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:9003';
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
      const baseUrl = `${forwardedProto}://${forwardedHost}`;
      const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
      
      if (provider === 'jira') {
        const { jiraWebhookService } = await import('@/lib/integrations/jira-webhook-service');
        webhookResult = await jiraWebhookService.registerWebhook(userId, baseUrl, basePath);
        if (webhookResult.success) {
          console.log(`✅ Nango Sync: Jira webhooks registered successfully`);
        } else {
          console.warn(`⚠️ Nango Sync: Jira webhook registration failed: ${webhookResult.error}`);
          console.warn(`⚠️ Nango Sync: Polling will be used as fallback for real-time updates`);
        }
      } else if (provider === 'trello') {
        const { trelloWebhookService } = await import('@/lib/integrations/trello-webhook-service');
        // Register webhooks for all boards
        webhookResult = await trelloWebhookService.registerWebhooksForAllBoards(userId, baseUrl, basePath);
        if (webhookResult.success) {
          console.log(`✅ Nango Sync: Trello webhooks registered successfully`);
        } else {
          console.warn(`⚠️ Nango Sync: Trello webhook registration failed: ${webhookResult.error}`);
          console.warn(`⚠️ Nango Sync: Polling will be used as fallback for real-time updates`);
        }
      }
    } catch (webhookError) {
      console.error(`❌ Nango Sync: Error registering webhooks for ${provider}:`, webhookError);
      webhookResult = {
        success: false,
        error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
      };
      // Don't fail the sync if webhook registration fails - polling will handle it
    }

    return NextResponse.json({
      success: true,
      message: `${provider} synced to database`,
      provider,
      tenantId,
      webhookRegistered: webhookResult.success,
      webhookError: webhookResult.error,
    });

  } catch (error) {
    console.error('❌ Nango Sync Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// DELETE - Remove DB record when disconnecting
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const provider = searchParams.get('provider');
    
    if (!provider || !['jira', 'trello', 'slack'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const userId = session.user.id;
    const integrationType = provider.toUpperCase() as 'JIRA' | 'TRELLO' | 'SLACK';

    console.log(`🔄 Nango Sync: Removing ${provider} DB record for user ${userId}`);

    // Update integration status to disconnected
    await db.upsertIntegration(userId, integrationType, {
      status: 'DISCONNECTED',
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      lastSyncAt: new Date(),
    });

    console.log(`✅ Nango Sync: ${provider} DB record marked as disconnected`);

    return NextResponse.json({
      success: true,
      message: `${provider} DB record updated`,
    });

  } catch (error) {
    console.error('❌ Nango Sync Delete Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

