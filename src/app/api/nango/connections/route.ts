/**
 * Nango Connections API
 * 
 * List and manage connections for a user or tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nangoService, NangoProvider } from '@/lib/integrations/nango-service';

/**
 * GET - List connections
 * Query params:
 * - tenantId: Filter by tenant
 * - userId: Filter by user
 * - provider: Filter by provider
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const tenantId = searchParams.get('tenantId');
    const userId = searchParams.get('userId');
    const provider = searchParams.get('provider') as NangoProvider | null;
    
    console.log(`🔍 Nango API: Listing connections (tenant: ${tenantId}, user: ${userId}, provider: ${provider})`);
    
    const allProviders: NangoProvider[] = ['jira', 'trello', 'slack', 'testrail'];
    const providersToCheck = provider ? [provider] : allProviders;
    
    if (!tenantId || !userId) {
      return NextResponse.json(
        { error: 'tenantId and userId are required' },
        { status: 400 }
      );
    }
    
    // Check connection status for each provider
    const connectionStatuses = await Promise.all(
      providersToCheck.map(async (p) => {
        const status = await nangoService.getConnectionStatus(p, tenantId, userId);
        return {
          provider: p,
          connected: status.connected,
          connectionId: status.connectionId,
          lastRefreshed: status.lastRefreshed?.toISOString(),
          metadata: status.metadata,
        };
      })
    );
    
    return NextResponse.json({
      connections: connectionStatuses,
      tenantId,
      userId,
    });
  } catch (error) {
    console.error('❌ Nango API: Error listing connections:', error);
    
    return NextResponse.json(
      { error: 'Failed to list connections' },
      { status: 500 }
    );
  }
}

