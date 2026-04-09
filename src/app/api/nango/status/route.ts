/**
 * Nango Connection Status API
 * 
 * Check if a user has an active connection for a specific provider.
 * Uses tenant-scoped connection IDs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nangoService, NangoProvider } from '@/lib/integrations/nango-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const provider = searchParams.get('provider') as NangoProvider;
    const tenantId = searchParams.get('tenantId');
    const userId = searchParams.get('userId');
    
    if (!provider || !tenantId || !userId) {
      return NextResponse.json(
        { 
          error: 'Missing required parameters: provider, tenantId, userId',
          connected: false 
        },
        { status: 400 }
      );
    }
    
    // Validate provider
    const validProviders: NangoProvider[] = ['jira', 'trello', 'slack', 'testrail'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { 
          error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
          connected: false 
        },
        { status: 400 }
      );
    }
    
    console.log(`🔍 Nango API: Checking status for ${provider} (tenant: ${tenantId}, user: ${userId})`);
    
    const status = await nangoService.getConnectionStatus(provider, tenantId, userId);
    
    console.log(`✅ Nango API: Status for ${provider}: ${status.connected ? 'connected' : 'not connected'}`);
    
    return NextResponse.json({
      connected: status.connected,
      provider: status.provider,
      connectionId: status.connectionId,
      lastRefreshed: status.lastRefreshed?.toISOString(),
      metadata: status.metadata,
    });
  } catch (error) {
    console.error('❌ Nango API: Error checking status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check connection status',
        connected: false 
      },
      { status: 500 }
    );
  }
}

