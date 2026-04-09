"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { MessageSquare, BarChart3, Lightbulb, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SlackAnalyzeChannelPage() {
	const params = useParams();
	const channelParam = decodeURIComponent(params.channelId as string);
	const channelDisplayName = useMemo(() => channelParam.startsWith('#') ? channelParam : `#${channelParam}`, [channelParam]);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);
	const [resolvedId, setResolvedId] = useState<string | null>(null);

	const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

	const resolveChannelId = async () => {
		try {
			const res = await fetch(`${basePath}/api/integrations/status`);
			if (!res.ok) throw new Error('Failed to load channels');
			const data = await res.json();
			const allSlack = (data.projects?.slack || []) as any[];
			const byName = allSlack.find(p => (p.name || '').replace(/^#/, '') === channelDisplayName.replace(/^#/, ''));
			if (byName) {
				setResolvedId(byName.externalId);
				return byName.externalId as string;
			}
			// Fallback: if param looks like an ID, use it
			setResolvedId(channelParam);
			return channelParam;
		} catch (e: any) {
			setError(e?.message || 'Failed to resolve channel');
			setResolvedId(channelParam);
			return channelParam;
		}
	};

	const analyze = async () => {
		setLoading(true);
		setError(null);
		try {
			const id = resolvedId || await resolveChannelId();
			const resp = await fetch(`${basePath}/api/integrations/slack/analyze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channelId: id }),
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
		resolveChannelId().then(() => analyze());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelParam]);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Link href="/communication-overview">
						<Button variant="ghost" size="sm" className="mr-2">
							<ArrowLeft className="h-4 w-4 mr-1" />
							Back
						</Button>
					</Link>
					<div className="p-2 rounded-lg bg-primary/10 text-primary">
						<MessageSquare className="h-5 w-5" />
					</div>
					<div>
						<h1 className="text-2xl font-semibold leading-tight">{channelDisplayName}</h1>
						<p className="text-sm text-muted-foreground">Ready to analyze conversations in this channel</p>
					</div>
				</div>
				<Button onClick={analyze} disabled={loading} className="min-w-[160px]">{loading ? 'Analyzing…' : 'Analyze Channel'}</Button>
			</div>
			{error && <div className="text-sm text-red-600">{error}</div>}
			{!result && (
				 <div className="flex items-center justify-center py-10">
				 <Loader2 className="h-12 w-12 animate-spin text-primary" />
				 <p className="ml-4 text-lg">Analysing channel...</p>
			   </div>
			)}
			{result && (
				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> AI Summary</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm text-muted-foreground mb-6 leading-relaxed">{result.summary}</div>

						{/* Quick Stats */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
							<Card className="bg-muted/40">
								<CardContent className="pt-4">
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">Total Messages</span>
										<span className="text-xl font-semibold">{result.totalMessages ?? '-'}</span>
									</div>
								</CardContent>
							</Card>
							<Card className="bg-muted/40">
								<CardContent className="pt-4">
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">Primary Intent</span>
										<span className="text-xl font-semibold capitalize">{result.insights?.primaryIntent || '-'}</span>
									</div>
								</CardContent>
							</Card>
							<Card className="bg-muted/40">
								<CardContent className="pt-4">
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">Topics</span>
										<span className="text-xl font-semibold">{(result.insights?.topics || []).length}</span>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Insights full-width */}
						<Card className="mb-8">
							<CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Key Insights</CardTitle></CardHeader>
							<CardContent>
								<ul className="space-y-2 text-sm">
									{(result.insights?.keyInsights || []).map((i: string, idx: number) => (
										<li key={idx} className="pl-3 border-l-2 border-muted-foreground/20">{i}</li>
									))}
								</ul>
							</CardContent>
						</Card>

						{/* Intent distribution */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
							{Object.entries(result.intentDistribution || {}).map(([k, v]) => (
								<div key={k} className="space-y-1">
									<div className="flex items-center justify-between text-sm">
										<span className="font-medium capitalize">{k}</span>
										<span className="text-muted-foreground">{v as number}%</span>
									</div>
									<div className="h-2 rounded bg-muted">
										<div className="h-2 rounded bg-primary" style={{ width: `${v as number}%` }} />
									</div>
								</div>
							))}
						</div>

						{/* Topics */}
						<div className="space-y-4">
							<h3 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Top Discussed Topics</h3>
							{(result.insights?.topics || []).map((t: any, idx: number) => (
								<Card key={idx} className="shadow-xs">
									<CardHeader><CardTitle className="text-sm">{t.title}</CardTitle></CardHeader>
									<CardContent>
										<ul className="space-y-2 text-sm">
											{t.messages.map((m: any, i: number) => (
												<li key={i} className="p-2 rounded bg-muted/50">{m.text}</li>
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

