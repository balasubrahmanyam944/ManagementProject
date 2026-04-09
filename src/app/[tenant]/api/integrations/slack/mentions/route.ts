import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { slackService } from '@/lib/integrations/slack-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Slack mentions API called for user:', session.user.id)

    const channelId = request.nextUrl.searchParams.get('channelId')
    
    // If channelId is provided, get mentions for that specific channel
    if (channelId) {
      console.log('Fetching mentions for specific channel:', channelId)
      const integration = await slackService.getIntegration(session.user.id)
      if (!integration || integration.status !== 'CONNECTED' || !integration.accessToken) {
        console.error('Slack not connected for user:', session.user.id)
        return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })
      }

      const connectedUser = await slackService.fetchConnectedUser(integration.accessToken, integration)
      console.log('Connected user for single channel check:', connectedUser?.id, connectedUser?.name)
      
      if (!connectedUser) {
        console.error('Could not fetch connected user')
        return NextResponse.json({ 
          mentions: { mentioned: false } 
        })
      }

      const mentions = await slackService.checkUserMentionsInChannel(
        integration.accessToken,
        channelId,
        connectedUser.id,
        100,
        connectedUser
      )

      console.log('Mentions result for channel', channelId, ':', mentions)
      return NextResponse.json({ mentions })
    }

    // Otherwise, get mentions for all channels
    try {
      console.log('Fetching mentions for all channels...')
      const channelsWithMentions = await slackService.fetchChannelsWithMentions(session.user.id)
      
      // Convert to a map of channelId -> mentions
      const mentionsMap: Record<string, { mentioned: boolean; username?: string; userId?: string; mentionCount?: number }> = {}
      
      let mentionedCount = 0
      for (const channel of channelsWithMentions) {
        mentionsMap[channel.id] = channel.mentions
        if (channel.mentions.mentioned) {
          mentionedCount++
        }
      }

      console.log(`Found mentions in ${mentionedCount} out of ${channelsWithMentions.length} channels`)
      console.log('Mentions map:', JSON.stringify(mentionsMap))

      return NextResponse.json({ 
        mentionsMap,
        success: true 
      })
    } catch (error) {
      console.error('Error fetching channel mentions:', error)
      return NextResponse.json({ 
        mentionsMap: {},
        success: false,
        error: 'Failed to fetch mentions'
      })
    }
  } catch (error) {
    console.error('Slack mentions API error:', error)
    return NextResponse.json(
      { error: 'Failed to get mentions' },
      { status: 500 }
    )
  }
}

