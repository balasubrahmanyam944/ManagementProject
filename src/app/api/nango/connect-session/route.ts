import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Nango } from '@nangohq/node';
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

    const serverUrl =
      process.env.NANGO_SERVER_URL ||
      process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
      'http://localhost:3003';

    const nango = new Nango({
      secretKey,
      ...(serverUrl ? { host: serverUrl } : {}),
    });

    const integrationId = getIntegrationId(provider);
    console.log(`🔗 Nango Connect Session: provider=${provider}, integrationId=${integrationId}, tenant=${tenantId}`);

    const connectSessionPayload: any = {
      // Backward-compatible fields for older SDK/runtime combinations.
      end_user: { id: userId },
      organization: { id: tenantId },
      // Preferred attribution fields (supported by newer Nango APIs).
      tags: {
        end_user_id: userId,
        organization_id: tenantId,
      },
      allowed_integrations: [integrationId],
    };

    const { data } = await nango.createConnectSession(connectSessionPayload);

    return NextResponse.json({
      connectSessionToken: data.token,
      expiresAt: data.expires_at,
      connectLink: data.connect_link,
    });
  } catch (error: any) {
    console.error('❌ Nango connect session error:', error);
    const status = error?.response?.status || 500;
    const upstreamMessage =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Failed to create connect session';
    return NextResponse.json(
      {
        error: upstreamMessage,
        details: error?.response?.data || null
      },
      { status }
    );
  }
}
