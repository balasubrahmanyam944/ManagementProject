import { NextRequest, NextResponse } from 'next/server';
import { trelloService } from '@/lib/integrations/trello-service';
import { trelloWebhookService } from '@/lib/integrations/trello-webhook-service';

export async function POST(req: NextRequest) {
  console.log('🚀 TENANT TRELLO OAUTH CALLBACK: ===== STARTING TENANT CALLBACK PROCESS =====');
  console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Receiving data from main server');
  
  try {
    console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Parsing request body...');
    const integrationData = await req.json();
    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Received integration data:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasAccessTokenSecret: !!integrationData.accessTokenSecret,
      expiresAt: integrationData.expiresAt,
      serverUrl: integrationData.serverUrl,
      hasMetadata: !!integrationData.metadata
    });
    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Full integration data:', integrationData);

    const { tenant, port, userId, accessToken, accessTokenSecret, expiresAt, serverUrl, consumerKey, metadata } = integrationData;
    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Extracted data:', {
      tenant,
      port,
      userId,
      hasAccessToken: !!accessToken,
      hasAccessTokenSecret: !!accessTokenSecret,
      expiresAt,
      serverUrl,
      consumerKey,
      metadata
    });

    // Skip session verification for OAuth callback from main application
    // The main application has already verified the user and is forwarding the OAuth data
    console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Skipping session verification (OAuth data from main app)');
    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Processing OAuth data for user:', userId);
    
    console.log('✅ TENANT TRELLO OAUTH CALLBACK: Proceeding with OAuth data processing');

    // Store the integration in the tenant's database
    console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Storing integration in tenant database...');
    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Integration data to store:', {
      userId,
      hasAccessToken: !!accessToken,
      hasAccessTokenSecret: !!accessTokenSecret,
      expiresAt: new Date(expiresAt),
      serverUrl,
      consumerKey,
      metadata
    });
    
    const integration = await trelloService.storeIntegration(userId, {
      accessToken,
      accessTokenSecret,
      expiresAt: new Date(expiresAt),
      serverUrl,
      consumerKey,
      metadata
    });

    console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Integration stored:', {
      integrationId: integration?._id,
      hasIntegration: !!integration
    });
    console.log('✅ TENANT TRELLO OAUTH CALLBACK: Integration saved to tenant database successfully');

    // Fetch and save Trello boards for this tenant
    console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Fetching Trello boards for tenant...');
    let trelloBoards = [];
    try {
      trelloBoards = await trelloService.fetchAndStoreBoards(userId);
      console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Found Trello boards:', trelloBoards.length);
      console.log('🔍 TENANT TRELLO OAUTH CALLBACK: Board details:', trelloBoards.map(b => ({ id: b._id, name: b.name })));
      console.log('✅ TENANT TRELLO OAUTH CALLBACK: Boards saved to tenant database successfully');
    } catch (boardError) {
      console.warn('⚠️ TENANT TRELLO OAUTH CALLBACK: Failed to fetch boards:', boardError);
      console.warn('⚠️ TENANT TRELLO OAUTH CALLBACK: Board error message:', boardError instanceof Error ? boardError.message : 'Unknown error');
      console.warn('⚠️ TENANT TRELLO OAUTH CALLBACK: Board error stack:', boardError instanceof Error ? boardError.stack : 'No stack trace');
      // Don't fail the entire OAuth flow if board fetching fails
    }

    // Register webhooks for real-time updates
    console.log('🔄 TENANT TRELLO OAUTH CALLBACK: Registering Trello webhooks for all boards...');
    let webhookResult = { success: false, registered: 0, failed: 0, errors: [] as string[] };
    try {
      // Use request origin or environment variable to determine tenant URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
      const baseUrl = appUrl.replace(/:\d+.*/, `:${port}`);
      const basePath = `/${tenant}`;
      webhookResult = await trelloWebhookService.registerWebhooksForAllBoards(userId, baseUrl, basePath);
      if (webhookResult.success) {
        console.log('✅ TENANT TRELLO OAUTH CALLBACK: Trello webhooks registered:', webhookResult.registered);
      } else {
        console.warn('⚠️ TENANT TRELLO OAUTH CALLBACK: Some Trello webhooks failed:', webhookResult.errors);
      }
    } catch (webhookError) {
      console.warn('⚠️ TENANT TRELLO OAUTH CALLBACK: Failed to register Trello webhooks:', webhookError);
      // Don't fail the entire OAuth flow if webhook registration fails
    }

    console.log('✅ TENANT TRELLO OAUTH CALLBACK: OAuth flow completed successfully');
    console.log('🚀 TENANT TRELLO OAUTH CALLBACK: ===== TENANT CALLBACK PROCESS COMPLETED =====');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Trello integration completed successfully',
      boardsCount: trelloBoards?.length || 0,
      integrationId: integration?._id,
      webhooksRegistered: webhookResult.registered,
      webhooksFailed: webhookResult.failed
    });

  } catch (error: any) {
    console.error('❌ TENANT TRELLO OAUTH CALLBACK: ===== ERROR OCCURRED =====');
    console.error('❌ TENANT TRELLO OAUTH CALLBACK: Error processing OAuth data:', error);
    console.error('❌ TENANT TRELLO OAUTH CALLBACK: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ TENANT TRELLO OAUTH CALLBACK: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('🚀 TENANT TRELLO OAUTH CALLBACK: ===== ERROR HANDLING COMPLETED =====');
    
    return NextResponse.json({ 
      error: 'Failed to process OAuth data',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

