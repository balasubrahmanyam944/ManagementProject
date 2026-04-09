import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { slackService } from '@/lib/integrations/slack-service'

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || ''

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url)
	const code = searchParams.get('code')
	const state = searchParams.get('state')
	const error = searchParams.get('error')

	if (error) {
		const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?slack_error=${encodeURIComponent(error)}`
		return NextResponse.redirect(redirectUrl)
	}

	if (!code || !state) {
		return NextResponse.json({ error: 'Missing Slack OAuth parameters' }, { status: 400 })
	}

	const cookieStore = await cookies()
	const storedState = cookieStore.get('slack_oauth_state')?.value
	if (!storedState || storedState !== state) {
		return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
	}

	const session = await getServerSession(authConfig)
	if (!session?.user?.id) {
		const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?slack_error=not_authenticated`
		return NextResponse.redirect(redirectUrl)
	}

	if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
		return NextResponse.json({ error: 'Slack OAuth not configured' }, { status: 500 })
	}

	try {
		const redirect_uri = `${process.env.NEXTAUTH_URL || NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`
		const resp = await fetch('https://slack.com/api/oauth.v2.access', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: SLACK_CLIENT_ID,
				client_secret: SLACK_CLIENT_SECRET,
				code,
				redirect_uri,
			}).toString(),
		})
		if (!resp.ok) {
			throw new Error('Slack token exchange failed')
		}
		const data = await resp.json()
		if (!data.ok) {
			throw new Error(data.error || 'Slack OAuth error')
		}

		const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
		await slackService.storeIntegration(session.user.id, {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt,
			teamId: data.team?.id,
			teamName: data.team?.name,
			webhookUrl: data.incoming_webhook?.url,
			metadata: { scope: data.scope, authed_user: data.authed_user },
		})

		// Fetch and store channels as projects
		await slackService.fetchAndStoreChannels(session.user.id)

		const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?slack=connected`
		return NextResponse.redirect(redirectUrl)
	} catch (e: any) {
		const redirectUrl = `${NEXT_PUBLIC_APP_URL}/integrations?slack_error=${encodeURIComponent(e.message || 'unknown')}`
		return NextResponse.redirect(redirectUrl)
	}
}

