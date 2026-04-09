"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ExternalLink, AlertTriangle, Info, Settings, RefreshCw, MessageSquare, AtSign, User, Hash, Sparkles, ArrowRight, Zap, Clock } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, type Project, type SlackMentions } from "@/hooks/useIntegrations";

export default function CommunicationOverviewPage() {
  const { integrations, projects, loading, error, fetchIntegrations, syncIntegrations, invalidateCache } = useIntegrations();
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [mentionsMap, setMentionsMap] = useState<Record<string, SlackMentions>>({});
  const [loadingMentions, setLoadingMentions] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  useEffect(() => {
    if (initialLoad && !loading) {
      fetchIntegrations(false);
      setInitialLoad(false);
    }
  }, [loading, initialLoad, fetchIntegrations]);

  useEffect(() => {
    const fetchMentions = async () => {
      if (projects.slack && projects.slack.length > 0 && integrations?.slack?.connected) {
        setLoadingMentions(true);
        try {
          const response = await fetch(`${basePath}/api/integrations/slack/mentions`);
          if (response.ok) {
            const data = await response.json();
            if (data.mentionsMap) {
              setMentionsMap(data.mentionsMap);
            }
          }
        } catch (error) {
          console.error('Error fetching mentions:', error);
        } finally {
          setLoadingMentions(false);
        }
      }
    };

    fetchMentions();
  }, [projects.slack, integrations?.slack?.connected, basePath]);

  const getChannelLink = (channel: Project) => {
    const channelPath = channel.name || `#${channel.externalId}`;
    return `/communication-overview/slack/analyze/${encodeURIComponent(channelPath)}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      invalidateCache();
      const syncResult = await syncIntegrations();
      setLastRefreshTime(new Date());
      
      if (syncResult.success) {
        toast({
          title: "Data synced successfully",
          description: syncResult.message,
        });
      } else {
        await fetchIntegrations(true);
        toast({
          title: "Data refreshed",
          description: "Communication data has been updated successfully.",
        });
      }
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Failed to refresh communication data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleAnalyzeMentions = (channelId: string, userId: string) => {
    router.push(`${basePath}/integrations/slack/mentions-analysis?channel=${channelId}&user=${userId}`);
  };

  const renderChannels = (channels: Project[]) => {
    if (!channels || channels.length === 0) {
      return (
        <Card className="border-dashed border-2 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl slack-gradient flex items-center justify-center mb-4 opacity-50">
              <Hash className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Channels Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Ensure the Slack integration is connected and you have access to channels.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 stagger-children">
        {channels.map((channel, index) => {
          const mentions = mentionsMap[channel.externalId] || { mentioned: false };
          
          return (
            <Card 
              key={channel.id} 
              className="group relative overflow-hidden card-hover glow-card"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Top gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-1 slack-gradient" />
              
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl slack-gradient flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110">
                      <Hash className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                        {channel.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Channel ID: {channel.externalId.slice(0, 8)}...
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Slack
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0 pb-4 space-y-3">
                {/* Mentioned User Row */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Mentioned User</span>
                      {loadingMentions ? (
                        <div className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      ) : mentions.mentioned ? (
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium">
                            {mentions.username || 'You'}
                          </p>
                          {mentions.mentionCount && mentions.mentionCount > 0 && (
                            <Badge variant="secondary" className="text-xs h-5">
                              {mentions.mentionCount}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not Mentioned</p>
                      )}
                    </div>
                  </div>
                  {mentions.mentioned && mentions.userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs relative z-10"
                      onClick={() => handleAnalyzeMentions(channel.externalId, mentions.userId!)}
                    >
                      <AtSign className="mr-1 h-3 w-3" />
                      Analyze
                    </Button>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="pt-4 border-t border-border/30 relative z-10">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full group/btn bg-gradient-to-r from-purple-500/5 to-pink-500/5 hover:from-purple-500/10 hover:to-pink-500/10 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 relative z-10" 
                  asChild
                >
                  <Link href={getChannelLink(channel)} className="flex items-center justify-center">
                    <span className="font-medium">Analyze Channel</span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Communication Overview"
        icon={<MessageSquare className="h-5 w-5 text-white" />}
        gradient="from-pink-500 to-rose-500"
        description={
          <div className="flex flex-col gap-1">
            <span>View and analyze your communication channels from connected platforms.</span>
            {lastRefreshTime && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last refreshed: {lastRefreshTime.toLocaleTimeString()}
              </span>
            )}
          </div>
        }
        actions={
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing || loading}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading channels...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive" className="animate-scale-in">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Channels</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-8">
          {!integrations?.slack?.connected ? (
            <Card className="border-dashed border-2 animate-scale-in">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <MessageSquare className="h-12 w-12 text-purple-500/50" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl slack-gradient flex items-center justify-center shadow-lg">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-3">Slack Not Connected</h2>
                <p className="text-muted-foreground mb-8 max-w-md">
                  Connect your Slack workspace to view and analyze your team's communication channels.
                </p>
                <Link href="/integrations">
                  <Button size="lg" className="rounded-full slack-gradient hover:opacity-90">
                    <Settings className="mr-2 h-5 w-5" />
                    Connect Slack
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl slack-gradient flex items-center justify-center shadow-md">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Slack Channels</h2>
                    <p className="text-sm text-muted-foreground">
                      {projects.slack?.length || 0} {(projects.slack?.length || 0) === 1 ? 'channel' : 'channels'}
                    </p>
                  </div>
                </div>
                {projects.slack?.length === 0 && (
                  <Button 
                    onClick={handleRefresh} 
                    size="sm" 
                    variant="outline"
                    disabled={refreshing}
                  >
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Refresh
                  </Button>
                )}
              </div>
              
              {projects.slack && projects.slack.length > 0 ? (
                renderChannels(projects.slack)
              ) : (
                <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-200">No Slack Channels Found</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    Your Slack integration is connected, but no channels were found. This might be due to permissions or the channels being private.
                  </AlertDescription>
                </Alert>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
