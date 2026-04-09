"use server";

import { analyzeSentiment as analyzeSentimentFlow, type AnalyzeSentimentInput, type AnalyzeSentimentOutput } from '@/ai/flows/analyze-sentiment';
import { z } from 'zod';

const SentimentFormSchema = z.object({
  text: z.string().min(10, { message: "Text must be at least 10 characters." }).max(5000, { message: "Text must be 5000 characters or less." }),
});

export interface SentimentAnalysisState {
  result?: AnalyzeSentimentOutput;
  error?: string;
  message?: string;
}

export async function performSentimentAnalysis(
  prevState: SentimentAnalysisState,
  formData: FormData
): Promise<SentimentAnalysisState> {
  const validatedFields = SentimentFormSchema.safeParse({
    text: formData.get('text'),
  });

  if (!validatedFields.success) {
    return {
      error: "Invalid input. " + validatedFields.error.flatten().fieldErrors.text?.join(" "),
    };
  }

  const input: AnalyzeSentimentInput = { text: validatedFields.data.text };

  try {
    const output = await analyzeSentimentFlow(input);
    return { result: output, message: "Analysis successful!" };
  } catch (e) {
    console.error("Sentiment analysis failed:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during sentiment analysis.";
    return { error: `Analysis failed: ${errorMessage}` };
  }
}
