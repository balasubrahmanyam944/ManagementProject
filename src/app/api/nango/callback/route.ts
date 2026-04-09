/**
 * Nango OAuth Callback API
 * 
 * This endpoint handles post-OAuth callback processing.
 * Nango handles the actual OAuth callback, but we can use this
 * to sync data after a successful connection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nangoService, NangoProvider } from '@/lib/integrations/nango-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { provider, tenantId, userId, syncData = true } = body as {
      provider: NangoProvider;
      tenantId: string;
      userId: string;
      syncData?: boolean;
    };
    
    if (!provider || !tenantId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: provider, tenantId, userId' },
        { status: 400 }
      );
    }
    
    console.log(`🔄 Nango Callback: Processing ${provider} connection (tenant: ${tenantId}, user: ${userId})`);
    
    // Verify the connection exists
    const isConnected = await nangoService.isConnected(provider, tenantId, userId);
    
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }
    
    // Get connection metadata
    const metadata = await nangoService.getConnectionMetadata(provider, tenantId, userId);
    
    console.log(`✅ Nango Callback: Connection verified for ${provider}`, metadata);
    
    // Optionally trigger initial data sync
    if (syncData) {
      // This can be expanded to trigger async sync jobs
      console.log(`🔄 Nango Callback: Triggering initial sync for ${provider}`);
      
      // For now, we just return success
      // You could add background job triggering here
    }
    
    return NextResponse.json({
      success: true,
      provider,
      connectionId: nangoService.getConnectionId(tenantId, userId),
      metadata,
    });
  } catch (error) {
    console.error('❌ Nango Callback: Error processing callback:', error);
    
    return NextResponse.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check callback status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const provider = searchParams.get('provider') as NangoProvider;
  const connectionId = searchParams.get('connectionId');
  
  if (!provider || !connectionId) {
    return NextResponse.json(
      { error: 'Missing required parameters: provider, connectionId' },
      { status: 400 }
    );
  }
  
  // Parse connection ID to get tenant and user
  const parts = connectionId.split('_');
  if (parts.length < 2) {
    return NextResponse.json(
      { error: 'Invalid connection ID format' },
      { status: 400 }
    );
  }
  
  const tenantId = parts[0];
  const userId = parts.slice(1).join('_');
  
  try {
    const isConnected = await nangoService.isConnected(provider, tenantId, userId);
    
    return NextResponse.json({
      connected: isConnected,
      provider,
      connectionId,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      provider,
      connectionId,
      error: 'Failed to check connection',
    });
  }
}

