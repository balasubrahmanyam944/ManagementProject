import { NextRequest, NextResponse } from 'next/server';
import { slackService } from '@/lib/integrations/slack-service';

export async function POST(req: NextRequest) {
  console.log('🚀 TENANT SLACK OAUTH CALLBACK: ===== STARTING TENANT CALLBACK PROCESS =====');
  console.log('🔍 TENANT SLACK OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 TENANT SLACK OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  console.log('🔄 TENANT SLACK OAUTH CALLBACK: Receiving data from main server');
  
  try {
    console.log('🔄 TENANT SLACK OAUTH CALLBACK: Parsing request body...');
    const integrationData = await req.json();
    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Received integration data:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasRefreshToken: !!integrationData.refreshToken,
      expiresAt: integrationData.expiresAt,
      teamName: integrationData.teamName,
      hasMetadata: !!integrationData.metadata
    });
    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Full integration data:', integrationData);

    const { tenant, port, userId, accessToken, refreshToken, expiresAt, teamId, teamName, webhookUrl, metadata } = integrationData;
    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Extracted data:', {
      tenant,
      port,
      userId,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt,
      teamId,
      teamName,
      webhookUrl,
      metadata
    });

    // Skip session verification for OAuth callback from main application
    // The main application has already verified the user and is forwarding the OAuth data
    console.log('🔄 TENANT SLACK OAUTH CALLBACK: Skipping session verification (OAuth data from main app)');
    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Processing OAuth data for user:', userId);
    
    console.log('✅ TENANT SLACK OAUTH CALLBACK: Proceeding with OAuth data processing');

    // Store the integration in the tenant's database
    console.log('🔄 TENANT SLACK OAUTH CALLBACK: Storing integration in tenant database...');
    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Integration data to store:', {
      userId,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt: new Date(expiresAt),
      teamId,
      teamName,
      webhookUrl,
      metadata
    });
    
    const integration = await slackService.storeIntegration(userId, {
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt),
      teamId,
      teamName,
      webhookUrl,
      metadata
    });

    console.log('🔍 TENANT SLACK OAUTH CALLBACK: Integration stored:', {
      integrationId: integration?._id,
      hasIntegration: !!integration
    });
    console.log('✅ TENANT SLACK OAUTH CALLBACK: Integration saved to tenant database successfully');

    // Fetch and store Slack channels for this tenant
    console.log('🔄 TENANT SLACK OAUTH CALLBACK: Fetching Slack channels for tenant...');
    let slackChannels = [];
    try {
      slackChannels = await slackService.fetchAndStoreChannels(userId);
      console.log('🔍 TENANT SLACK OAUTH CALLBACK: Found Slack channels:', slackChannels.length);
      console.log('🔍 TENANT SLACK OAUTH CALLBACK: Channel details:', slackChannels.map(c => ({ id: c._id, name: c.name })));
      console.log('✅ TENANT SLACK OAUTH CALLBACK: Channels saved to tenant database successfully');
    } catch (channelError) {
      console.warn('⚠️ TENANT SLACK OAUTH CALLBACK: Failed to fetch channels:', channelError);
      console.warn('⚠️ TENANT SLACK OAUTH CALLBACK: Channel error message:', channelError instanceof Error ? channelError.message : 'Unknown error');
      console.warn('⚠️ TENANT SLACK OAUTH CALLBACK: Channel error stack:', channelError instanceof Error ? channelError.stack : 'No stack trace');
      // Don't fail the entire OAuth flow if channel fetching fails
    }

    console.log('✅ TENANT SLACK OAUTH CALLBACK: OAuth flow completed successfully');
    console.log('🚀 TENANT SLACK OAUTH CALLBACK: ===== TENANT CALLBACK PROCESS COMPLETED =====');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Slack integration completed successfully',
      channelsCount: slackChannels?.length || 0,
      integrationId: integration?._id
    });

  } catch (error: any) {
    console.error('❌ TENANT SLACK OAUTH CALLBACK: ===== ERROR OCCURRED =====');
    console.error('❌ TENANT SLACK OAUTH CALLBACK: Error processing OAuth data:', error);
    console.error('❌ TENANT SLACK OAUTH CALLBACK: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ TENANT SLACK OAUTH CALLBACK: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('🚀 TENANT SLACK OAUTH CALLBACK: ===== ERROR HANDLING COMPLETED =====');
    
    return NextResponse.json({ 
      error: 'Failed to process OAuth data',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

