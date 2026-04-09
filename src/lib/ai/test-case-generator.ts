// Ensure this module is server-only
if (typeof window !== 'undefined') {
  throw new Error('test-case-generator.ts can only be used on the server');
}

// Lazy import Genkit to avoid bundling issues
let generateTestCasesAI: any = null;
let GenerateTestCasesInput: any = null;

async function loadGenkit() {
  if (!generateTestCasesAI) {
    // Use direct string literal for dynamic import - webpack needs this for proper resolution
    // Don't use a variable, webpack can't resolve path aliases in variables
    const genkitModule = await import('@/ai/flows/generate-test-cases');
    generateTestCasesAI = genkitModule.generateTestCases;
    GenerateTestCasesInput = genkitModule.GenerateTestCasesInput;
  }
  return { generateTestCasesAI, GenerateTestCasesInput };
}

// Re-export types from types file
export type { TestCase } from './test-case-types';

export class TestCaseGenerator {
  /**
   * Generates document-specific test cases using AI analysis with retry logic
   */
  async generateTestCases(content: string, fileName: string = 'document'): Promise<TestCase[]> {
    console.log(`🤖 AI Test Case Generator: Starting analysis for ${fileName}`);
    console.log(`📄 Content length: ${content.length} characters`);
    console.log(`📄 Content preview (first 500 chars): ${content.substring(0, 500)}...`);
    
    // Validate content quality
    if (content.length < 100) {
      console.warn(`⚠️ AI Test Case Generator: Very short content (${content.length} chars). This may result in generic test cases.`);
    }
    
    // Check if content looks like extracted text vs binary data
    const hasReadableText = /[a-zA-Z]{3,}/.test(content);
    if (!hasReadableText) {
      console.warn(`⚠️ AI Test Case Generator: Content doesn't appear to contain readable text. Will still attempt AI analysis.`);
    }
    
    // Try to clean content if it appears slightly garbled, but don't skip AI analysis
    // Only skip AI if content is completely unreadable
    const isSeverelyGarbled = this.isSeverelyGarbled(content);
    if (isSeverelyGarbled) {
      console.warn(`⚠️ AI Test Case Generator: Content appears severely garbled. Attempting to clean...`);
      
      // Try to extract any meaningful content from the garbled text
      const cleanedContent = this.attemptToCleanGarbledContent(content);
      if (cleanedContent.length > 200 && !this.isSeverelyGarbled(cleanedContent)) {
        console.log(`✅ AI Test Case Generator: Successfully cleaned garbled content, using cleaned version`);
        content = cleanedContent;
      } else if (cleanedContent.length < 200) {
        // If we can't extract enough readable content, use fallback immediately
        console.error(`❌ AI Test Case Generator: Cannot extract enough readable content. Using fallback.`);
        return this.generateComprehensiveFallbackTestCases(content, fileName);
      }
      // Otherwise, continue with original content - let AI try to handle it
    }
    
    // Try AI generation with retry logic
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🧠 AI Test Case Generator: Attempt ${attempt}/${maxRetries} - Calling AI for analysis...`);
        
        // Lazy load Genkit to avoid bundling issues
        const { generateTestCasesAI: genkitGenerate, GenerateTestCasesInput: GenkitInput } = await loadGenkit();
        
        // Prepare input for AI
        const input: typeof GenkitInput = {
          content: content,
          fileName: fileName
        };
        
        // Debug: Log the exact content being sent to AI
        console.log(`🧠 AI Test Case Generator: Sending to AI - Content length: ${content.length}`);
        console.log(`🧠 AI Test Case Generator: Content sample (first 1000 chars): ${content.substring(0, 1000)}`);
        console.log(`🧠 AI Test Case Generator: Content sample (last 500 chars): ${content.substring(Math.max(0, content.length - 500))}`);
        
        // Use AI to generate test cases
        const aiResult = await genkitGenerate(input);
        
        console.log(`✅ AI Test Case Generator: AI analysis complete on attempt ${attempt}`);
        console.log(`📊 Document Type: ${aiResult.documentType}`);
        console.log(`📋 Generated ${aiResult.testCases.length} test cases`);
        console.log(`📝 Summary: ${aiResult.summary}`);
        
        // Convert AI result to our TestCase format
        const testCases: TestCase[] = aiResult.testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          category: tc.category,
          priority: tc.priority,
          steps: tc.steps,
          expectedResult: tc.expectedResult,
          preconditions: tc.preconditions,
          testData: tc.testData,
          estimatedTime: tc.estimatedTime,
          tags: tc.tags
        }));
        
        console.log(`🎯 AI Test Case Generator: Successfully generated ${testCases.length} document-specific test cases`);
        return testCases;
        
      } catch (error: any) {
        lastError = error;
        console.error(`❌ AI Test Case Generator: Attempt ${attempt} failed:`, error.message);
        
        // Check if it's a retryable error
        const isQuotaError = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Quota exceeded');
        const isServiceUnavailable = error.message?.includes('503') || error.message?.includes('overloaded');
        const isRetryable = isQuotaError || isServiceUnavailable;
        
        if (isRetryable && attempt < maxRetries) {
          // Extract retry delay from error message if available (for quota errors)
          let waitTime = attempt * 2000; // Default: 2s, 4s, 6s
          
          if (isQuotaError) {
            // Try to extract retry delay from error message (handles decimal seconds)
            const retryMatch = error.message?.match(/retry.*?(\d+\.?\d*)\s*(?:s|seconds?|ms|milliseconds?)/i);
            if (retryMatch) {
              const delayValue = parseFloat(retryMatch[1]);
              // Convert to milliseconds if in seconds (if value is less than 1000, assume it's already in seconds)
              waitTime = delayValue > 1000 ? delayValue : Math.ceil(delayValue * 1000);
              // Add 2 second buffer to be safe
              waitTime = Math.min(waitTime + 2000, 120000); // Max 120 seconds
              console.log(`⏳ AI Test Case Generator: Extracted retry delay: ${delayValue}s (${waitTime}ms with buffer)`);
            } else {
              // Exponential backoff for quota errors: 30s, 60s, 90s
              waitTime = Math.min(30000 * attempt, 90000);
            }
          }
          
          console.log(`⏳ AI Test Case Generator: ${isQuotaError ? 'Quota' : 'Service'} error detected. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          // For non-retryable errors or max retries reached, break
          if (!isRetryable) {
            console.log(`⚠️ AI Test Case Generator: Non-retryable error, stopping retries`);
          }
          break;
        }
      }
    }
    
    console.error('❌ AI Test Case Generator: All AI attempts failed:', lastError?.message);
    console.log('🔄 AI Test Case Generator: Falling back to comprehensive analysis...');
    
    // Enhanced fallback that generates 15-25 test cases
    return this.generateComprehensiveFallbackTestCases(content, fileName);
  }
  
  /**
   * Enhanced fallback method that generates 15-25 comprehensive test cases
   * This method analyzes the actual content to extract specific features and requirements
   */
  private generateComprehensiveFallbackTestCases(content: string, fileName: string): TestCase[] {
    console.log('⚠️ AI Test Case Generator: Using comprehensive fallback method');
    console.log(`📄 Analyzing content: ${content.length} characters`);
    console.log(`📄 Content sample: ${content.substring(0, 500)}...`);
    
    const contentLower = content.toLowerCase();
    const testCases: TestCase[] = [];
    let tcCounter = 1;
    
    // Analyze document content for specific features
    const features = this.extractFeatures(content);
    const documentType = this.detectDocumentType(content);
    
    // Extract key phrases and requirements from content
    const keyPhrases = this.extractKeyPhrases(content);
    const requirements = this.extractRequirements(content);
    
    console.log(`📊 Detected Document Type: ${documentType}`);
    console.log(`🔍 Extracted Features (${features.length}): ${features.slice(0, 10).join(', ')}${features.length > 10 ? '...' : ''}`);
    console.log(`📝 Extracted Key Phrases (${keyPhrases.length}): ${keyPhrases.slice(0, 5).join(', ')}${keyPhrases.length > 5 ? '...' : ''}`);
    console.log(`📋 Extracted Requirements (${requirements.length}): ${requirements.slice(0, 3).join('; ')}${requirements.length > 3 ? '...' : ''}`);
    
    // Generate document-specific test cases based on type AND extracted features
    if (documentType === 'Game Application') {
      testCases.push(...this.generateGameTestCases(content, tcCounter, features, keyPhrases));
      tcCounter += testCases.length;
    } else if (documentType === 'E-commerce Application') {
      testCases.push(...this.generateEcommerceTestCases(content, tcCounter, features, keyPhrases));
      tcCounter += testCases.length;
    } else if (documentType === 'API Documentation') {
      testCases.push(...this.generateAPITestCases(content, tcCounter, features, keyPhrases));
      tcCounter += testCases.length;
    } else if (documentType === 'Web Application') {
      testCases.push(...this.generateWebAppTestCases(content, tcCounter, features, keyPhrases));
      tcCounter += testCases.length;
    } else {
      // For general applications, generate test cases based on extracted features
      testCases.push(...this.generateFeatureBasedTestCases(content, tcCounter, features, keyPhrases, requirements));
      tcCounter += testCases.length;
    }
    
    // Generate test cases from key phrases (each phrase can become a test case)
    if (keyPhrases.length > 0) {
      const phraseTestCases = this.generateTestCasesFromPhrases(keyPhrases, tcCounter, documentType);
      testCases.push(...phraseTestCases);
      tcCounter += phraseTestCases.length;
    }
    
    // Generate test cases from requirements (each requirement can become a test case)
    if (requirements.length > 0) {
      const requirementTestCases = this.generateTestCasesFromRequirements(requirements, tcCounter, documentType);
      testCases.push(...requirementTestCases);
      tcCounter += requirementTestCases.length;
    }
    
    // Generate test cases for different categories based on content
    const categoryTestCases = this.generateCategoryBasedTestCases(content, tcCounter, features, documentType);
    testCases.push(...categoryTestCases);
    tcCounter += categoryTestCases.length;
    
    // Add universal test cases that apply to any application
    const universalTestCases = this.generateUniversalTestCases(content, tcCounter);
    testCases.push(...universalTestCases);
    tcCounter += universalTestCases.length;
    
    // Ensure we have at least 20-25 test cases (aim for maximum coverage)
    const targetCount = 25;
    while (testCases.length < targetCount) {
      const additionalTC = this.generateAdditionalTestCase(testCases.length + 1, documentType, features);
      testCases.push(additionalTC);
    }
    
    // Remove duplicates based on title
    const uniqueTestCases = this.removeDuplicateTestCases(testCases);
    
    console.log(`📋 AI Test Case Generator: Generated ${uniqueTestCases.length} comprehensive fallback test cases (target: ${targetCount})`);
    return uniqueTestCases;
  }
  
  /**
   * Generate test cases from key phrases
   */
  private generateTestCasesFromPhrases(keyPhrases: string[], startCounter: number, documentType: string): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    
    // Filter and validate phrases before generating test cases
    const validPhrases = keyPhrases.filter(phrase => this.isValidPhrase(phrase));
    
    validPhrases.slice(0, 10).forEach(phrase => {
      const phraseLower = phrase.toLowerCase();
      const category = this.determineCategoryFromPhrase(phraseLower);
      const priority = phraseLower.includes('critical') || phraseLower.includes('important') ? 'High' : 'Medium';
      
      // Create a proper title - ensure it ends with "Functionality" if phrase is short
      const title = phrase.length < 30 
        ? `Verify ${phrase} Functionality`
        : `Verify ${phrase}`;
      
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: title,
        description: `Test the ${phrase} feature as described in the document`,
        category: category,
        priority: priority,
        steps: [
          `Navigate to the ${phrase} section`,
          `Interact with ${phrase} elements`,
          `Verify ${phrase} responds correctly to user actions`,
          `Test error handling for ${phrase}`,
          `Validate ${phrase} meets the specified requirements`
        ],
        expectedResult: `${phrase} should function correctly as specified in the document`,
        preconditions: ['Application is accessible', `${phrase} feature is available`],
        testData: ['Valid inputs', 'Edge cases', 'Error scenarios'],
        estimatedTime: '15 minutes',
        tags: [phrase.toLowerCase().replace(/\s+/g, '-'), 'content-based', documentType.toLowerCase().replace(/\s+/g, '-')]
      });
      counter++;
    });
    
    return testCases;
  }
  
  /**
   * Generate test cases from requirements
   */
  private generateTestCasesFromRequirements(requirements: string[], startCounter: number, documentType: string): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    
    requirements.slice(0, 8).forEach(requirement => {
      // Extract the main action/feature from requirement
      const mainAction = requirement.split(/\b(must|should|shall|required|need to|have to)\b/i)[2]?.trim() || requirement.substring(0, 50);
      
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: `Verify Requirement: ${mainAction.substring(0, 60)}`,
        description: `Test that the requirement "${requirement.substring(0, 100)}" is met`,
        category: 'Functional',
        priority: requirement.toLowerCase().includes('must') ? 'Critical' : 'High',
        steps: [
          `Set up test environment`,
          `Execute actions related to: ${mainAction.substring(0, 50)}`,
          `Verify requirement is met`,
          `Test edge cases`,
          `Validate against document specification`
        ],
        expectedResult: `Requirement should be fully met as specified`,
        preconditions: ['Application is accessible', 'Test environment is ready'],
        testData: ['Valid scenarios', 'Edge cases'],
        estimatedTime: '15 minutes',
        tags: ['requirement', 'functional', documentType.toLowerCase()]
      });
      counter++;
    });
    
    return testCases;
  }
  
  /**
   * Generate test cases for different categories based on content
   */
  private generateCategoryBasedTestCases(content: string, startCounter: number, features: string[], documentType: string): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    const contentLower = content.toLowerCase();
    
    const categories = [
      { name: 'Functional', keywords: ['function', 'feature', 'action', 'behavior'], priority: 'High' },
      { name: 'UI/UX', keywords: ['ui', 'interface', 'design', 'user experience', 'screen', 'page'], priority: 'Medium' },
      { name: 'Data Validation', keywords: ['validation', 'input', 'data', 'field', 'form'], priority: 'High' },
      { name: 'Integration', keywords: ['api', 'integration', 'external', 'service', 'endpoint'], priority: 'Medium' },
      { name: 'Security', keywords: ['security', 'authentication', 'authorization', 'encrypt', 'secure'], priority: 'Critical' },
      { name: 'Performance', keywords: ['performance', 'speed', 'load', 'optimization', 'response time'], priority: 'Medium' },
      { name: 'Edge Case', keywords: ['edge', 'boundary', 'limit', 'error', 'exception'], priority: 'Medium' }
    ];
    
    categories.forEach(category => {
      const hasCategoryContent = category.keywords.some(keyword => contentLower.includes(keyword));
      if (hasCategoryContent) {
        // Extract specific features related to this category from content
        const categoryFeatures = features.filter(f => {
          const fLower = f.toLowerCase();
          return category.keywords.some(keyword => fLower.includes(keyword));
        });
        
        // Use first category-related feature for title, or use category name if no specific feature found
        const titleFeature = categoryFeatures.length > 0 
          ? categoryFeatures[0].replace(/feature-/g, '').replace(/-/g, ' ')
          : null;
        
        const title = titleFeature 
          ? `Verify ${titleFeature.charAt(0).toUpperCase() + titleFeature.slice(1)} ${category.name}`
          : `Verify ${category.name} Aspects from Document`;
        
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: title,
          description: titleFeature 
            ? `Test ${titleFeature} ${category.name.toLowerCase()} as described in the document`
            : `Test ${category.name.toLowerCase()} aspects as described in the document`,
          category: category.name as any,
          priority: category.priority as any,
          steps: titleFeature ? [
            `Access the ${titleFeature} feature`,
            `Test ${titleFeature} ${category.name.toLowerCase()} aspects`,
            `Verify ${titleFeature} meets ${category.name.toLowerCase()} requirements`,
            `Test edge cases for ${titleFeature}`,
            `Validate against document specification`
          ] : [
            `Identify ${category.name.toLowerCase()} requirements from document`,
            `Set up test environment`,
            `Execute tests for ${category.name.toLowerCase()} aspects`,
            `Verify all requirements are met`,
            `Document results`
          ],
          expectedResult: titleFeature
            ? `${titleFeature.charAt(0).toUpperCase() + titleFeature.slice(1)} should meet ${category.name.toLowerCase()} requirements from the document`
            : `All ${category.name.toLowerCase()} requirements should be met`,
          preconditions: ['Application is accessible', 'Document requirements are understood'],
          testData: ['Test scenarios from document', 'Edge cases'],
          estimatedTime: '20 minutes',
          tags: [category.name.toLowerCase().replace(/\s+/g, '-'), 'content-based', documentType.toLowerCase()]
        });
        counter++;
      }
    });
    
    return testCases;
  }
  
  /**
   * Determine category from phrase
   */
  private determineCategoryFromPhrase(phrase: string): 'Functional' | 'UI/UX' | 'Integration' | 'Data Validation' | 'Security' | 'Performance' | 'Edge Case' {
    const phraseLower = phrase.toLowerCase();
    if (phraseLower.includes('ui') || phraseLower.includes('interface') || phraseLower.includes('design')) return 'UI/UX';
    if (phraseLower.includes('api') || phraseLower.includes('integration') || phraseLower.includes('service')) return 'Integration';
    if (phraseLower.includes('validation') || phraseLower.includes('input') || phraseLower.includes('data')) return 'Data Validation';
    if (phraseLower.includes('security') || phraseLower.includes('auth')) return 'Security';
    if (phraseLower.includes('performance') || phraseLower.includes('speed')) return 'Performance';
    if (phraseLower.includes('edge') || phraseLower.includes('error')) return 'Edge Case';
    return 'Functional';
  }
  
  /**
   * Remove duplicate test cases based on title similarity
   */
  private removeDuplicateTestCases(testCases: TestCase[]): TestCase[] {
    const seen = new Set<string>();
    const unique: TestCase[] = [];
    
    testCases.forEach(tc => {
      const titleKey = tc.title.toLowerCase().trim();
      // Check if we've seen a similar title (allowing for minor variations)
      const isDuplicate = Array.from(seen).some(seenTitle => {
        const similarity = this.calculateSimilarity(titleKey, seenTitle);
        return similarity > 0.8; // 80% similarity threshold
      });
      
      if (!isDuplicate) {
        seen.add(titleKey);
        unique.push(tc);
      }
    });
    
    return unique;
  }
  
  /**
   * Calculate similarity between two strings (simple Jaccard similarity)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }
  
  /**
   * Extract key phrases from content that might represent features or mechanics
   */
  private extractKeyPhrases(content: string): string[] {
    const phrases: string[] = [];
    const sentences = content.split(/[.!?]\s+/);
    
    // Extract phrases that look like feature descriptions
    sentences.forEach(sentence => {
      // Clean the sentence first
      const cleanSentence = sentence.trim();
      if (cleanSentence.length < 10) return; // Skip very short sentences
      
      // Look for complete noun phrases (feature names)
      // Pattern: Capitalized word(s) followed by common nouns
      const featurePatterns = [
        // "The Player Character can..." -> "Player Character"
        /\b(the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(can|will|should|allows|enables|provides|supports|must|has|is)/gi,
        // "Game Board displays..." -> "Game Board"
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(displays?|shows?|contains?|includes?)/gi,
      ];
      
      featurePatterns.forEach(pattern => {
        const matches = cleanSentence.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const phrase = match
              .replace(/^(the\s+)?/i, '')
              .replace(/\s+(can|will|should|allows|enables|provides|supports|must|has|is|displays?|shows?|contains?|includes?).*$/i, '')
              .trim();
            
            // Validate the phrase is meaningful
            if (this.isValidPhrase(phrase)) {
              phrases.push(phrase);
            }
          });
        }
      });
      
      // Extract quoted phrases (only if they're complete)
      const quoted = cleanSentence.match(/"([^"]+)"/g);
      if (quoted) {
        quoted.forEach(q => {
          const phrase = q.replace(/"/g, '').trim();
          if (this.isValidPhrase(phrase)) {
            phrases.push(phrase);
          }
        });
      }
    });
    
    return [...new Set(phrases)].slice(0, 20); // Limit to 20 unique phrases
  }
  
  /**
   * Validate if a phrase is meaningful and complete
   */
  private isValidPhrase(phrase: string): boolean {
    if (!phrase || phrase.length < 5 || phrase.length > 60) return false;
    
    // Must have at least 2 words
    const words = phrase.split(/\s+/);
    if (words.length < 2) return false;
    
    // Check each word is valid (not just random characters)
    const validWords = words.filter(word => {
      // Word must be at least 2 characters
      if (word.length < 2) return false;
      // Word should be mostly letters
      const letterRatio = (word.match(/[a-zA-Z]/g) || []).length / word.length;
      return letterRatio > 0.8;
    });
    
    // At least 80% of words should be valid
    if (validWords.length < words.length * 0.8) return false;
    
    // Should not end with articles or prepositions
    const lastWord = words[words.length - 1].toLowerCase();
    const invalidEndings = ['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'if', 'these', 'those', 'this', 'that'];
    if (invalidEndings.includes(lastWord)) return false;
    
    // Should start with a capital letter or be all lowercase
    if (!/^[A-Z][a-z]/.test(phrase) && !/^[a-z]/.test(phrase)) return false;
    
    return true;
  }
  
  /**
   * Extract requirements from content
   */
  private extractRequirements(content: string): string[] {
    const requirements: string[] = [];
    const sentences = content.split(/[.!?]\s+/);
    
    sentences.forEach(sentence => {
      // Look for requirement patterns
      if (sentence.match(/\b(must|should|shall|required|need to|have to)\b/i)) {
        requirements.push(sentence.trim());
      }
    });
    
    return requirements.slice(0, 15); // Limit to 15 requirements
  }
  
  /**
   * Generate test cases based on extracted features and key phrases
   */
  private generateFeatureBasedTestCases(
    content: string, 
    startCounter: number, 
    features: string[], 
    _keyPhrases: string[], 
    _requirements: string[]
  ): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    
    // Generate test cases for ALL features (not just first 10)
    features.forEach((feature, index) => {
      let featureName = feature.replace(/feature-/g, '').replace(/-/g, ' ');
      
      // Clean and validate the feature name
      featureName = this.cleanFeatureName(featureName);
      
      // Create a proper capitalized name
      const capitalizedName = featureName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Determine category based on feature name
      const category = this.determineCategoryFromPhrase(featureName);
      
      // Determine priority (first few features are higher priority)
      const priority = index < 5 ? 'High' : index < 10 ? 'Medium' : 'Low';
      
      // Try to find specific content about this feature
      const featureContent = this.findFeatureContent(content, featureName);
      
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: `Verify ${capitalizedName} Functionality`,
        description: featureContent 
          ? `Test the ${featureName} feature: ${featureContent.substring(0, 150)}`
          : `Test the ${featureName} feature as described in the document`,
        category: category,
        priority: priority as any,
        steps: this.generateStepsForFeature(featureName, featureContent),
        expectedResult: `${capitalizedName} should function correctly as specified in the document`,
        preconditions: ['Application is accessible', 'Feature is available', 'Test environment is ready'],
        testData: ['Valid inputs', 'Edge cases', 'Error scenarios'],
        estimatedTime: '15 minutes',
        tags: [feature.replace(/\s+/g, '-'), category.toLowerCase().replace(/\s+/g, '-'), 'feature-specific', 'content-based']
      });
      counter++;
    });
    
    return testCases;
  }
  
  /**
   * Find content related to a specific feature
   */
  private findFeatureContent(content: string, featureName: string): string {
    const sentences = content.split(/[.!?]\s+/);
    const featureLower = featureName.toLowerCase();
    
    // Find sentences that mention this feature
    const relevantSentences = sentences.filter(sentence => 
      sentence.toLowerCase().includes(featureLower)
    );
    
    if (relevantSentences.length > 0) {
      // Return the first relevant sentence
      return relevantSentences[0].trim();
    }
    
    return '';
  }
  
  /**
   * Generate specific steps for a feature based on content
   */
  private generateStepsForFeature(featureName: string, featureContent: string): string[] {
    const steps: string[] = [
      `Access the ${featureName} feature`,
      `Perform primary actions related to ${featureName}`
    ];
    
    // Add content-specific steps if available
    if (featureContent) {
      // Extract action verbs from content
      const actionVerbs = featureContent.match(/\b(click|select|enter|input|submit|verify|check|test|validate|perform|execute)\b/gi);
      if (actionVerbs && actionVerbs.length > 0) {
        steps.push(`Execute ${actionVerbs[0].toLowerCase()} action as described`);
      }
    }
    
    steps.push(
      `Verify feature responds correctly`,
      `Test edge cases and error scenarios`,
      `Validate feature meets document requirements`
    );
    
    return steps;
  }
  
  private detectDocumentType(content: string): string {
    const contentLower = content.toLowerCase();
    
    if (contentLower.includes('game') || contentLower.includes('player') || contentLower.includes('level') || 
        contentLower.includes('score') || contentLower.includes('rope') || contentLower.includes('tic tac toe')) {
      return 'Game Application';
    } else if (contentLower.includes('cart') || contentLower.includes('checkout') || contentLower.includes('payment') || 
               contentLower.includes('product') || contentLower.includes('order')) {
      return 'E-commerce Application';
    } else if (contentLower.includes('api') || contentLower.includes('endpoint') || contentLower.includes('request') || 
               contentLower.includes('response') || contentLower.includes('json')) {
      return 'API Documentation';
    } else if (contentLower.includes('website') || contentLower.includes('web') || contentLower.includes('browser') || 
               contentLower.includes('page') || contentLower.includes('navigation')) {
      return 'Web Application';
    } else if (contentLower.includes('mobile') || contentLower.includes('app') || contentLower.includes('android') || 
               contentLower.includes('ios')) {
      return 'Mobile Application';
    }
    
    return 'General Application';
  }
  
  private extractFeatures(content: string): string[] {
    const features: string[] = [];
    const contentLower = content.toLowerCase();
    
    // Extract meaningful words/phrases that represent features
    // Look for common feature patterns in GDDs
    
    // Game-specific features
    if (contentLower.includes('rope') || contentLower.includes('cut')) features.push('rope-mechanics');
    if (contentLower.includes('physics') || contentLower.includes('gravity')) features.push('physics-simulation');
    if (contentLower.includes('score') || contentLower.includes('point') || contentLower.includes('points')) features.push('scoring-system');
    if (contentLower.includes('level') || contentLower.includes('stage') || contentLower.includes('chapter')) features.push('level-progression');
    if (contentLower.includes('grid') || contentLower.includes('board') || contentLower.includes('tic tac toe')) features.push('grid-based-gameplay');
    if (contentLower.includes('win') || contentLower.includes('victory') || contentLower.includes('complete')) features.push('win-conditions');
    if (contentLower.includes('player') || contentLower.includes('character') || contentLower.includes('avatar')) features.push('player-character');
    if (contentLower.includes('enemy') || contentLower.includes('opponent') || contentLower.includes('ai')) features.push('enemy-ai');
    if (contentLower.includes('power') || contentLower.includes('ability') || contentLower.includes('skill')) features.push('power-ups');
    if (contentLower.includes('multiplayer') || contentLower.includes('online') || contentLower.includes('co-op')) features.push('multiplayer');
    
    // UI/UX features
    if (contentLower.includes('menu') || contentLower.includes('navigation') || contentLower.includes('screen')) features.push('ui-navigation');
    if (contentLower.includes('button') || contentLower.includes('click') || contentLower.includes('tap')) features.push('interactive-elements');
    if (contentLower.includes('animation') || contentLower.includes('transition') || contentLower.includes('effect')) features.push('animations');
    if (contentLower.includes('responsive') || contentLower.includes('mobile') || contentLower.includes('tablet')) features.push('responsive-design');
    
    // General application features
    if (contentLower.includes('login') || contentLower.includes('sign in') || contentLower.includes('authentication')) features.push('authentication');
    if (contentLower.includes('user') || contentLower.includes('profile') || contentLower.includes('account')) features.push('user-management');
    if (contentLower.includes('data') || contentLower.includes('database') || contentLower.includes('storage')) features.push('data-management');
    if (contentLower.includes('security') || contentLower.includes('secure') || contentLower.includes('encrypt')) features.push('security');
    if (contentLower.includes('performance') || contentLower.includes('speed') || contentLower.includes('optimization')) features.push('performance');
    if (contentLower.includes('search') || contentLower.includes('filter') || contentLower.includes('sort')) features.push('search-filter');
    if (contentLower.includes('notification') || contentLower.includes('alert') || contentLower.includes('message')) features.push('notifications');
    if (contentLower.includes('payment') || contentLower.includes('checkout') || contentLower.includes('transaction')) features.push('payment-processing');
    if (contentLower.includes('api') || contentLower.includes('endpoint') || contentLower.includes('rest')) features.push('api-integration');
    
    // Extract specific feature names from content (words in quotes, capitalized phrases, etc.)
    const quotedFeatures = content.match(/"([^"]+)"/g) || [];
    quotedFeatures.forEach(quote => {
      const feature = quote.replace(/"/g, '').trim().toLowerCase();
      if (feature.length > 3 && feature.length < 50) {
        features.push(`feature-${feature.replace(/\s+/g, '-')}`);
      }
    });
    
    // Extract capitalized phrases that might be feature names
    const capitalizedPhrases = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    capitalizedPhrases.slice(0, 10).forEach(phrase => {
      const feature = phrase.toLowerCase();
      if (feature.length > 5 && feature.length < 40 && !features.includes(`feature-${feature.replace(/\s+/g, '-')}`)) {
        features.push(`feature-${feature.replace(/\s+/g, '-')}`);
      }
    });
    
    return [...new Set(features)]; // Remove duplicates
  }
  
  private generateGameTestCases(content: string, startCounter: number, features?: string[], keyPhrases?: string[]): TestCase[] {
    const testCases: TestCase[] = [];
    const contentLower = content.toLowerCase();
    let counter = startCounter;
    
    // Extract game name or main mechanic from document
    const gameName = this.extractGameName(content);
    const mainMechanic = this.extractMainMechanic(content);
    
    // Core game functionality - use game name or main mechanic if available
    if (gameName || mainMechanic) {
      const titleFeature = gameName || mainMechanic;
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: `Verify ${titleFeature} Core Mechanics`,
        description: `Test the fundamental ${titleFeature} mechanics and player interactions as described in the document`,
        category: 'Functional',
        priority: 'Critical',
        steps: [
          `Launch the ${titleFeature} game`,
          `Start a new game session`,
          `Perform primary ${titleFeature} actions`,
          `Verify game responds correctly to player input`,
          `Check game state updates properly`
        ],
        expectedResult: `${titleFeature} should respond correctly to all player actions with appropriate feedback`,
        preconditions: ['Game is installed and accessible', 'Device meets minimum requirements'],
        testData: ['Valid player inputs from document', 'Different game scenarios'],
        estimatedTime: '15 minutes',
        tags: [titleFeature.toLowerCase().replace(/\s+/g, '-'), 'core-mechanics', 'critical']
      });
      counter++;
    }
    
    // Rope cutting mechanics (if mentioned)
    if (contentLower.includes('rope') || contentLower.includes('cut')) {
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: 'Verify Rope Cutting Mechanism',
        description: 'Test the rope cutting functionality and physics simulation',
        category: 'Functional',
        priority: 'Critical',
        steps: [
          'Start a level with rope elements',
          'Attempt to cut rope at different positions',
          'Verify rope breaks correctly',
          'Check physics simulation after rope is cut',
          'Validate object movement follows physics laws'
        ],
        expectedResult: 'Rope should cut cleanly and objects should fall with realistic physics',
        preconditions: ['Game level with rope elements loaded'],
        testData: ['Different rope cutting positions', 'Various rope lengths'],
        estimatedTime: '12 minutes',
        tags: ['rope-mechanics', 'physics', 'game-specific']
      });
      counter++;
    }
    
    // Grid-based gameplay (for Tic Tac Toe)
    if (contentLower.includes('tic tac toe') || contentLower.includes('grid') || contentLower.includes('3x3')) {
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: 'Verify 3x3 Game Board Functionality',
        description: 'Test the game board grid system and cell interactions',
        category: 'Functional',
        priority: 'Critical',
        steps: [
          'Start a new Tic Tac Toe game',
          'Verify 3x3 grid is displayed correctly',
          'Click on each cell to place markers',
          'Verify only one marker per cell is allowed',
          'Test all 9 cells are functional'
        ],
        expectedResult: 'All cells should accept markers correctly with proper validation',
        preconditions: ['Game is loaded', '3x3 grid is visible'],
        testData: ['All 9 grid positions', 'X and O markers'],
        estimatedTime: '10 minutes',
        tags: ['grid-gameplay', 'tic-tac-toe', 'board-game']
      });
      counter++;
      
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: 'Verify Win Condition Detection',
        description: 'Test that the game correctly identifies winning combinations',
        category: 'Functional',
        priority: 'Critical',
        steps: [
          'Start a new game',
          'Create a horizontal winning combination (3 in a row)',
          'Verify game detects win condition',
          'Test vertical winning combinations',
          'Test diagonal winning combinations',
          'Verify game ends when win is detected'
        ],
        expectedResult: 'Game should correctly identify all winning combinations and end the game',
        preconditions: ['Game is running', 'Players can place markers'],
        testData: ['All possible winning combinations', 'Both X and O wins'],
        estimatedTime: '15 minutes',
        tags: ['win-conditions', 'game-logic', 'tic-tac-toe']
      });
      counter++;
    }
    
    // Scoring system
    if (contentLower.includes('score') || contentLower.includes('point')) {
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: 'Verify Scoring System Accuracy',
        description: 'Test that the scoring system calculates and displays scores correctly',
        category: 'Functional',
        priority: 'High',
        steps: [
          'Start a new game',
          'Perform score-earning actions',
          'Verify score updates in real-time',
          'Check score calculation accuracy',
          'Test score persistence between levels'
        ],
        expectedResult: 'Score should update accurately and persist correctly',
        preconditions: ['Game is running', 'Scoring system is active'],
        testData: ['Various score-earning scenarios', 'Different point values'],
        estimatedTime: '12 minutes',
        tags: ['scoring', 'points', 'game-mechanics']
      });
      counter++;
    }
    
    // Level progression
    if (contentLower.includes('level')) {
      testCases.push({
        id: `TC${counter.toString().padStart(3, '0')}`,
        title: 'Verify Level Progression System',
        description: 'Test level completion and progression to next levels',
        category: 'Functional',
        priority: 'High',
        steps: [
          'Complete current level objectives',
          'Verify level completion is detected',
          'Check transition to next level',
          'Verify level difficulty progression',
          'Test level unlock mechanism'
        ],
        expectedResult: 'Levels should progress smoothly with appropriate difficulty scaling',
        preconditions: ['Game is running', 'Player can complete levels'],
        testData: ['Multiple levels', 'Different completion criteria'],
        estimatedTime: '20 minutes',
        tags: ['level-progression', 'game-flow', 'difficulty']
      });
      counter++;
    }
    
    return testCases;
  }
  
  private generateEcommerceTestCases(content: string, startCounter: number, features?: string[], keyPhrases?: string[]): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    const contentLower = content.toLowerCase();
    
    // Extract specific e-commerce features from document
    const cartMentions = this.extractSpecificMentions(content, ['cart', 'shopping', 'basket']);
    const checkoutMentions = this.extractSpecificMentions(content, ['checkout', 'payment', 'order']);
    const productMentions = this.extractSpecificMentions(content, ['product', 'item', 'catalog']);
    
    // Generate test cases based on actual content
    if (cartMentions.length > 0) {
      cartMentions.slice(0, 2).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Functionality`,
          description: `Test the ${mention} as described in the document`,
          category: 'Functional',
          priority: 'Critical',
          steps: [
            `Access the ${mention}`,
            `Perform ${mention} operations`,
            `Verify ${mention} updates correctly`,
            `Test edge cases for ${mention}`,
            `Validate ${mention} meets document requirements`
          ],
          expectedResult: `${mention} should work as specified in the document`,
          preconditions: ['E-commerce site is accessible'],
          testData: ['Test data from document'],
          estimatedTime: '15 minutes',
          tags: [mention.toLowerCase().replace(/\s+/g, '-'), 'content-based', 'e-commerce']
        });
        counter++;
      });
    }
    
    if (checkoutMentions.length > 0) {
      checkoutMentions.slice(0, 2).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Process`,
          description: `Test the ${mention} process as described in the document`,
          category: 'Functional',
          priority: 'Critical',
          steps: [
            `Navigate to ${mention}`,
            `Complete ${mention} steps`,
            `Verify ${mention} validation`,
            `Test payment processing`,
            `Validate order completion`
          ],
          expectedResult: `${mention} should work as specified in the document`,
          preconditions: ['E-commerce site is accessible', 'Items in cart'],
          testData: ['Payment methods from document', 'Order data'],
          estimatedTime: '18 minutes',
          tags: [mention.toLowerCase().replace(/\s+/g, '-'), 'content-based', 'e-commerce']
        });
        counter++;
      });
    }
    
    return testCases;
  }
  
  private generateAPITestCases(content: string, startCounter: number, features?: string[], keyPhrases?: string[]): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    
    // Extract API endpoints from document
    const endpoints = this.extractAPIEndpoints(content);
    const apiMentions = this.extractSpecificMentions(content, ['api', 'endpoint', 'request', 'response', 'method']);
    
    // Generate test cases for each endpoint found
    if (endpoints.length > 0) {
      endpoints.slice(0, 5).forEach((endpoint, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${endpoint} API Endpoint`,
          description: `Test the ${endpoint} endpoint as described in the document`,
          category: 'Integration',
          priority: 'Critical',
          steps: [
            `Send request to ${endpoint}`,
            `Verify response status code`,
            `Validate response data structure`,
            `Test error handling for ${endpoint}`,
            `Check response time`
          ],
          expectedResult: `${endpoint} should return correct responses as specified in the document`,
          preconditions: ['API is accessible', 'Valid authentication credentials'],
          testData: ['Request payloads from document', 'Test data'],
          estimatedTime: '10 minutes',
          tags: ['api', 'endpoint', 'content-based', endpoint.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    // Generate test cases from API mentions if no specific endpoints found
    if (endpoints.length === 0 && apiMentions.length > 0) {
      apiMentions.slice(0, 3).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} API Functionality`,
          description: `Test the ${mention} as described in the document`,
          category: 'Integration',
          priority: 'High',
          steps: [
            `Access the ${mention}`,
            `Send request to ${mention}`,
            `Verify response`,
            `Test error handling`,
            `Validate against document specification`
          ],
          expectedResult: `${mention} should work as specified in the document`,
          preconditions: ['API is accessible', 'Valid credentials'],
          testData: ['Request data from document'],
          estimatedTime: '12 minutes',
          tags: ['api', 'content-based', mention.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    return testCases;
  }
  
  /**
   * Extract API endpoints from document content
   */
  private extractAPIEndpoints(content: string): string[] {
    const endpoints: string[] = [];
    
    // Look for URL patterns
    const urlMatches = content.match(/https?:\/\/[^\s]+|\/[a-z0-9\/\-_]+/gi);
    if (urlMatches) {
      urlMatches.forEach(url => {
        // Extract endpoint path
        const pathMatch = url.match(/\/([a-z0-9\/\-_]+)/i);
        if (pathMatch && pathMatch[1] && pathMatch[1].length > 2 && pathMatch[1].length < 50) {
          const endpoint = pathMatch[1].replace(/\//g, ' ').trim();
          if (!endpoints.includes(endpoint)) {
            endpoints.push(endpoint);
          }
        }
      });
    }
    
    // Look for patterns like "GET /api/..." or "POST /endpoint"
    const httpMethodMatches = content.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-z0-9\/\-_]+)/gi);
    if (httpMethodMatches) {
      httpMethodMatches.forEach(match => {
        const endpointMatch = match.match(/\/([a-z0-9\/\-_]+)/i);
        if (endpointMatch && endpointMatch[1] && endpointMatch[1].length > 2) {
          const endpoint = endpointMatch[1].replace(/\//g, ' ').trim();
          if (!endpoints.includes(endpoint)) {
            endpoints.push(endpoint);
          }
        }
      });
    }
    
    return endpoints.slice(0, 10);
  }
  
  private generateWebAppTestCases(content: string, startCounter: number, features?: string[], keyPhrases?: string[]): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    const contentLower = content.toLowerCase();
    
    // Extract specific navigation elements from content
    const navigationMentions = this.extractSpecificMentions(content, ['navigation', 'menu', 'page', 'screen', 'route', 'link']);
    const pagesScreens = this.extractPagesOrScreens(content);
    
    // Generate test cases based on actual content, not generic templates
    if (navigationMentions.length > 0 || pagesScreens.length > 0) {
      navigationMentions.slice(0, 3).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Navigation`,
          description: `Test navigation related to ${mention} as described in the document`,
          category: 'UI/UX',
          priority: index === 0 ? 'High' : 'Medium',
          steps: [
            `Access the application`,
            `Navigate to ${mention}`,
            `Verify ${mention} is accessible`,
            `Test navigation flow`,
            `Validate functionality`
          ],
          expectedResult: `${mention} navigation should work as specified in the document`,
          preconditions: ['Application is accessible'],
          testData: ['Navigation paths from document'],
          estimatedTime: '12 minutes',
          tags: ['navigation', 'content-based', mention.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    // Generate test cases from pages/screens mentioned in document
    if (pagesScreens.length > 0) {
      pagesScreens.slice(0, 3).forEach((pageScreen, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${pageScreen} Page Functionality`,
          description: `Test the ${pageScreen} page/screen as described in the document`,
          category: 'Functional',
          priority: 'High',
          steps: [
            `Navigate to ${pageScreen}`,
            `Verify ${pageScreen} loads correctly`,
            `Test functionality on ${pageScreen}`,
            `Validate elements on ${pageScreen}`,
            `Test user interactions`
          ],
          expectedResult: `${pageScreen} should work as specified in the document`,
          preconditions: ['Application is accessible'],
          testData: ['Test data from document'],
          estimatedTime: '15 minutes',
          tags: ['page', 'screen', 'content-based', pageScreen.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    return testCases;
  }
  
  /**
   * Extract specific mentions of terms from content
   */
  private extractSpecificMentions(content: string, keywords: string[]): string[] {
    const mentions: string[] = [];
    const sentences = content.split(/[.!?]\s+/);
    
    sentences.forEach(sentence => {
      keywords.forEach(keyword => {
        if (sentence.toLowerCase().includes(keyword)) {
          // Extract the phrase containing the keyword
          const match = sentence.match(new RegExp(`([A-Z][a-z]+(?:\\s+[a-z]+){0,3}\\s+${keyword}|${keyword}\\s+[a-z]+(?:\\s+[a-z]+){0,3})`, 'i'));
          if (match && match[1]) {
            const phrase = match[1].trim();
            if (phrase.length > 5 && phrase.length < 50 && !mentions.includes(phrase)) {
              mentions.push(phrase);
            }
          }
        }
      });
    });
    
    return mentions.slice(0, 10);
  }
  
  /**
   * Extract pages or screens mentioned in content
   */
  private extractPagesOrScreens(content: string): string[] {
    const pages: string[] = [];
    const sentences = content.split(/[.!?]\s+/);
    
    sentences.forEach(sentence => {
      // Look for patterns like "the [Page Name] page" or "[Screen Name] screen"
      const pageMatches = sentence.match(/\b(the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(page|screen|view|panel)\b/gi);
      if (pageMatches) {
        pageMatches.forEach(match => {
          const pageName = match.replace(/\b(the\s+)?/gi, '').replace(/\s+(page|screen|view|panel)\b/gi, '').trim();
          if (pageName.length > 3 && pageName.length < 40 && !pages.includes(pageName)) {
            pages.push(pageName);
          }
        });
      }
    });
    
    return pages.slice(0, 10);
  }
  
  private generateUniversalTestCases(content: string, startCounter: number): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = startCounter;
    const contentLower = content.toLowerCase();
    
    // Only generate test cases if content mentions these aspects
    // Extract specific UI elements mentioned in document
    const uiMentions = this.extractSpecificMentions(content, ['button', 'form', 'input', 'field', 'element', 'component']);
    if (uiMentions.length > 0) {
      uiMentions.slice(0, 2).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Functionality`,
          description: `Test the ${mention} as described in the document`,
          category: 'UI/UX',
          priority: 'Medium',
          steps: [
            `Access the ${mention}`,
            `Interact with ${mention}`,
            `Verify ${mention} responds correctly`,
            `Test edge cases for ${mention}`,
            `Validate expected behavior`
          ],
          expectedResult: `${mention} should work as specified in the document`,
          preconditions: ['Application is accessible'],
          testData: ['Test data from document'],
          estimatedTime: '15 minutes',
          tags: ['ui-element', 'content-based', mention.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    // Extract validation rules mentioned in document
    const validationMentions = this.extractSpecificMentions(content, ['validation', 'validate', 'check', 'verify', 'error']);
    if (validationMentions.length > 0) {
      validationMentions.slice(0, 2).forEach((mention, index) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Validation`,
          description: `Test the ${mention} validation rules as described in the document`,
          category: 'Data Validation',
          priority: 'High',
          steps: [
            `Set up test scenario for ${mention}`,
            `Test valid inputs`,
            `Test invalid inputs`,
            `Verify validation rules are enforced`,
            `Check error messages`
          ],
          expectedResult: `${mention} validation should work as specified in the document`,
          preconditions: ['Application is accessible'],
          testData: ['Valid and invalid inputs from document'],
          estimatedTime: '18 minutes',
          tags: ['validation', 'content-based', mention.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    // Extract performance aspects mentioned in document
    const performanceMentions = this.extractSpecificMentions(content, ['performance', 'speed', 'load', 'response', 'time']);
    if (performanceMentions.length > 0) {
      performanceMentions.slice(0, 1).forEach((mention) => {
        testCases.push({
          id: `TC${counter.toString().padStart(3, '0')}`,
          title: `Verify ${mention} Performance`,
          description: `Test the ${mention} performance requirements as described in the document`,
          category: 'Performance',
          priority: 'Medium',
          steps: [
            `Set up performance test for ${mention}`,
            `Measure performance metrics`,
            `Compare against requirements`,
            `Test under load`,
            `Document results`
          ],
          expectedResult: `${mention} should meet performance requirements from the document`,
          preconditions: ['Application is accessible', 'Performance tools available'],
          testData: ['Performance scenarios from document'],
          estimatedTime: '20 minutes',
          tags: ['performance', 'content-based', mention.toLowerCase().replace(/\s+/g, '-')]
        });
        counter++;
      });
    }
    
    return testCases;
  }
  
  private generateAdditionalTestCase(counter: number, documentType: string, features: string[]): TestCase {
    // Generate test case based on features from document, not generic templates
    // Use a feature that hasn't been covered yet
    const featureIndex = (counter - 1) % Math.max(features.length, 1);
    const feature = features[featureIndex] || 'core-functionality';
    let featureName = feature.replace(/feature-/g, '').replace(/-/g, ' ');
    
    // Validate and clean the feature name
    featureName = this.cleanFeatureName(featureName);
    
    // Create a proper title
    const capitalizedName = featureName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Determine category based on feature
    const category = this.determineCategoryFromPhrase(featureName);
    
    return {
      id: `TC${counter.toString().padStart(3, '0')}`,
      title: `Verify ${capitalizedName} Feature`,
      description: `Test the ${featureName} functionality as described in the document`,
      category: category,
      priority: featureIndex < 5 ? 'High' : 'Medium',
      steps: [
        `Navigate to the ${featureName} section`,
        `Interact with ${featureName} elements`,
        `Verify ${featureName} responds correctly to user input`,
        `Test error scenarios for ${featureName}`,
        `Validate ${featureName} meets document requirements`
      ],
      expectedResult: `${capitalizedName} should function correctly as specified in the document`,
      preconditions: ['Application is accessible', 'Feature is available'],
      testData: ['Valid test inputs', 'Edge case scenarios'],
      estimatedTime: '15 minutes',
      tags: [feature.replace(/\s+/g, '-'), 'content-based', 'feature-specific']
    };
  }
  
  /**
   * Clean and validate feature name to ensure proper test case titles
   */
  private cleanFeatureName(name: string): string {
    // Remove incomplete endings
    const incompleteEndings = ['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'if', 'these', 'those', 'this', 'that', 'is', 'are', 'was', 'were'];
    let words = name.trim().split(/\s+/);
    
    // Remove trailing incomplete words
    while (words.length > 1 && incompleteEndings.includes(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
    
    // Remove leading articles
    while (words.length > 1 && ['the', 'a', 'an'].includes(words[0].toLowerCase())) {
      words.shift();
    }
    
    // If we have at least 2 meaningful words, return them
    if (words.length >= 2) {
      return words.join(' ');
    }
    
    // If only one word, make it more descriptive
    if (words.length === 1 && words[0].length > 2) {
      return `${words[0]} system`;
    }
    
    // Fallback to generic name
    return 'core functionality';
  }

  /**
   * Check if content is SEVERELY garbled/binary data (only flag truly unreadable content)
   * This is stricter than regular garbled detection - only flags content that's completely unusable
   */
  private isSeverelyGarbled(content: string): boolean {
    // Must have at least some content
    if (content.length < 50) {
      return false; // Too short to judge
    }
    
    // Check if content has VERY few readable words (less than 5% readable)
    const words = content.split(/\s+/).filter(w => w.length > 2 && /[a-zA-Z]{3,}/.test(w));
    const totalWords = content.split(/\s+/).length;
    const wordRatio = words.length / Math.max(totalWords, 1);
    
    // If less than 5% of content is readable words AND content is long, it's severely garbled
    if (wordRatio < 0.05 && content.length > 500) {
      return true;
    }
    
    // Check for excessive non-printable characters (more than 50%)
    const nonPrintableCount = (content.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
    const nonPrintableRatio = nonPrintableCount / Math.max(content.length, 1);
    if (nonPrintableRatio > 0.5) {
      return true;
    }
    
    // Check if content is mostly single characters and symbols (binary-like)
    const singleCharWords = (content.match(/\b\w\b/g) || []).length;
    const singleCharRatio = singleCharWords / Math.max(totalWords, 1);
    if (singleCharRatio > 0.8 && content.length > 500) {
      return true;
    }
    
    // Check for patterns that indicate binary data (lots of control characters)
    const controlCharCount = (content.match(/[\x00-\x1F\x7F-\x9F]/g) || []).length;
    const controlCharRatio = controlCharCount / Math.max(content.length, 1);
    if (controlCharRatio > 0.4) {
      return true;
    }
    
    return false;
  }

  /**
   * Attempt to clean garbled content by extracting readable portions
   */
  private attemptToCleanGarbledContent(content: string): string {
    // First, remove non-printable characters
    let cleaned = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    
    // Extract sequences of readable words (3+ consecutive letters)
    const readableSequences = cleaned.match(/[a-zA-Z]{3,}(?:\s+[a-zA-Z]{3,}){1,}/g) || [];
    
    if (readableSequences.length === 0) {
      // Try a more lenient approach - extract any words with 2+ letters
      const words = cleaned.match(/[a-zA-Z]{2,}/g) || [];
      if (words.length > 10) {
        cleaned = words.join(' ');
      } else {
        return '';
      }
    } else {
      // Join readable sequences
      cleaned = readableSequences.join(' ');
    }
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Try to extract sentences (sequences ending with punctuation)
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length > 0) {
      cleaned = sentences.join(' ').trim();
    }
    
    return cleaned;
  }
  
  /**
   * Extract game name from document content
   */
  private extractGameName(content: string): string | null {
    // Look for patterns like "Game Name:", "Title:", or capitalized phrases at the start
    const titleMatch = content.match(/(?:game|title|name)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    
    // Look for quoted game names
    const quotedMatch = content.match(/"([^"]+)"/);
    if (quotedMatch && quotedMatch[1] && quotedMatch[1].length > 3 && quotedMatch[1].length < 50) {
      return quotedMatch[1].trim();
    }
    
    // Look for capitalized phrases at the beginning of document
    const firstLine = content.split('\n')[0].trim();
    const capitalizedMatch = firstLine.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (capitalizedMatch && capitalizedMatch[1] && capitalizedMatch[1].length > 5 && capitalizedMatch[1].length < 50) {
      return capitalizedMatch[1].trim();
    }
    
    return null;
  }
  
  /**
   * Extract main game mechanic from document content
   */
  private extractMainMechanic(content: string): string | null {
    const contentLower = content.toLowerCase();
    
    // Look for common game mechanics
    const mechanics = [
      { keyword: 'cut drop strike', name: 'Cut Drop Strike' },
      { keyword: 'rope cutting', name: 'Rope Cutting' },
      { keyword: 'tic tac toe', name: 'Tic Tac Toe' },
      { keyword: 'grid', name: 'Grid-Based' },
      { keyword: 'puzzle', name: 'Puzzle' },
      { keyword: 'platform', name: 'Platform' },
      { keyword: 'strategy', name: 'Strategy' }
    ];
    
    for (const mechanic of mechanics) {
      if (contentLower.includes(mechanic.keyword)) {
        return mechanic.name;
      }
    }
    
    // Extract from features if available
    const features = this.extractFeatures(content);
    const gameFeatures = features.filter(f => 
      f.includes('rope') || f.includes('grid') || f.includes('cut') || f.includes('physics')
    );
    
    if (gameFeatures.length > 0) {
      const mainFeature = gameFeatures[0].replace(/feature-/g, '').replace(/-/g, ' ');
      return mainFeature.charAt(0).toUpperCase() + mainFeature.slice(1);
    }
    
    return null;
  }
} 