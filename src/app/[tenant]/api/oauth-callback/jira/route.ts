import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { jiraService } from '@/lib/integrations/jira-service';
import { jiraWebhookService } from '@/lib/integrations/jira-webhook-service';

export async function POST(req: NextRequest) {
  console.log('🚀 TENANT OAUTH CALLBACK: ===== STARTING TENANT CALLBACK PROCESS =====');
  console.log('🔍 TENANT OAUTH CALLBACK: Request URL:', req.url);
  console.log('🔍 TENANT OAUTH CALLBACK: Request headers:', Object.fromEntries(req.headers.entries()));
  console.log('🔄 TENANT OAUTH CALLBACK: Receiving data from main server');
  
  try {
    console.log('🔄 TENANT OAUTH CALLBACK: Parsing request body...');
    const integrationData = await req.json();
    console.log('🔍 TENANT OAUTH CALLBACK: Received integration data:', {
      tenant: integrationData.tenant,
      port: integrationData.port,
      userId: integrationData.userId,
      hasAccessToken: !!integrationData.accessToken,
      hasRefreshToken: !!integrationData.refreshToken,
      expiresAt: integrationData.expiresAt,
      serverUrl: integrationData.serverUrl,
      hasMetadata: !!integrationData.metadata
    });
    console.log('🔍 TENANT OAUTH CALLBACK: Full integration data:', integrationData);

    const { tenant, port, userId, accessToken, refreshToken, expiresAt, serverUrl, metadata } = integrationData;
    console.log('🔍 TENANT OAUTH CALLBACK: Extracted data:', {
      tenant,
      port,
      userId,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt,
      serverUrl,
      metadata
    });

    // Skip session verification for OAuth callback from main application
    // The main application has already verified the user and is forwarding the OAuth data
    console.log('🔄 TENANT OAUTH CALLBACK: Skipping session verification (OAuth data from main app)');
    console.log('🔍 TENANT OAUTH CALLBACK: Processing OAuth data for user:', userId);
    
    console.log('✅ TENANT OAUTH CALLBACK: Proceeding with OAuth data processing');

    // Store the integration in the tenant's database
    console.log('🔄 TENANT OAUTH CALLBACK: Storing integration in tenant database...');
    console.log('🔍 TENANT OAUTH CALLBACK: Integration data to store:', {
      userId,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt: new Date(expiresAt),
      serverUrl,
      metadata
    });
    
    const integration = await jiraService.storeIntegration(userId, {
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt),
      serverUrl,
      metadata
    });

    console.log('🔍 TENANT OAUTH CALLBACK: Integration stored:', {
      integrationId: integration?._id,
      hasIntegration: !!integration
    });
    console.log('✅ TENANT OAUTH CALLBACK: Integration saved to tenant database successfully');

    // Fetch and save Jira projects for this tenant
    console.log('🔄 TENANT OAUTH CALLBACK: Fetching Jira projects for tenant...');
    let jiraProjects = [];
    try {
      jiraProjects = await jiraService.fetchAndStoreProjects(userId);
      console.log('🔍 TENANT OAUTH CALLBACK: Found Jira projects:', jiraProjects.length);
      console.log('🔍 TENANT OAUTH CALLBACK: Project details:', jiraProjects.map(p => ({ id: p._id, name: p.name, key: p.key })));
      console.log('✅ TENANT OAUTH CALLBACK: Projects saved to tenant database successfully');
    } catch (projectError) {
      console.warn('⚠️ TENANT OAUTH CALLBACK: Failed to fetch projects:', projectError);
      console.warn('⚠️ TENANT OAUTH CALLBACK: Project error message:', projectError instanceof Error ? projectError.message : 'Unknown error');
      console.warn('⚠️ TENANT OAUTH CALLBACK: Project error stack:', projectError instanceof Error ? projectError.stack : 'No stack trace');
      // Don't fail the entire OAuth flow if project fetching fails
    }

    // Register webhooks for real-time updates
    console.log('🔄 TENANT OAUTH CALLBACK: Registering Jira webhooks...');
    let webhookResult = { success: false, webhookId: undefined as string | undefined };
    try {
      // Use request origin or environment variable to determine tenant URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://localhost:9003';
      const baseUrl = appUrl.replace(/:\d+.*/, `:${port}`);
      const basePath = `/${tenant}`;
      webhookResult = await jiraWebhookService.registerWebhook(userId, baseUrl, basePath);
      if (webhookResult.success) {
        console.log('✅ TENANT OAUTH CALLBACK: Jira webhook registered:', webhookResult.webhookId);
      } else {
        console.warn('⚠️ TENANT OAUTH CALLBACK: Jira webhook registration returned unsuccessful');
      }
    } catch (webhookError) {
      console.warn('⚠️ TENANT OAUTH CALLBACK: Failed to register Jira webhook:', webhookError);
      // Don't fail the entire OAuth flow if webhook registration fails
    }

    console.log('✅ TENANT OAUTH CALLBACK: OAuth flow completed successfully');
    console.log('🚀 TENANT OAUTH CALLBACK: ===== TENANT CALLBACK PROCESS COMPLETED =====');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Jira integration completed successfully',
      projectsCount: jiraProjects?.length || 0,
      integrationId: integration?._id,
      webhookRegistered: webhookResult.success,
      webhookId: webhookResult.webhookId
    });

  } catch (error: any) {
    console.error('❌ TENANT OAUTH CALLBACK: ===== ERROR OCCURRED =====');
    console.error('❌ TENANT OAUTH CALLBACK: Error processing OAuth data:', error);
    console.error('❌ TENANT OAUTH CALLBACK: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ TENANT OAUTH CALLBACK: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('🚀 TENANT OAUTH CALLBACK: ===== ERROR HANDLING COMPLETED =====');
    
    return NextResponse.json({ 
      error: 'Failed to process OAuth data',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
