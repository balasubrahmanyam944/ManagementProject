"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ArrowLeft, MessageSquare, AtSign, Calendar, User, Lightbulb, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

interface MentionMessage {
  ts: string;
  text: string;
  user: string;
  username?: string;
  channel?: string;
  permalink?: string;
}

interface MentionAnalysis {
  channelId: string;
  channelName: string;
  userId: string;
  username: string;
  totalMentions: number;
  messages: MentionMessage[];
  analyzedAt: string;
  aiSummary?: {
    summary: string;
    keyTopics: string[];
    actionItems: string[];
    sentiment: string;
    urgency: string;
  };
}

function MentionsAnalysisContent() {
  const searchParams = useSearchParams();
  const channelId = searchParams.get('channel');
  const userId = searchParams.get('user');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MentionAnalysis | null>(null);
  const { toast } = useToast();

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  useEffect(() => {
    const fetchMentionAnalysis = async () => {
      if (!channelId || !userId) {
        setError('Missing channel or user ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(
          `${basePath}/api/integrations/slack/mentions-analysis?channel=${channelId}&user=${userId}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch mention analysis');
        }

        const data = await response.json();
        setAnalysis(data.analysis);
      } catch (err) {
        console.error('Error fetching mention analysis:', err);
        setError(err instanceof Error ? err.message : 'Failed to load mention analysis');
        toast({
          title: "Error",
          description: "Failed to load mention analysis",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMentionAnalysis();
  }, [channelId, userId, basePath, toast]);

  const formatTimestamp = (ts: string) => {
    try {
      // Slack timestamps are in the format "1234567890.123456"
      const timestamp = parseFloat(ts) * 1000;
      return new Date(timestamp).toLocaleString();
    } catch {
      return ts;
    }
  };

  const highlightMentions = (text: string, odUserId: string) => {
    // Replace <@userId> with highlighted text
    const mentionPattern = new RegExp(`<@${userId}>`, 'g');
    return text.replace(mentionPattern, `<span class="bg-yellow-200 dark:bg-yellow-900 px-1 rounded font-medium">@${analysis?.username || 'you'}</span>`);
  };

  if (!channelId || !userId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Mentions Analysis"
          description="Analyze mentions in Slack channels"
          actions={
            <Link href="/communication-overview">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Channels
              </Button>
            </Link>
          }
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Missing Parameters</AlertTitle>
          <AlertDescription>
            Channel ID and User ID are required to analyze mentions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mentions Analysis"
        description={
          analysis ? (
            <span>
              AI analysis of messages mentioning <strong>{analysis.username}</strong> in <strong>{analysis.channelName}</strong>
            </span>
          ) : (
            "Loading mention analysis..."
          )
        }
        actions={
          <Link href="/communication-overview">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Channels
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Analyzing mentions...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Analysis</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : analysis ? (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AtSign className="h-5 w-5 text-primary" />
                Mention Summary
              </CardTitle>
              <CardDescription>
                Overview of mentions in this channel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Mentioned User</p>
                    <p className="font-semibold">{analysis.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Channel</p>
                    <p className="font-semibold">{analysis.channelName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <AtSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Mentions</p>
                    <p className="font-semibold">{analysis.totalMentions}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary Card */}
          {analysis.aiSummary && (
            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  AI Analysis Summary
                </CardTitle>
                <CardDescription>
                  AI-generated insights from messages where you were mentioned
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary */}
                <div>
                  <h4 className="font-medium mb-2">Summary</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {analysis.aiSummary.summary}
                  </p>
                </div>

                {/* Key Topics */}
                {analysis.aiSummary.keyTopics && analysis.aiSummary.keyTopics.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Key Topics
                    </h4>
                    <ul className="space-y-1">
                      {analysis.aiSummary.keyTopics.map((topic, idx) => (
                        <li key={idx} className="text-sm pl-3 border-l-2 border-primary/30">
                          {topic}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Items */}
                {analysis.aiSummary.actionItems && analysis.aiSummary.actionItems.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Action Items for You</h4>
                    <ul className="space-y-1">
                      {analysis.aiSummary.actionItems.map((item, idx) => (
                        <li key={idx} className="text-sm pl-3 border-l-2 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 py-1 rounded-r">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sentiment & Urgency */}
                <div className="flex gap-4">
                  {analysis.aiSummary.sentiment && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm">
                      <span className="text-muted-foreground">Sentiment:</span>
                      <span className="font-medium capitalize">{analysis.aiSummary.sentiment}</span>
                    </div>
                  )}
                  {analysis.aiSummary.urgency && (
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                      analysis.aiSummary.urgency === 'high' ? 'bg-red-100 dark:bg-red-900/30' :
                      analysis.aiSummary.urgency === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      <span className="text-muted-foreground">Urgency:</span>
                      <span className="font-medium capitalize">{analysis.aiSummary.urgency}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Messages List */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Messages with Mentions
              </CardTitle>
              <CardDescription>
                Messages where you were mentioned
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AtSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No mention messages found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {analysis.messages.map((message, index) => (
                    <div
                      key={message.ts || index}
                      className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">
                              {message.username || message.user}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatTimestamp(message.ts)}
                            </span>
                          </div>
                          <p
                            className="text-sm text-foreground"
                            dangerouslySetInnerHTML={{
                              __html: highlightMentions(message.text, userId),
                            }}
                          />
                        </div>
                        {message.permalink && (
                          <a
                            href={message.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            View in Slack
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Timestamp */}
          <p className="text-xs text-muted-foreground text-center">
            Analysis performed at: {new Date(analysis.analyzedAt).toLocaleString()}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function MentionsAnalysisPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading...</p>
      </div>
    }>
      <MentionsAnalysisContent />
    </Suspense>
  );
}
