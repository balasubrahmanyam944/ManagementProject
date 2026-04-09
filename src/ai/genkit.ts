import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Ensure this is only used server-side
if (typeof window !== 'undefined') {
  throw new Error('Genkit can only be used on the server');
}

// Disable tracing to avoid OpenTelemetry/Jaeger dependency issues in Next.js
// Set environment variable to disable tracing
if (typeof process !== 'undefined') {
  process.env.GENKIT_ENABLE_TRACING = 'false';
  process.env.OTEL_SDK_DISABLED = 'true';
}

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});
