"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Plus, Trash2, ExternalLink, CheckCircle2, AlertCircle, Sparkles, Key, Loader2, RefreshCw, Terminal, ChevronDown, ChevronUp } from "lucide-react";

interface TenantInfo {
	name: string;
	appPort: number;
	mongoPort: number;
	status: 'running' | 'stopped' | 'creating' | 'error' | 'unknown';
	createdAt: string;
	geminiApiKey?: string;
	errorMessage?: string;
}

export default function TenantsPage() {
	const [tenants, setTenants] = useState<TenantInfo[]>([]);
	const [name, setName] = useState('');
	const [geminiApiKey, setGeminiApiKey] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [host, setHost] = useState('localhost');
	const [editingTenant, setEditingTenant] = useState<string | null>(null);
	const [editApiKey, setEditApiKey] = useState('');
	const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
	const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
	const pollRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			setHost(window.location.hostname);
		}
	}, []);

	const loadTenants = useCallback(async () => {
		try {
			const res = await fetch('/api/tenants', { cache: 'no-store' });
			if (!res.ok) {
				throw new Error(`Failed to load tenants: ${res.statusText}`);
			}
			const data = await res.json();
			setTenants(data.tenants ?? []);
			setError(null);
		} catch (err: any) {
			console.error('Error loading tenants:', err);
			// Don't overwrite tenants on transient fetch errors
		}
	}, []);

	// Poll for status updates when any tenant is in "creating" state
	useEffect(() => {
		const hasCreating = tenants.some(t => t.status === 'creating');
		
		if (hasCreating) {
			// Poll every 5 seconds
			if (!pollRef.current) {
				pollRef.current = setInterval(async () => {
					await loadTenants();
				}, 5000);
			}
		} else {
			// Stop polling
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		}

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};
	}, [tenants, loadTenants]);

	// Show success when a tenant transitions from creating → running
	const prevTenantsRef = useRef<TenantInfo[]>([]);
	useEffect(() => {
		for (const t of tenants) {
			const prev = prevTenantsRef.current.find(p => p.name === t.name);
			if (prev?.status === 'creating' && t.status === 'running') {
				setSuccess(`Tenant "${t.name}" is ready! 🎉`);
			}
			if (prev?.status === 'creating' && t.status === 'error') {
				setError(`Tenant "${t.name}" build failed. ${t.errorMessage || 'Check build log for details.'}`);
			}
		}
		prevTenantsRef.current = tenants;
	}, [tenants]);

	useEffect(() => {
		loadTenants();
	}, [loadTenants]);

	async function onCreate(e: React.FormEvent) {
		e.preventDefault();
		if (!name) return;
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await fetch('/api/tenants', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, geminiApiKey: geminiApiKey || undefined }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Failed');
			setName('');
			setGeminiApiKey('');
			setSuccess(`Tenant "${name}" is being created... This may take several minutes. You can navigate away and come back.`);
			await loadTenants();
		} catch (err: any) {
			setError(err.message ?? 'Unknown error');
		} finally {
			setBusy(false);
		}
	}

	async function onRetryBuild(tenantName: string) {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await fetch('/api/tenants', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'retry', name: tenantName }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Failed');
			setSuccess(`Retrying build for "${tenantName}"...`);
			await loadTenants();
		} catch (err: any) {
			setError(err.message ?? 'Unknown error');
		} finally {
			setBusy(false);
		}
	}

	async function fetchBuildLog(tenantName: string) {
		try {
			const res = await fetch(`/api/tenants?action=buildLog&name=${encodeURIComponent(tenantName)}`);
			if (res.ok) {
				const data = await res.json();
				setBuildLogs(prev => ({ ...prev, [tenantName]: data.log || 'No log available.' }));
			}
		} catch {
			setBuildLogs(prev => ({ ...prev, [tenantName]: 'Failed to fetch build log.' }));
		}
	}

	function toggleBuildLog(tenantName: string) {
		setExpandedLogs(prev => {
			const newSet = new Set(prev);
			if (newSet.has(tenantName)) {
				newSet.delete(tenantName);
			} else {
				newSet.add(tenantName);
				fetchBuildLog(tenantName);
			}
			return newSet;
		});
	}

	async function onUpdateApiKey(tenantName: string) {
		if (!editApiKey) {
			setError('Please enter a Gemini API key');
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const res = await fetch('/api/tenants', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: tenantName, geminiApiKey: editApiKey }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Failed');
			setEditingTenant(null);
			setEditApiKey('');
			setSuccess(`API key updated for "${tenantName}". Container is restarting...`);
			await loadTenants();
		} catch (err: any) {
			setError(err.message ?? 'Unknown error');
		} finally {
			setBusy(false);
		}
	}

	async function onDelete(tenantName: string) {
		if (!confirm(`Delete tenant "${tenantName}"? This will stop containers and remove files. Volumes will be preserved.`)) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`/api/tenants?name=${encodeURIComponent(tenantName)}`, { method: 'DELETE' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? 'Failed');
			await loadTenants();
		} catch (err: any) {
			setError(err.message ?? 'Unknown error');
		} finally {
			setBusy(false);
		}
	}

	function getStatusBadge(t: TenantInfo) {
		switch (t.status) {
			case 'running':
				return (
					<Badge 
						variant="success"
						className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
					>
						<CheckCircle2 className="h-3 w-3 mr-1" />
						running
					</Badge>
				);
			case 'creating':
				return (
					<Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse">
						<Loader2 className="h-3 w-3 mr-1 animate-spin" />
						building...
					</Badge>
				);
			case 'error':
				return (
					<Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
						<AlertCircle className="h-3 w-3 mr-1" />
						error
					</Badge>
				);
			default:
				return (
					<Badge variant="secondary">
						{t.status}
					</Badge>
				);
		}
	}

	return (
		<div className="flex flex-col gap-8">
			<PageHeader
				title="Tenant Manager"
				icon={<Settings className="h-5 w-5 text-white" />}
				gradient="from-violet-500 to-purple-500"
				description="Create and manage multi-tenant instances"
			/>
			
			{/* Create Tenant Form */}
			<Card className="overflow-hidden">
				<div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
				<CardHeader className="border-b border-border/50 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg">
							<Plus className="h-5 w-5 text-white" />
						</div>
						<div>
							<CardTitle>Create New Tenant</CardTitle>
							<CardDescription>Set up a new tenant instance with its own database and port</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="pt-6">
					<form onSubmit={onCreate} className="space-y-4">
						<div className="grid md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-sm font-medium">Tenant Name</label>
								<Input
									type="text"
									placeholder="e.g., companyA"
									value={name}
									onChange={e => setName(e.target.value)}
									className="bg-muted/50"
								/>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium">Gemini API Key (optional)</label>
								<div className="flex items-center gap-2">
									<Input
										type="password"
										placeholder="Enter API key"
										value={geminiApiKey}
										onChange={e => setGeminiApiKey(e.target.value)}
										className="bg-muted/50"
									/>
									<span className="text-xs text-muted-foreground whitespace-nowrap">
										Get one from{' '}
										<a 
											href="https://aistudio.google.com/app/apikey" 
											target="_blank" 
											rel="noreferrer" 
											className="text-primary hover:underline inline-flex items-center gap-1"
										>
											Google AI Studio <ExternalLink className="h-3 w-3" />
										</a>
									</span>
								</div>
							</div>
						</div>
						<Button 
							type="submit" 
							disabled={busy || !name} 
							className="rounded-full bg-gradient-to-r from-violet-500 to-purple-500 hover:opacity-90"
						>
							{busy ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Creating...
								</>
							) : (
								<>
									<Plus className="h-4 w-4 mr-2" />
									Create Tenant
								</>
							)}
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* Success/Error Messages */}
			{error && (
				<Alert variant="destructive" className="animate-scale-in">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20 animate-scale-in">
					<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					<AlertDescription className="text-emerald-800 dark:text-emerald-200">{success}</AlertDescription>
				</Alert>
			)}
			
			{/* Tenants Table */}
			<Card className="overflow-hidden">
				<CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-purple-500/5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg">
							<Settings className="h-5 w-5 text-white" />
						</div>
						<div>
							<CardTitle>Tenants ({tenants.length})</CardTitle>
							<CardDescription>Manage your tenant instances and configurations</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b border-border/50 bg-muted/30">
									<th className="py-3 px-4 text-left text-sm font-semibold">Tenant</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">App URL</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">DB Port</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">Status</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">API Key</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">Created</th>
									<th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
								</tr>
							</thead>
							<tbody>
								{tenants.map((t, index) => (
									<>
										<tr 
											key={t.name} 
											className="border-b border-border/30 hover:bg-muted/20 transition-colors"
											style={{ animationDelay: `${index * 50}ms` }}
										>
											<td className="py-3 px-4">
												<span className="font-medium">{t.name}</span>
											</td>
											<td className="py-3 px-4">
												{t.status === 'creating' ? (
													<span className="text-sm text-muted-foreground italic">Building...</span>
												) : t.status === 'error' ? (
													<span className="text-sm text-red-400 italic">Build failed</span>
												) : (
													<a 
														className="text-primary hover:underline inline-flex items-center gap-1 font-mono text-sm" 
														href={`https://${host}:${t.appPort}/${t.name}`} 
														target="_blank" 
														rel="noreferrer"
													>
														{`https://${host}:${t.appPort}/${t.name}`}
														<ExternalLink className="h-3 w-3" />
													</a>
												)}
											</td>
											<td className="py-3 px-4">
												<Badge variant="outline" className="font-mono">{t.mongoPort}</Badge>
											</td>
											<td className="py-3 px-4">
												{getStatusBadge(t)}
											</td>
											<td className="py-3 px-4">
												{editingTenant === t.name ? (
													<div className="flex items-center gap-2">
														<Input
															type="password"
															placeholder="Enter API key"
															value={editApiKey}
															onChange={e => setEditApiKey(e.target.value)}
															className="h-8 text-sm w-48 bg-muted/50"
														/>
														<Button
															onClick={() => onUpdateApiKey(t.name)}
															disabled={busy}
															size="sm"
															className="h-8 bg-emerald-600 hover:bg-emerald-700"
														>
															Save
														</Button>
														<Button
															onClick={() => { setEditingTenant(null); setEditApiKey(''); }}
															size="sm"
															variant="outline"
															className="h-8"
														>
															Cancel
														</Button>
													</div>
												) : (
													<div className="flex items-center gap-2">
														<span className={`text-sm flex items-center gap-1 ${t.geminiApiKey ? 'text-emerald-400' : 'text-muted-foreground'}`}>
															{t.geminiApiKey ? (
																<>
																	<Key className="h-3 w-3" />
																	<span className="font-mono">••••••••</span>
																</>
															) : (
																'Not set'
															)}
														</span>
														{t.status === 'running' && (
															<Button
																onClick={() => { setEditingTenant(t.name); setEditApiKey(''); }}
																variant="ghost"
																size="sm"
																className="h-7 text-xs text-primary hover:text-primary"
															>
																{t.geminiApiKey ? 'Update' : 'Add'}
															</Button>
														)}
													</div>
												)}
											</td>
											<td className="py-3 px-4 text-sm text-muted-foreground">
												{new Date(t.createdAt).toLocaleString()}
											</td>
											<td className="py-3 px-4">
												<div className="flex items-center gap-2">
													{t.status === 'error' && (
														<Button 
															onClick={() => onRetryBuild(t.name)} 
															variant="outline"
															size="sm"
															className="rounded-full text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
															disabled={busy}
														>
															<RefreshCw className="h-3.5 w-3.5 mr-1" />
															Retry
														</Button>
													)}
													{(t.status === 'creating' || t.status === 'error') && (
														<Button 
															onClick={() => toggleBuildLog(t.name)} 
															variant="ghost"
															size="sm"
															className="rounded-full"
														>
															<Terminal className="h-3.5 w-3.5 mr-1" />
															Log
															{expandedLogs.has(t.name) ? (
																<ChevronUp className="h-3 w-3 ml-1" />
															) : (
																<ChevronDown className="h-3 w-3 ml-1" />
															)}
														</Button>
													)}
													<Button 
														onClick={() => onDelete(t.name)} 
														variant="destructive"
														size="sm"
														className="rounded-full"
														disabled={busy}
													>
														<Trash2 className="h-4 w-4 mr-1" />
														Delete
													</Button>
												</div>
											</td>
										</tr>
										{/* Build Log Expandable Row */}
										{expandedLogs.has(t.name) && (
											<tr key={`${t.name}-log`}>
												<td colSpan={7} className="p-0">
													<div className="bg-zinc-950 border-t border-zinc-800 p-4 max-h-64 overflow-auto">
														<div className="flex items-center justify-between mb-2">
															<span className="text-xs font-medium text-zinc-400">Build Log — {t.name}</span>
															{t.status === 'creating' && (
																<Button
																	onClick={() => fetchBuildLog(t.name)}
																	variant="ghost"
																	size="sm"
																	className="h-6 text-xs text-zinc-400 hover:text-zinc-200"
																>
																	<RefreshCw className="h-3 w-3 mr-1" />
																	Refresh
																</Button>
															)}
														</div>
														<pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
															{buildLogs[t.name] || 'Loading...'}
														</pre>
													</div>
												</td>
											</tr>
										)}
									</>
								))}
								{tenants.length === 0 && (
									<tr>
										<td colSpan={7} className="py-12 text-center">
											<div className="flex flex-col items-center gap-3">
												<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
													<Settings className="h-8 w-8 text-violet-500/50" />
												</div>
												<p className="text-muted-foreground">No tenants created yet</p>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			{/* Instructions */}
			<Card className="overflow-hidden border-primary/20">
				<CardHeader className="border-b border-border/50 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-emerald-500/5">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
							<Sparkles className="h-5 w-5 text-white" />
						</div>
						<CardTitle>How to configure Gemini API Key</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-6">
					<ol className="list-decimal list-inside space-y-3 text-sm">
						<li className="flex items-start gap-2">
							<span className="text-muted-foreground">Go to</span>
							<a 
								href="https://aistudio.google.com/app/apikey" 
								target="_blank" 
								rel="noreferrer" 
								className="text-primary hover:underline inline-flex items-center gap-1"
							>
								Google AI Studio <ExternalLink className="h-3 w-3" />
							</a>
						</li>
						<li className="text-muted-foreground">Click "Create API Key"</li>
						<li className="text-muted-foreground">Copy the key and paste it here</li>
						<li className="text-muted-foreground">The tenant container will restart automatically to apply the new key</li>
					</ol>
				</CardContent>
			</Card>
		</div>
	);
}
