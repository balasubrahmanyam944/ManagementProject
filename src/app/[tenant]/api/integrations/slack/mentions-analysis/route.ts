import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { slackService } from '@/lib/integrations/slack-service'
import { ai } from '@/ai/genkit'
import { z } from 'genkit'

interface MentionMessage {
  ts: string
  text: string
  user: string
  username?: string
  channel?: string
  permalink?: string
}

// Define the schema for mentions analysis
const MentionsAnalysisOutput = z.object({
  summary: z.string().describe('Brief summary of what people are discussing when mentioning this user'),
  keyTopics: z.array(z.string()).describe('Key topics or themes from the mentions'),
  actionItems: z.array(z.string()).describe('Action items or requests directed at the user'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).describe('Overall sentiment'),
  urgency: z.enum(['low', 'medium', 'high']).describe('Urgency level'),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const channelId = request.nextUrl.searchParams.get('channel')
    const userId = request.nextUrl.searchParams.get('user')

    if (!channelId || !userId) {
      return NextResponse.json(
        { error: 'Channel ID and User ID are required' },
        { status: 400 }
      )
    }

    const integration = await slackService.getIntegration(session.user.id)
    if (!integration || integration.status !== 'CONNECTED' || !integration.accessToken) {
      return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })
    }

    const accessToken = integration.accessToken

    // Get channel info
    let channelName = channelId
    try {
      const channelInfoUrl = new URL('https://slack.com/api/conversations.info')
      channelInfoUrl.searchParams.set('channel', channelId)
      const channelResp = await fetch(channelInfoUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (channelResp.ok) {
        const channelData = await channelResp.json()
        if (channelData.ok && channelData.channel) {
          channelName = `#${channelData.channel.name}`
        }
      }
    } catch (error) {
      console.error('Error fetching channel info:', error)
    }

    // Get user info
    let username = userId
    try {
      const userInfoUrl = new URL('https://slack.com/api/users.info')
      userInfoUrl.searchParams.set('user', userId)
      const userResp = await fetch(userInfoUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userResp.ok) {
        const userData = await userResp.json()
        if (userData.ok && userData.user) {
          username = userData.user.profile?.display_name || 
                     userData.user.real_name || 
                     userData.user.name || 
                     userId
        }
      }
    } catch (error) {
      console.error('Error fetching user info:', error)
    }

    // Fetch messages with mentions
    const messages: MentionMessage[] = []
    const mentionPattern = new RegExp(`<@${userId}>`, 'g')

    try {
      // Fetch conversation history
      const historyUrl = new URL('https://slack.com/api/conversations.history')
      historyUrl.searchParams.set('channel', channelId)
      historyUrl.searchParams.set('limit', '200') // Get more messages for better analysis

      const historyResp = await fetch(historyUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (historyResp.ok) {
        const historyData = await historyResp.json()
        if (historyData.ok && historyData.messages) {
          // Get all user info in batch for efficiency
          const userIds = new Set<string>()
          for (const msg of historyData.messages) {
            if (msg.user) userIds.add(msg.user)
          }
          
          const userMap: Record<string, string> = {}
          for (const uid of userIds) {
            try {
              const msgUserUrl = new URL('https://slack.com/api/users.info')
              msgUserUrl.searchParams.set('user', uid)
              const msgUserResp = await fetch(msgUserUrl.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (msgUserResp.ok) {
                const msgUserData = await msgUserResp.json()
                if (msgUserData.ok && msgUserData.user) {
                  userMap[uid] = msgUserData.user.profile?.display_name || 
                                 msgUserData.user.real_name || 
                                 msgUserData.user.name || uid
                }
              }
            } catch {
              userMap[uid] = uid
            }
          }

          // Filter messages that mention the user
          for (const msg of historyData.messages) {
            if (msg.text && mentionPattern.test(msg.text)) {
              messages.push({
                ts: msg.ts,
                text: msg.text,
                user: msg.user,
                username: userMap[msg.user] || msg.user,
                channel: channelName,
              })
              // Reset regex lastIndex
              mentionPattern.lastIndex = 0
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching mention messages:', error)
    }

    // Generate AI summary of the mentions using Genkit
    let aiSummary = null
    if (messages.length > 0) {
      try {
        const mentionTexts = messages.map(m => 
          `[${m.username}]: ${m.text.replace(new RegExp(`<@${userId}>`, 'g'), `@${username}`)}`
        ).join('\n\n')

        const prompt = `You are analyzing Slack messages where a user named "${username}" was mentioned. 
Analyze these messages and provide a structured analysis.

CRITICAL RULES:
- Use ONLY the provided messages. Do not invent facts.
- Be concise and actionable.
- If there are no clear action items, return an empty array.

Messages:
${mentionTexts}

Provide your analysis with:
1. A brief summary (1-2 sentences) of what people are discussing when mentioning this user
2. Key topics or themes (2-5 items)
3. Action items or requests directed at this user (if any)
4. Overall sentiment: positive, neutral, or negative
5. Urgency level: low, medium, or high`

        const { output } = await ai.generate({
          prompt,
          output: { schema: MentionsAnalysisOutput },
        })

        if (output) {
          aiSummary = output
        }
      } catch (aiError) {
        console.error('Error generating AI summary:', aiError)
        // Continue without AI summary
      }
    }

    const analysis = {
      channelId,
      channelName,
      userId,
      username,
      totalMentions: messages.length,
      messages,
      aiSummary,
      analyzedAt: new Date().toISOString(),
    }

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Mentions analysis API error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze mentions' },
      { status: 500 }
    )
  }
}

