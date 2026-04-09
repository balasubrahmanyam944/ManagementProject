export type IntentKey = 'question' | 'problem' | 'planning' | 'collaboration' | 'technical'

export interface IntentScore {
	intent: IntentKey
	score: number // 0-100
	confidence: number // 1-10
	keywords: string[]
}

export interface MessageAnalysis {
	ts: string
	text: string
	user?: string
	intents: IntentScore[]
	sentiment?: { label: 'positive' | 'negative' | 'neutral'; score: number }
}

const INTENT_KEYWORDS: Record<IntentKey, { phrases: string[]; keywords: string[]; weight: number }> = {
	question: {
		phrases: ['can someone', 'how do', 'any idea', 'does anyone know', 'what is', 'could we', 'should we'],
		keywords: ['?', 'help', 'why', 'how', 'what', 'where', 'when'],
		weight: 1.2,
	},
	problem: {
		phrases: ['i am stuck', 'it fails', 'we have an issue', 'i got an error', 'it is broken'],
		keywords: ['error', 'fail', 'bug', 'issue', 'broken', 'fix'],
		weight: 1.3,
	},
	planning: {
		phrases: ['we need to schedule', 'let us plan', 'deadline is', 'set up a meeting', 'we should deliver'],
		keywords: ['plan', 'deadline', 'schedule', 'milestone', 'sprint', 'estimate'],
		weight: 1.1,
	},
	collaboration: {
		phrases: ['please review', 'sharing this', 'pair on this', 'team up', 'cc '],
		keywords: ['review', 'share', 'thanks', 'together', 'help', 'cc'],
		weight: 1.0,
	},
	technical: {
		phrases: ['api response', 'http', 'endpoint', 'query', 'schema', 'refactor', 'stack trace'],
		keywords: ['api', 'http', 'endpoint', 'code', 'sql', 'schema', 'refactor', 'stacktrace'],
		weight: 1.15,
	},
}

function computeIntentScores(textRaw: string): IntentScore[] {
	const text = (textRaw || '').toLowerCase()
	const lengthFactor = Math.min(1.5, Math.max(0.5, text.length / 120))
	const scores: IntentScore[] = []
	for (const intent of Object.keys(INTENT_KEYWORDS) as IntentKey[]) {
		const cfg = INTENT_KEYWORDS[intent]
		let score = 0
		const matched: string[] = []
		for (const phrase of cfg.phrases) {
			if (text.includes(phrase)) {
				score += 20
				matched.push(phrase)
			}
		}
		for (const kw of cfg.keywords) {
			if (text.includes(kw)) {
				score += 8
				matched.push(kw)
			}
		}
		score = Math.round(score * cfg.weight * lengthFactor)
		if (score > 0) {
			const confidence = Math.min(10, Math.max(1, Math.round(score / 15)))
			scores.push({ intent, score: Math.min(100, score), confidence, keywords: matched.slice(0, 6) })
		}
	}
	return scores.sort((a, b) => b.score - a.score)
}

export function analyzeChannelMessages(messages: Array<{ ts: string; text: string; user?: string }>): {
	summary: string
	totalMessages: number
	intentDistribution: Record<IntentKey, number>
	examples: Record<IntentKey, Array<{ ts: string; text: string }>>
	analyses: MessageAnalysis[]
	insights: {
		primaryIntent: IntentKey
		keyInsights: string[]
		actionItems: string[]
		topics: Array<{ title: string; messages: Array<{ ts: string; text: string }> }>
	}
} {
	const analyses: MessageAnalysis[] = []
	const counts: Record<IntentKey, number> = { question: 0, problem: 0, planning: 0, collaboration: 0, technical: 0 }
	const examples: Record<IntentKey, Array<{ ts: string; text: string }>> = {
		question: [], problem: [], planning: [], collaboration: [], technical: []
	}
	for (const m of messages) {
		const intents = computeIntentScores(m.text)
		analyses.push({ ts: m.ts, text: m.text, user: m.user, intents })
		if (intents.length > 0) {
			const top = intents[0].intent
			counts[top] += 1
			if (examples[top].length < 3) examples[top].push({ ts: m.ts, text: m.text })
		}
	}
	const total = messages.length || 1
	const distribution = Object.fromEntries(
		(Object.keys(counts) as IntentKey[]).map(k => [k, Math.round((counts[k] / total) * 100)])
	) as Record<IntentKey, number>
	const primaryIntent = (Object.keys(counts) as IntentKey[]).sort((a, b) => counts[b] - counts[a])[0]
	const keyInsights: string[] = [
		`Most discussed: ${primaryIntent} (${distribution[primaryIntent]}%)`,
		`Questions: ${distribution.question}% • Problems: ${distribution.problem}% • Planning: ${distribution.planning}%`,
	]
	const actionItems = analyses
		.filter(a => a.intents.some(i => i.intent === 'planning' && i.score >= 30))
		.slice(0, 5)
		.map(a => a.text)
	const topics = (Object.keys(examples) as IntentKey[]).map(k => ({
		title: k === 'technical' ? 'Technical Discussion' : k.charAt(0).toUpperCase() + k.slice(1),
		messages: examples[k].slice(0, 5),
	}))
	const summary = `Analyzed ${messages.length} messages. Primary intent: ${primaryIntent}.`
	return { summary, totalMessages: messages.length, intentDistribution: distribution, examples, analyses, insights: { primaryIntent, keyInsights, actionItems, topics } }
}

