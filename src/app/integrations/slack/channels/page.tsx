"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIntegrations } from "@/hooks/useIntegrations";

export default function SlackChannelsPage() {
	const { integrations, projects, fetchIntegrations, syncIntegrations } = useIntegrations();
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!projects.slack) {
			fetchIntegrations();
		}
	}, [projects.slack, fetchIntegrations]);

	const handleSync = async () => {
		setLoading(true);
		try {
			await syncIntegrations('slack');
			await fetchIntegrations();
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Slack Channels</h1>
				<Button onClick={handleSync} disabled={loading}>{loading ? 'Syncing…' : 'Sync Channels'}</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{(projects.slack || []).map((ch: any) => (
					<Card key={ch.id}>
						<CardHeader>
							<CardTitle>{ch.name}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex gap-2">
								<Link href={`/integrations/slack/analyze/${encodeURIComponent(ch.externalId)}`} className="w-full">
									<Button variant="outline" className="w-full">Analyze Channel</Button>
								</Link>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

