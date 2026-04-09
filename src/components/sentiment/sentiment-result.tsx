// src/components/sentiment/sentiment-result.tsx
import type { AnalyzeSentimentOutput } from "@/ai/flows/analyze-sentiment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Smile, Frown, Meh } from "lucide-react";

interface SentimentResultProps {
  result: AnalyzeSentimentOutput;
}

function getSentimentColor(sentiment: string | undefined) {
  switch (sentiment?.toLowerCase()) {
    case "positive":
      return "bg-green-500";
    case "negative":
      return "bg-red-500";
    case "neutral":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
}

function getSentimentIcon(sentiment: string | undefined) {
    switch (sentiment?.toLowerCase()) {
        case "positive":
          return <Smile className="h-6 w-6 text-green-600" />;
        case "negative":
          return <Frown className="h-6 w-6 text-red-600" />;
        case "neutral":
          return <Meh className="h-6 w-6 text-yellow-600" />;
        default:
          return <Meh className="h-6 w-6 text-gray-600" />;
      }
}


export default function SentimentResult({ result }: SentimentResultProps) {
  const scorePercentage = result.score ? ((result.score + 1) / 2) * 100 : 50;

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Analysis Result</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overall Sentiment</CardTitle>
            {getSentimentIcon(result.sentiment)}
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                result.sentiment?.toLowerCase() === "positive" ? "default" :
                result.sentiment?.toLowerCase() === "negative" ? "destructive" : "secondary"
              }
              className={`capitalize text-lg px-3 py-1 ${
                result.sentiment?.toLowerCase() === "positive" ? "bg-green-100 text-green-800 border-green-300 hover:bg-green-200" :
                result.sentiment?.toLowerCase() === "negative" ? "bg-red-100 text-red-800 border-red-300 hover:bg-red-200" :
                "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200"
              }`}
            >
              {result.sentiment || "N/A"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Confidence Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{result.score !== undefined ? result.score.toFixed(2) : "N/A"}</div>
            <Progress value={scorePercentage} className={`mt-2 h-3 ${getSentimentColor(result.sentiment)}`} />
            <p className="text-xs text-muted-foreground mt-1">
              (-1 Negative, 0 Neutral, 1 Positive)
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Reasoning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {result.reason || "No specific reason provided."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
