import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import type { NangoProvider } from '@/lib/integrations/nango-service';

const VALID_PROVIDERS: NangoProvider[] = ['jira', 'trello', 'slack', 'testrail'];

function getIntegrationId(provider: NangoProvider): string {
  const fromEnv =
    process.env[`NANGO_INTEGRATION_ID_${provider.toUpperCase()}`] ||
    process.env[`NANGO_${provider.toUpperCase()}_INTEGRATION_ID`];
  return fromEnv || provider;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, tenantId, userId } = await request.json();

    if (!provider || !tenantId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: provider, tenantId, userId' },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    if (session.user.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'NANGO_SECRET_KEY environment variable is not set' },
        { status: 500 }
      );
    }

    const nangoBaseUrl = (
      process.env.NANGO_SERVER_URL ||
      process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
      'https://api.nango.dev'
    ).replace(/\/+$/, '');

    const integrationId = getIntegrationId(provider);
    console.log(`🔗 Nango Connect Session: provider=${provider}, integrationId=${integrationId}, tenant=${tenantId}`);

    // Use direct HTTP to Nango API — bypasses SDK version quirks
    const payloads = [
      {
        tags: { end_user_id: userId, organization_id: tenantId },
        allowed_integrations: [integrationId],
      },
      {
        end_user: { id: userId, display_name: userId },
        organization: { id: tenantId, display_name: tenantId },
        allowed_integrations: [integrationId],
      },
      {
        allowed_integrations: [integrationId],
      },
    ];

    let lastError: string = 'Unknown error';
    for (const payload of payloads) {
      try {
        console.log(`🔗 Nango: Trying POST /connect/sessions with:`, JSON.stringify(payload));
        const resp = await fetch(`${nangoBaseUrl}/connect/sessions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const body = await resp.json();

        if (resp.ok && body?.data?.token) {
          console.log(`✅ Nango: Connect session created successfully`);
          return NextResponse.json({
            connectSessionToken: body.data.token,
            expiresAt: body.data.expires_at,
            connectLink: body.data.connect_link,
          });
        }

        lastError = JSON.stringify(body?.error || body);
        console.warn(`⚠️ Nango: Attempt failed (${resp.status}):`, lastError);
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(`⚠️ Nango: Attempt threw:`, lastError);
      }
    }

    return NextResponse.json(
      { error: `Nango rejected connect session: ${lastError}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('❌ Nango connect session error:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to create connect session' },
      { status: 500 }
    );
  }
}
