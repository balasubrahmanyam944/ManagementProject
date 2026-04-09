'use server'

/**
 * @fileOverview AI-powered test case generation from document content.
 *
 * - generateTestCases - A function that analyzes document content and generates specific test cases.
 * - GenerateTestCasesInput - The input type for the generateTestCases function.
 * - GenerateTestCasesOutput - The return type for the generateTestCases function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTestCasesInputSchema = z.object({
  content: z.string().describe('The document content to analyze for test case generation.'),
  fileName: z.string().describe('The name of the uploaded file for context.'),
});
export type GenerateTestCasesInput = z.infer<typeof GenerateTestCasesInputSchema>;

const TestCaseSchema = z.object({
  id: z.string().describe('Unique identifier for the test case (e.g., TC001)'),
  title: z.string().describe('Clear, descriptive title of the test case'),
  description: z.string().describe('Detailed description of what is being tested'),
  category: z.enum(['Functional', 'UI/UX', 'Integration', 'Data Validation', 'Security', 'Performance', 'Edge Case']).describe('Category of the test case'),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Priority level of the test case'),
  steps: z.array(z.string()).describe('Step-by-step instructions to execute the test'),
  expectedResult: z.string().describe('What should happen when the test passes'),
  preconditions: z.array(z.string()).describe('Requirements that must be met before running the test'),
  testData: z.array(z.string()).describe('Sample data or inputs needed for testing'),
  estimatedTime: z.string().describe('Estimated time to complete the test (e.g., "5 minutes")'),
  tags: z.array(z.string()).describe('Tags for categorization and organization'),
});

const GenerateTestCasesOutputSchema = z.object({
  documentType: z.string().describe('The type of application/document analyzed (e.g., "Game Application", "E-commerce App")'),
  testCases: z.array(TestCaseSchema).describe('Array of generated test cases specific to the document content'),
  summary: z.string().describe('Brief summary of what was analyzed and the types of test cases generated'),
});
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;

export async function generateTestCases(
  input: GenerateTestCasesInput
): Promise<GenerateTestCasesOutput> {
  return generateTestCasesFlow(input);
}

const generateTestCasesPrompt = ai.definePrompt({
  name: 'generateTestCasesPrompt',
  input: {schema: GenerateTestCasesInputSchema},
  output: {schema: GenerateTestCasesOutputSchema},
  prompt: `You are an expert QA engineer. Your ONLY task is to READ the document content below and generate test cases based EXCLUSIVELY on what is written in that document.

MANDATORY PROCESS - FOLLOW THESE STEPS IN ORDER:

STEP 1: READ THE ENTIRE DOCUMENT
- Read every single word of the document content provided below
- Understand what the document describes
- Do NOT skip any part of the document

STEP 2: EXTRACT INFORMATION FROM THE DOCUMENT
- What specific features are mentioned? (List them exactly as written)
- What specific mechanics/rules/workflows are described? (Extract exact details)
- What specific UI elements/screens/components are named? (Use exact names)
- What specific validation rules or error messages are mentioned?
- What specific user interactions or flows are described?
- What specific terms, concepts, or entities are used in the document?

STEP 3: GENERATE TEST CASES FROM THE DOCUMENT
- Generate 20-30 test cases
- Each test case title MUST use terms/features/mechanics FROM THE DOCUMENT
- Each test case MUST test something SPECIFIC mentioned in the document
- Use the document's own terminology and feature names

CRITICAL RULES - YOU MUST FOLLOW:

1. **MANDATORY**: Read the entire document content before generating test cases
2. **MANDATORY**: Extract specific features, mechanics, and terms from the document
3. **MANDATORY**: Use the document's own terminology in ALL test case titles
4. **FORBIDDEN**: Do NOT use generic titles like "Verify Navigation" or "Test User Interface"
5. **FORBIDDEN**: Do NOT generate test cases for features not mentioned in the document
6. **REQUIRED**: Every test case title must reference something specific from the document

DOCUMENT TO READ AND ANALYZE:
File Name: {{{fileName}}}

Document Content:
{{{content}}}

YOUR TASK:
1. Read the document content above completely
2. Identify what the document describes (be specific)
3. Extract ALL features, mechanics, rules, UI elements, workflows mentioned
4. Generate 20-30 test cases that test these specific items

TEST CASE GENERATION REQUIREMENTS:

- Generate 20-30 test cases (aim for maximum coverage of document content)
- Each test case title MUST reference a specific feature/mechanic/term from the document
- Use the document's exact terminology - if it says "rope cutting", use "rope cutting" in the title
- Test cases should cover: Functional testing, UI/UX testing, Edge cases, Integration testing, Data validation
- Use categories: Functional, UI/UX, Integration, Data Validation, Security, Performance, Edge Case
- Assign priorities: Critical, High, Medium, Low based on importance in the document
- Include detailed steps that reference specific elements from the document
- Include expected results that reference document requirements
- Include preconditions relevant to the document
- Include test data relevant to what's described in the document

EXAMPLES OF CORRECT TEST CASE TITLES (based on document content):
- If document mentions "Cut Drop Strike": "Verify Cut Drop Strike Game Mechanics"
- If document mentions "rope cutting": "Test Rope Cutting at Different Positions"
- If document mentions "3x3 grid": "Verify 3x3 Game Board Cell Interactions"
- If document mentions "checkout flow": "Test Checkout Process Payment Validation"
- Use EXACT terms and feature names from the document

EXAMPLES OF INCORRECT TEST CASE TITLES (too generic - DO NOT USE):
- "Verify Navigation" ❌ (too generic - use specific navigation from doc)
- "Test User Interface" ❌ (too generic - use specific UI elements from doc)
- "Verify Application Performance" ❌ (too generic - use specific performance aspects from doc)
- "Verify Error Handling" ❌ (too generic - use specific error scenarios from doc)

REMEMBER:
- READ the document content carefully
- ANALYZE what it describes
- EXTRACT specific features and terms
- GENERATE test cases that test those specific items
- Use the document's own terminology in titles
- Generate 20-30 comprehensive test cases
- DO NOT use generic default titles
`,
});

const generateTestCasesFlow = ai.defineFlow(
  {
    name: 'generateTestCasesFlow',
    inputSchema: GenerateTestCasesInputSchema,
    outputSchema: GenerateTestCasesOutputSchema,
  },
  async input => {
    const {output} = await generateTestCasesPrompt(input);
    return output!;
  }
); 