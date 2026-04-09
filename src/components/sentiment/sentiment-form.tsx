// src/components/sentiment/sentiment-form.tsx
"use client";

import { useFormStatus } from "react-dom";
import React from "react";
import { performSentimentAnalysis, type SentimentAnalysisState } from "@/app/sentiment-analysis/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SentimentResult from "@/components/sentiment/sentiment-result";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Analyze Sentiment
    </Button>
  );
}

export default function SentimentForm() {
  const initialState: SentimentAnalysisState = {};
  const [state, dispatch] = React.useActionState(performSentimentAnalysis, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: state.error,
      });
    }
    if (state.message && !state.error) {
      toast({
        title: "Analysis Complete",
        description: state.message,
      });
    }
  }, [state, toast]);

  return (
    <Card className="shadow-lg w-full">
      <CardHeader>
        <CardTitle>Analyze Ticket Sentiment</CardTitle>
        <CardDescription>
          Enter text from a project ticket (e.g., a comment or description) to analyze its sentiment.
        </CardDescription>
      </CardHeader>
      <form action={dispatch}>
        <CardContent className="space-y-4">
          <div className="grid w-full gap-1.5">
            <Label htmlFor="text-input">Text to Analyze</Label>
            <Textarea
              id="text-input"
              name="text"
              placeholder="Paste ticket comment or description here..."
              rows={8}
              className="min-h-[150px]"
              required
              minLength={10}
              maxLength={5000}
            />
            {state.error && <p className="text-sm text-destructive mt-1">{state.error}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <SubmitButton />
        </CardFooter>
      </form>
      {state.result && (
        <CardContent className="mt-6 border-t pt-6">
          <SentimentResult result={state.result} />
        </CardContent>
      )}
    </Card>
  );
}
