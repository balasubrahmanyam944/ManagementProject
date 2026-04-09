import { ai } from '@/ai/genkit'
import { z } from 'genkit'

const TopicSchema = z.object({
	title: z.string().describe('Short topic label, 1-3 words'),
	description: z.string().optional(),
	messages: z.array(z.object({ ts: z.string(), text: z.string() })).optional(),
})

const SlackChannelAnalysisInput = z.object({
	channelName: z.string().optional(),
	transcript: z.string().describe('Chronological transcript of messages with timestamps and users'),
})

const SlackChannelAnalysisOutput = z.object({
	summary: z.string(),
	primaryIntent: z.string().describe('Single-word or very short phrase intent label'),
	keyInsights: z.array(z.string()),
	actionItems: z.array(z.string()),
	topics: z.array(TopicSchema),
})

export type SlackChannelAnalysisInputType = z.infer<typeof SlackChannelAnalysisInput>
export type SlackChannelAnalysisOutputType = z.infer<typeof SlackChannelAnalysisOutput>

const slackChannelAnalysisPrompt = ai.definePrompt({
	name: 'slackChannelAnalysisPrompt',
	input: { schema: SlackChannelAnalysisInput },
	output: { schema: SlackChannelAnalysisOutput },
	prompt: `You are an expert conversation analyst for Slack channels.

CRITICAL RULES:
- Use ONLY the provided transcript content. Do not invent facts.
- Extract topics/insights strictly grounded in the transcript. If uncertain, omit.
- Keep primaryIntent to a single short label like: Technical, Planning, Support, Bug, Question, Decision.
- Return output exactly matching the schema.

TASK:
1) Read the transcript.
2) Write a 1-2 sentence summary grounded in the transcript.
3) Determine a single-word primary intent.
4) List 4-7 keyInsights as short bullets that reflect what was discussed.
5) Extract up to 5 actionItems as imperative bullets.
6) Identify 2-4 top topics with a 1-3 word title and 2-3 example messages verbatim from the transcript.

TRANSCRIPT START\n{{{transcript}}}\nTRANSCRIPT END`,
})

export const slackChannelAnalysisFlow = ai.defineFlow(
	{
		name: 'slackChannelAnalysisFlow',
		inputSchema: SlackChannelAnalysisInput,
		outputSchema: SlackChannelAnalysisOutput,
	},
	async input => {
		const { output } = await slackChannelAnalysisPrompt(input)
		return output!
	}
)

export async function analyzeSlackWithAI(input: SlackChannelAnalysisInputType): Promise<SlackChannelAnalysisOutputType> {
	return slackChannelAnalysisFlow(input)
}


