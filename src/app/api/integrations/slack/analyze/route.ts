import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { slackService } from '@/lib/integrations/slack-service'
import { analyzeChannelMessages } from '@/lib/integrations/slack-analysis'
import { analyzeSlackWithAI } from '@/ai/flows/slack-channel-analysis'

export async function POST(request: NextRequest) {
	try {
		const session = await getServerSession(authConfig)
		if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		const { channelId, limit } = await request.json()
		if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

		const integration = await slackService.getIntegration(session.user.id)
		if (!integration || integration.status !== 'CONNECTED') {
			return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })
		}

		// Get access token (handles both Nango and DB tokens)
		let accessToken = integration.accessToken
		if (integration.metadata?.nangoManaged) {
			const { nangoService } = await import('@/lib/integrations/nango-service')
			const tenantId = integration.metadata.tenantId || 'default'
			accessToken = await nangoService.getAccessToken('slack', tenantId, session.user.id)
		}
		
		if (!accessToken) {
			return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })
		}

		let messages: any[] = []
		try {
			messages = await slackService.fetchRecentMessages(
				accessToken,
				channelId,
				Math.min(200, Number(limit) || 100)
			)
		} catch (err: any) {
			// Most common production failures are missing scopes or private-channel access.
			const details = err?.message || 'Failed to fetch Slack messages'
			console.error('❌ Slack analyze: Failed to fetch recent messages:', {
				channelId,
				limit,
				details
			})
			return NextResponse.json(
				{ success: false, error: `Failed to fetch Slack messages: ${details}` },
				{ status: 400 }
			)
		}
		const normalized = messages
			.filter((m: any) => typeof m.text === 'string')
			.map((m: any) => ({ ts: m.ts, text: m.text as string, user: m.user }))
		const ruleBased = analyzeChannelMessages(normalized)
		let aiEnriched: any = null
		try {
			const transcript = normalized
				.map(m => `${m.ts} ${m.user || 'user'}: ${m.text}`)
				.join('\n')
				.slice(0, 18000)
			aiEnriched = await analyzeSlackWithAI({ channelName: channelId, transcript })
		} catch {}
		const merged = aiEnriched ? {
			summary: aiEnriched.summary || ruleBased.summary,
			totalMessages: ruleBased.totalMessages,
			intentDistribution: ruleBased.intentDistribution,
			examples: ruleBased.examples,
			analyses: ruleBased.analyses,
			insights: {
				primaryIntent: aiEnriched.primaryIntent || ruleBased.insights?.primaryIntent,
				keyInsights: aiEnriched.keyInsights || ruleBased.insights?.keyInsights || [],
				actionItems: aiEnriched.actionItems || ruleBased.insights?.actionItems || [],
				topics: aiEnriched.topics || ruleBased.insights?.topics || [],
			}
		} : ruleBased

		return NextResponse.json({ success: true, channelId, analysis: merged })
	} catch (e: any) {
		return NextResponse.json({ success: false, error: e?.message || 'Failed to analyze channel' }, { status: 500 })
	}
}

