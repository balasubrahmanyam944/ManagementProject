import { db, Integration, Project } from '@/lib/db/database'
import { nangoService } from './nango-service'

interface SlackTokenResponse {
	access_token: string
	refresh_token?: string
	expires_in?: number
	team: { id: string; name: string }
	boter?: any
	webhook?: { url: string; channel: string }
}

interface SlackChannel {
	id: string
	name: string
	is_archived?: boolean
	is_private?: boolean
	num_members?: number
}

interface SlackMentions {
	mentioned: boolean
	username?: string
	userId?: string
	mentionCount?: number
}

interface SlackUser {
	id: string
	name: string
	real_name?: string
	profile?: {
		display_name?: string
		real_name?: string
	}
}

class SlackServiceImpl {
	async storeIntegration(userId: string, data: {
		accessToken: string
		refreshToken?: string
		expiresAt?: Date
		teamId: string
		teamName: string
		webhookUrl?: string
		metadata?: any
	}) {
		const integration = await db.upsertIntegration(userId, 'SLACK', {
			status: 'CONNECTED',
			accessToken: data.accessToken,
			refreshToken: data.refreshToken,
			expiresAt: data.expiresAt,
			serverUrl: 'https://slack.com',
			metadata: {
				teamId: data.teamId,
				teamName: data.teamName,
				webhookUrl: data.webhookUrl,
				...data.metadata,
			},
			lastSyncAt: new Date(),
		})
		return integration
	}

	async getIntegration(userId: string): Promise<Integration | null> {
		const integrations = await db.findIntegrationsByUserId(userId)
		return integrations.find(i => i.type === 'SLACK') || null
	}

	async removeIntegration(userId: string): Promise<boolean> {
		const integration = await this.getIntegration(userId)
		if (!integration) return true
		return db.deleteIntegration(integration._id.toString())
	}

	async isConnected(userId: string): Promise<boolean> {
		const integration = await this.getIntegration(userId)
		// Check for Nango-managed connections (no accessToken stored in DB)
		if (integration && integration.status === 'CONNECTED' && integration.metadata?.nangoManaged) {
			return true
		}
		return !!(integration && integration.status === 'CONNECTED' && integration.accessToken)
	}

	/**
	 * Get access token - from Nango if managed, otherwise from DB
	 */
	private async getAccessToken(integration: Integration): Promise<string> {
		// If Nango-managed, get token from Nango
		if (integration.metadata?.nangoManaged) {
			const tenantId = integration.metadata.tenantId || 'default'
			const userId = integration.userId.toString()
			console.log('🔑 SlackService: Getting access token from Nango')
			return await nangoService.getAccessToken('slack', tenantId, userId)
		}
		
		// Otherwise use DB token
		if (!integration.accessToken) {
			throw new Error('No Slack access token available')
		}
		return integration.accessToken
	}

	async fetchAndStoreChannels(userId: string): Promise<SlackChannel[]> {
		const integration = await this.getIntegration(userId)
		if (!integration || integration.status !== 'CONNECTED') {
			throw new Error('Slack integration not connected')
		}

		// Get access token (handles both Nango and DB tokens)
		const accessToken = await this.getAccessToken(integration)
		const channels = await this.fetchChannelsFromSlack(accessToken)
		for (const ch of channels) {
			if (!ch.is_archived) {
				await db.upsertProject(userId, integration._id.toString(), {
					externalId: ch.id,
					name: `#${ch.name}`,
					description: `Slack channel #${ch.name}`,
					isActive: true,
					lastSyncAt: new Date(),
					analytics: {
						totalIssues: 0,
						openIssues: 0,
						inProgressIssues: 0,
						doneIssues: 0,
						dataSource: 'cached',
						lastUpdated: new Date().toISOString(),
					},
				})
			}
		}
		return channels.filter(c => !c.is_archived)
	}

	private async fetchChannelsFromSlack(accessToken: string): Promise<SlackChannel[]> {
		const result: SlackChannel[] = []
		let cursor: string | undefined = undefined
		do {
			const url = new URL('https://slack.com/api/conversations.list')
			url.searchParams.set('limit', '200')
			url.searchParams.set('types', 'public_channel,private_channel')
			if (cursor) url.searchParams.set('cursor', cursor)
			const resp = await fetch(url.toString(), {
				headers: { Authorization: `Bearer ${accessToken}` },
			})
			if (!resp.ok) throw new Error('Failed to fetch Slack channels')
			const data = await resp.json()
			if (!data.ok) throw new Error(data.error || 'Slack API error')
			result.push(...(data.channels || []))
			cursor = data.response_metadata?.next_cursor || undefined
		} while (cursor)
		return result
	}

	async fetchRecentMessages(accessToken: string, channelId: string, limit = 100) {
		const url = new URL('https://slack.com/api/conversations.history')
		url.searchParams.set('channel', channelId)
		url.searchParams.set('limit', String(limit))
		const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
		if (!resp.ok) throw new Error('Failed to fetch Slack messages')
		const data = await resp.json()

		if (!data.ok && data.error === 'not_in_channel') {
			await this.joinChannel(accessToken, channelId)
			const retry = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
			if (!retry.ok) throw new Error('Failed to fetch Slack messages after join')
			const retryData = await retry.json()
			if (!retryData.ok) throw new Error(retryData.error || 'Slack API error after join')
			return retryData.messages || []
		}

		if (!data.ok) throw new Error(data.error || 'Slack API error')
		return data.messages || []
	}

	private async joinChannel(accessToken: string, channelId: string): Promise<void> {
		const resp = await fetch('https://slack.com/api/conversations.join', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ channel: channelId }),
		})
		const data = await resp.json()
		if (!data.ok && data.error !== 'already_in_channel') {
			console.warn(`⚠️ Slack: Could not join channel ${channelId}: ${data.error}`)
		}
	}

	/**
	 * Fetch the connected Slack user's info from stored metadata or API
	 */
	async fetchConnectedUser(accessToken: string, integration?: Integration | null): Promise<SlackUser | null> {
		try {
			// First try to get user ID from stored metadata (from OAuth)
			let slackUserId: string | undefined = integration?.metadata?.authed_user?.id
			
			// If not in metadata, fetch from auth.test
			if (!slackUserId) {
				const url = new URL('https://slack.com/api/auth.test')
				const resp = await fetch(url.toString(), {
					headers: { Authorization: `Bearer ${accessToken}` },
				})
				if (!resp.ok) {
					console.error('auth.test failed:', resp.status)
					return null
				}
				const data = await resp.json()
				console.log('auth.test response:', JSON.stringify(data))
				if (!data.ok) {
					console.error('auth.test not ok:', data.error)
					return null
				}
				slackUserId = data.user_id
			}
			
			if (!slackUserId) {
				console.error('Could not determine Slack user ID')
				return null
			}
			
			console.log('Fetching user info for Slack user ID:', slackUserId)
			
			// Get full user info
			const userUrl = new URL('https://slack.com/api/users.info')
			userUrl.searchParams.set('user', slackUserId)
			const userResp = await fetch(userUrl.toString(), {
				headers: { Authorization: `Bearer ${accessToken}` },
			})
			if (!userResp.ok) {
				console.error('users.info failed:', userResp.status)
				return null
			}
			const userData = await userResp.json()
			console.log('users.info response:', JSON.stringify(userData))
			if (!userData.ok) {
				console.error('users.info not ok:', userData.error)
				return null
			}
			
			return {
				id: userData.user.id,
				name: userData.user.name,
				real_name: userData.user.real_name,
				profile: userData.user.profile,
			}
		} catch (error) {
			console.error('Error fetching connected Slack user:', error)
			return null
		}
	}

	/**
	 * Check if the connected user is mentioned in a channel
	 */
	async checkUserMentionsInChannel(
		accessToken: string,
		channelId: string,
		userId: string,
		limit = 100,
		user?: SlackUser | null
	): Promise<SlackMentions> {
		console.log(`Checking mentions for user ${userId} in channel ${channelId}`)
		
		// Always use message scanning as it's more reliable
		// The search API requires specific scopes that may not be available
		return await this.scanMessagesForMentions(accessToken, channelId, userId, limit, user)
	}

	/**
	 * Fallback method: Scan recent messages for user mentions
	 * Checks for both <@userId> format and @username mentions
	 */
	private async scanMessagesForMentions(
		accessToken: string,
		channelId: string,
		userId: string,
		limit = 100,
		user?: SlackUser | null
	): Promise<SlackMentions> {
		try {
			console.log(`Scanning messages for mentions in channel ${channelId} for user ${userId}`)
			const messages = await this.fetchRecentMessages(accessToken, channelId, limit)
			console.log(`Fetched ${messages.length} messages from channel ${channelId}`)
			
			// Pattern for <@userId> format (standard Slack mention)
			const mentionPattern = new RegExp(`<@${userId}>`, 'gi')
			
			// Also check for username/display name mentions if we have user info
			const username = user?.name
			const displayName = user?.profile?.display_name
			const realName = user?.real_name
			
			let mentionCount = 0
			for (const msg of messages) {
				if (msg.text) {
					// Check for <@userId> pattern
					const userIdMatches = msg.text.match(mentionPattern)
					if (userIdMatches) {
						mentionCount += userIdMatches.length
						console.log(`Found ${userIdMatches.length} <@${userId}> mentions in message`)
					}
					
					// Also check for @username mentions (case insensitive)
					if (username) {
						const usernamePattern = new RegExp(`@${username}\\b`, 'gi')
						const usernameMatches = msg.text.match(usernamePattern)
						if (usernameMatches) {
							mentionCount += usernameMatches.length
							console.log(`Found ${usernameMatches.length} @${username} mentions in message`)
						}
					}
					
					// Check for display name mentions
					if (displayName && displayName !== username) {
						const displayNamePattern = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
						const displayMatches = msg.text.match(displayNamePattern)
						if (displayMatches) {
							mentionCount += displayMatches.length
							console.log(`Found ${displayMatches.length} @${displayName} mentions in message`)
						}
					}
				}
			}
			
			console.log(`Total mentions found for user ${userId} in channel ${channelId}: ${mentionCount}`)
			
			if (mentionCount > 0) {
				return {
					mentioned: true,
					username: displayName || realName || username,
					userId: userId,
					mentionCount: mentionCount,
				}
			}
			
			return { mentioned: false }
		} catch (error) {
			console.error('Error scanning messages for mentions:', error)
			return { mentioned: false }
		}
	}

	/**
	 * Fetch channels with mention info for the connected user
	 */
	async fetchChannelsWithMentions(userId: string): Promise<Array<SlackChannel & { mentions: SlackMentions }>> {
		const integration = await this.getIntegration(userId)
		if (!integration || integration.status !== 'CONNECTED') {
			throw new Error('Slack integration not connected')
		}

		// Get access token (handles both Nango and DB tokens)
		const accessToken = await this.getAccessToken(integration)
		console.log('Fetching channels for mention check...')
		const channels = await this.fetchChannelsFromSlack(accessToken)
		console.log(`Found ${channels.length} channels`)
		
		// Pass integration to get user ID from stored metadata
		const connectedUser = await this.fetchConnectedUser(accessToken, integration)
		console.log('Connected user:', connectedUser ? `${connectedUser.name} (${connectedUser.id})` : 'null')
		
		if (!connectedUser) {
			console.error('Could not fetch connected user, returning channels without mention info')
			// Return channels without mention info if we can't get the user
			return channels.filter(c => !c.is_archived).map(ch => ({
				...ch,
				mentions: { mentioned: false }
			}))
		}

		// Check mentions for each channel (in parallel)
		// Increase limit to check more messages
		const channelsWithMentions = await Promise.all(
			channels.filter(c => !c.is_archived).map(async (ch) => {
				try {
					const mentions = await this.checkUserMentionsInChannel(
						accessToken,
						ch.id,
						connectedUser.id,
						100, // Check last 100 messages per channel
						connectedUser
					)
					return { ...ch, mentions }
				} catch (error) {
					console.error(`Error checking mentions for channel ${ch.name}:`, error)
					return { ...ch, mentions: { mentioned: false } }
				}
			})
		)

		return channelsWithMentions
	}
}

export const slackService = new SlackServiceImpl()

