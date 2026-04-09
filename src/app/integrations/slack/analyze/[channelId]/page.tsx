"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SlackAnalyzeChannelPage() {
	const params = useParams();
	const channelId = decodeURIComponent(params.channelId as string);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);

	const analyze = async () => {
		setLoading(true);
		setError(null);
		try {
			const resp = await fetch('/api/integrations/slack/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channelId }),
			});
			if (!resp.ok) throw new Error('Failed to analyze channel');
			const data = await resp.json();
			setResult(data.analysis);
		} catch (e: any) {
			setError(e?.message || 'Analysis failed');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		analyze();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelId]);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">#{channelId}</h1>
				<Button onClick={analyze} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze Channel'}</Button>
			</div>
			{error && <div className="text-sm text-red-600">{error}</div>}
			{!result && (
				<Card>
					<CardHeader>
						<CardTitle>Channel Analysis</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-center py-10 text-muted-foreground">
							<p>Click the button above to analyze all conversations in this channel and get insights about topics, sentiment, and key discussions.</p>
						</div>
					</CardContent>
				</Card>
			)}
			{result && (
				<Card>
					<CardHeader>
						<CardTitle>AI Summary</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm text-muted-foreground mb-4">{result.summary}</div>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
							<Card>
								<CardHeader><CardTitle className="text-base">Key Insights</CardTitle></CardHeader>
								<CardContent>
									<ul className="list-disc list-inside text-sm">
										{(result.insights?.keyInsights || []).map((i: string, idx: number) => (
											<li key={idx}>{i}</li>
										))}
									</ul>
								</CardContent>
							</Card>
							<Card>
								<CardHeader><CardTitle className="text-base">Action Items</CardTitle></CardHeader>
								<CardContent>
									<ul className="list-disc list-inside text-sm">
										{(result.insights?.actionItems || []).map((i: string, idx: number) => (
											<li key={idx}>{i}</li>
										))}
									</ul>
								</CardContent>
							</Card>
							<Card>
								<CardHeader><CardTitle className="text-base">Primary Intent</CardTitle></CardHeader>
								<CardContent>
									<div className="text-sm capitalize">{result.insights?.primaryIntent}</div>
								</CardContent>
							</Card>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
							{Object.entries(result.intentDistribution || {}).map(([k, v]) => (
								<div key={k} className="flex items-center justify-between border rounded p-2">
									<span className="font-medium capitalize">{k}</span>
									<span>{v as number}%</span>
								</div>
							))}
						</div>
						<div className="space-y-4">
							<h3 className="font-semibold">Top Discussed Topics</h3>
							{(result.insights?.topics || []).map((t: any, idx: number) => (
								<Card key={idx}>
									<CardHeader><CardTitle className="text-sm">{t.title}</CardTitle></CardHeader>
									<CardContent>
										<ul className="list-disc list-inside text-sm">
											{t.messages.map((m: any, i: number) => (
												<li key={i}>{m.text}</li>
											))}
										</ul>
									</CardContent>
								</Card>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

