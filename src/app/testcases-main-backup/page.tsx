"use client";
import React, { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUpload } from '@/components/ui/file-upload';
import { TestCaseCard, TestCase, Integration, Board } from '@/components/testcases/test-case-card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, FileText, Zap, Brain, Trash2 } from 'lucide-react';
import { 
  processFileAction, 
  generateTestCasesAction, 
  getIntegrationStatusAction,
  getBoardsAction,
  sendTestCaseToJiraAction,
  sendTestCaseToTrelloAction,
  sendTestCaseToTestRailAction,
  saveGeneratedTestcasesAction
} from './actions';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useIntegrations } from '@/hooks/useIntegrations';

function ReadOnlyTestCaseCard({ testCase }: { testCase: any }) {
  return (
    <div className="rounded border bg-background p-4 flex flex-col gap-2">
      <div className="font-semibold text-base">{testCase.title}</div>
      <div className="text-muted-foreground text-sm">{testCase.description}</div>
      <div className="flex gap-2 mt-2">
        {testCase.priority && (
          <span className="inline-block px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-xs font-medium">
            {testCase.priority}
          </span>
        )}
        {testCase.category && (
          <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium">
            {testCase.category}
          </span>
        )}
      </div>
    </div>
  );
}

const allowedCategories = [
  'Functional',
  'UI/UX',
  'Integration',
  'Data Validation',
  'Security',
  'Performance',
  'Edge Case',
];
function sanitizeTestCaseCategory(tc: any) {
  return {
    ...tc,
    category: allowedCategories.includes(tc.category) ? tc.category : 'Functional',
  };
}

export default function TestcasesPage() {
  // All hooks at the top
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [generationProgress, setGenerationProgress] = useState(0);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [previousDocs, setPreviousDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loadingPrevious, setLoadingPrevious] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);
  const [lastGeneratedDocumentId, setLastGeneratedDocumentId] = useState<string | null>(null);
  // Remove expandedDocs state and toggleDoc logic
  // Use only selectedDocId to control which document is shown
  // In sidebar, clicking a document sets selectedDocId
  // In main area, only show testcases for previousDocs.find(d => d.documentId === selectedDocId)

  // Add state for pagination
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // When selectedDocId changes, reset visibleCount
  useEffect(() => {
    setVisibleCount(10);
  }, [selectedDocId]);

  // Infinite scroll logic
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    if (loadMoreRef.current) {
      observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) {
            setVisibleCount(c => c + 10);
          }
        },
        { threshold: 1 }
      );
      observer.observe(loadMoreRef.current);
    }
    return () => {
      if (observer) observer.disconnect();
    };
  }, [loadMoreRef, selectedDocId]);

  // All useCallback and useEffect hooks
  const fetchPreviousTestcases = useCallback(async () => {
    setLoadingPrevious(true);
    try {
      console.log('Fetching previous test cases...');
      const res = await fetch('/api/testcases/list');
      const data = await res.json();
      if (data.success) {
        console.log('Received test cases data:', data.testcases);
        console.log('Current selectedDocId:', selectedDocId);
        setPreviousDocs(data.testcases);
        if (data.testcases.length > 0) {
          // Only set selectedDocId if it's not already set or if the current one doesn't exist
          if (!selectedDocId || !data.testcases.find((doc: any) => doc.documentId === selectedDocId)) {
            console.log('Setting selectedDocId to first document:', data.testcases[0].documentId);
            setSelectedDocId(data.testcases[0].documentId);
          } else {
            console.log('Keeping current selectedDocId:', selectedDocId);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching previous test cases:', err);
      // Optionally handle error
    } finally {
      setLoadingPrevious(false);
    }
  }, [selectedDocId]);

  useEffect(() => {
    fetchPreviousTestcases();
  }, [fetchPreviousTestcases]);

  useEffect(() => {
    if (!isLoading && user) {
      // Check if user has access to testcases page
      const hasRequiredRole = ['TESTER', 'ADMIN', 'MANAGER'].includes(user.role);
      const hasExplicitPageAccess = user.allowedPages && user.allowedPages.includes('testcases');
      if (!hasRequiredRole && !hasExplicitPageAccess) {
        router.replace('/dashboard?error=unauthorized');
      }
    }
  }, [user, isLoading, router]);

  const { integrations, loading: integrationsLoading } = useIntegrations();

  // Access checks and early return
  const hasRequiredRole = user ? ['TESTER', 'ADMIN', 'MANAGER'].includes(user.role) : false;
  const hasExplicitPageAccess = user?.allowedPages && user.allowedPages.includes('testcases');
  const hasAccess = hasRequiredRole || hasExplicitPageAccess;
  if (!user || !hasAccess) {
    return null;
  }

  const handleFileSelect = async (file: File) => {
    setUploadedFile(file);
    setUploadError(null);
    setIsUploading(true);
    setTestCases([]); // Clear previous test cases

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await processFileAction(formData);

      if (result.success) {
        setFileId(result.fileId || null);
        toast({
          title: "File Uploaded Successfully",
          description: result.message,
        });
      } else {
        setUploadError(result.error || result.message);
        toast({
          title: "Upload Failed",
          description: result.error || result.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setUploadError(error.message);
      toast({
        title: "Upload Error",
        description: "An unexpected error occurred during file upload.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileRemove = () => {
    setUploadedFile(null);
    setFileId(null);
    setUploadError(null);
    setTestCases([]);
  };

  // Update handleGenerateTestCases to save testcases and refresh sidebar
  const handleGenerateTestCases = async () => {
    if (!uploadedFile) {
      toast({
        title: "No File Selected",
        description: "Please upload a file first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setAiError(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      // Read file content
      const content = await readFileContent(uploadedFile);
      // Generate test cases
      const result = await generateTestCasesAction(content, uploadedFile.name);
      clearInterval(progressInterval);
      setGenerationProgress(100);

      if (result.success && result.testCases) {
        setTestCases(result.testCases);
        setLastUploadedFileName(uploadedFile.name);
        // Save to DB
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setLastGeneratedDocumentId(documentId);
        await saveGeneratedTestcasesAction({
          documentId,
          documentName: uploadedFile.name,
          testCases: result.testCases,
        });
        // Refresh previous testcases
        await fetchPreviousTestcases();
        toast({
          title: "Test Cases Generated",
          description: `Successfully generated ${result.testCases.length} test cases.`,
        });
      } else {
        throw new Error(result.error || 'Failed to generate test cases');
      }
    } catch (error: any) {
      setAiError(error.message || 'AI is currently overloaded. Please try again.');
      toast({
        title: "Generation Failed",
        description: error.message || 'AI is currently overloaded. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  // Retry handler
  const handleRetryAI = () => {
    setAiError(null);
    handleGenerateTestCases();
  };

  // Helper function to read file content
  const readFileContent = async (file: File): Promise<string> => {
    try {
      console.log(`📄 Reading content from file: ${file.name} (${file.type})`);
      
      // Import the text extraction utility
      const { extractTextFromFile } = await import('@/lib/utils/pdf-parser');
      
      // Use the proper text extraction utility that handles PDFs and other file types
      const content = await extractTextFromFile(file);
      
      console.log(`📄 Successfully extracted ${content.length} characters from ${file.name}`);
      
      // Validate that we got meaningful content
      if (content.length < 50) {
        console.warn(`⚠️ Very little content extracted from ${file.name}. This might affect test case generation quality.`);
      }
      
      return content;
    } catch (error) {
      console.error('❌ Error reading file content:', error);
      throw new Error(`Failed to read file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleGetBoards = async (integration: string): Promise<Board[]> => {
    try {
      return await getBoardsAction(integration);
    } catch (error: any) {
      console.error(`Error fetching ${integration} boards:`, error);
      throw error;
    }
  };

  const handleSendToIntegration = async (
    testCase: TestCase, 
    integration: string, 
    boardId: string, 
    listId?: string,
    sprintId?: string
  ) => {
    startTransition(async () => {
      try {
        let result;
        
        // Get test case ID and document ID for tracking sent status
        const testCaseId = (testCase as any)._id || testCase.id;
        const documentId = selectedDocId || undefined;
        
        console.log('Sending test case to integration:', {
          integration,
          testCaseId,
          documentId,
          boardId,
          listId,
          sprintId
        });
        
        if (integration === 'Jira') {
          const sanitized = sanitizeTestCaseCategory(testCase) as import('@/lib/ai/test-case-generator').TestCase;
          result = await sendTestCaseToJiraAction(sanitized, boardId, sprintId, testCaseId, documentId);
        } else if (integration === 'Trello') {
          if (!listId) {
            throw new Error('List ID is required for Trello');
          }
          const sanitized = sanitizeTestCaseCategory(testCase) as import('@/lib/ai/test-case-generator').TestCase;
          result = await sendTestCaseToTrelloAction(sanitized, boardId, listId, testCaseId, documentId);
        } else if (integration === 'TestRail') {
          const sanitized = sanitizeTestCaseCategory(testCase) as import('@/lib/ai/test-case-generator').TestCase;
          result = await sendTestCaseToTestRailAction(sanitized, boardId, listId, testCaseId, documentId);
        } else {
          throw new Error(`Unsupported integration: ${integration}`);
        }

        if (result.success) {
          toast({
            title: "Test Case Sent",
            description: `${result.message}${result.issueKey ? ` (${result.issueKey})` : ''}`,
          });
          
          console.log('Test case sent successfully, refreshing test cases...');
          // Optimistically update "sent" status in the currently generated list
          try {
            const key = integration.toLowerCase();
            setTestCases(prev => prev.map(tc => {
              const tcId = (tc as any)._id || tc.id;
              if (tcId === ((testCase as any)._id || testCase.id)) {
                const prevStatus = (tc as any).sentStatus || {} as any;
                return {
                  ...tc,
                  sentStatus: {
                    ...prevStatus,
                    [key]: true,
                  },
                } as any;
              }
              return tc as any;
            }));
          } catch (e) {
            console.warn('Could not set local sentStatus for generated list:', e);
          }

          // Refresh the test cases from DB (affects the Previous Documents section)
          await fetchPreviousTestcases();
          console.log('Test cases refreshed');
        } else {
          throw new Error(result.error || result.message);
        }
      } catch (error: any) {
        console.error('Error sending test case:', error);
        toast({
          title: "Send Failed",
          description: error.message,
          variant: "destructive",
        });
        throw error; // Re-throw to let the card component handle it
      }
    });
  };

  // Delete document handler
  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document and all its testcases?')) return;
    try {
      await fetch('/api/testcases/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      await fetchPreviousTestcases();
      // Optionally reset selectedDocId if deleted
      if (selectedDocId === documentId) {
        setSelectedDocId(null);
      }
    } catch (err) {
      // Optionally show error
    }
  };

  // Remove expandedDocs state and toggleDoc logic
  // Use only selectedDocId to control which document is shown
  // In sidebar, clicking a document sets selectedDocId
  // In main area, only show testcases for previousDocs.find(d => d.documentId === selectedDocId)

  return (
    <div className="container mx-auto py-d8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI Test Case Generator</h1>
            <p className="text-muted-foreground">
              Upload your documents and let AI generate comprehensive test cases automatically
            </p>
          </div>
        </div>
      </div>

      {/* File Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Document Upload</span>
          </CardTitle>
          <CardDescription>
            Upload your requirements, specifications, or design documents to generate test cases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            uploadedFile={uploadedFile}
            isUploading={isUploading}
            uploadError={uploadError}
            acceptedFileTypes={['.pdf', '.doc', '.docx', '.txt', '.md']}
            maxFileSize={50 * 1024 * 1024} // 50MB (increased from 10MB)
          />
          
          {uploadedFile && fileId && !uploadError && (
            <div className="mt-6 flex justify-center">
              <Button
                onClick={handleGenerateTestCases}
                disabled={isGenerating}
                size="lg"
                className="flex items-center space-x-2"
              >
                {isGenerating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
                <span>
                  {isGenerating ? 'Generating Test Cases...' : 'Generate Test Cases'}
                </span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Error Message and Retry Button */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-4">
          <div>{aiError}</div>
          <button onClick={handleRetryAI} className="mt-2 btn btn-primary">Try Again</button>
        </div>
      )}
{/* Empty State */}
      {testCases.length === 0 && !isGenerating && (
        <Card className="text-center py-12">
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-muted rounded-full">
                <FileText className="h-12 w-12 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No Document Uploaded</h3>
                <p className="text-muted-foreground mt-1">
                  Upload a document to start generating AI-powered test cases
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                <span className="bg-muted px-2 py-1 rounded">PDF</span>
                <span className="bg-muted px-2 py-1 rounded">DOC</span>
                <span className="bg-muted px-2 py-1 rounded">DOCX</span>
                <span className="bg-muted px-2 py-1 rounded">TXT</span>
                <span className="bg-muted px-2 py-1 rounded">MD</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* AI Processing Status */}
      {isGenerating && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className="relative">
                  <Brain className="h-8 w-8 text-primary animate-pulse" />
                  <div className="absolute -top-1 -right-1">
                    <Zap className="h-4 w-4 text-yellow-500 animate-bounce" />
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-primary">AI is analyzing your document...</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Our AI is thoroughly examining your document to identify features, user flows, 
                  business rules, and generating comprehensive test cases. This may take a few moments.
                </p>
                <div className="mt-3 w-full bg-primary/10 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: `${generationProgress}%` }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
 {/* Test Cases Results */}
      {testCases.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Generated Test Cases</h2>
              <p className="text-muted-foreground">
                {testCases.length} comprehensive test cases generated from your document
              </p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>AI Generated</span>
            </div>
          </div>

          {/* Test Case Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-center">
                  {testCases.length}
                </div>
                <p className="text-xs text-muted-foreground text-center">Total Test Cases</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-center text-red-500">
                  {testCases.filter(tc => tc.priority === 'Critical' || tc.priority === 'High').length}
                </div>
                <p className="text-xs text-muted-foreground text-center">High Priority</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-center text-blue-500">
                  {[...new Set(testCases.map(tc => tc.category))].length}
                </div>
                <p className="text-xs text-muted-foreground text-center">Categories</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-center text-green-500">
                  {integrations?.jira.connected ? 1 : 0}
                </div>
                <p className="text-xs text-muted-foreground text-center">Connected Tools</p>
              </CardContent>
            </Card>
          </div>

          {/* Test Cases List */}
          <div className="space-y-4">
            {testCases.map((testCase) => (
              <TestCaseCard
                key={testCase.id}
                testCase={sanitizeTestCaseCategory(testCase)}
                integrations={integrations || { jira: { connected: false }, trello: { connected: false } }}
                onSendToIntegration={handleSendToIntegration}
                onGetBoards={handleGetBoards}
              />
            ))}
          </div>
        </div>
      )}

      {/* Previously generated testcases section - collapsible */}
      <div className="flex border rounded-lg bg-muted/50 min-h-[400px]">
        {/* Sidebar: Documents */}
        <div className="w-72 border-r bg-background p-4 overflow-y-auto">
          <div className="font-semibold mb-4">Generated Documents</div>
          {loadingPrevious ? (
            <div>Loading...</div>
          ) : previousDocs.length === 0 ? (
            <div className="text-muted-foreground text-sm">No generated testcases yet.</div>
          ) : (
            previousDocs.map(doc => (
              <div
                key={doc.documentId}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer mb-1 ${selectedDocId === doc.documentId ? 'bg-accent' : ''}`}
                onClick={() => setSelectedDocId(doc.documentId)}
              >
                <FileText className="w-4 h-4 text-primary" />
                <span className="truncate flex-1">{doc.documentName}</span>
                {/* <button
                  className="ml-2 text-red-500 hover:text-red-700"
                  title="Delete Document"
                  onClick={e => { e.stopPropagation(); handleDeleteDocument(doc.documentId); }}
                >
                  <Trash2 className="w-4 h-4" />
                </button> */}
              </div>
            ))
          )}
        </div>
        {/* Main: Testcases for selected document (collapsible) */}
        <div className="flex-1 p-6 overflow-y-auto">
          {previousDocs.find(doc => doc.documentId === selectedDocId) ? (
            <div>
              <div className="text-lg font-semibold mb-2">
                {previousDocs.find(doc => doc.documentId === selectedDocId)?.documentName}
              </div>
              <div className="text-muted-foreground mb-4 text-sm">
                Generated {previousDocs.find(doc => doc.documentId === selectedDocId)?.testcases.length} test cases from {previousDocs.find(doc => doc.documentId === selectedDocId)?.documentName}
              </div>
              <div className="space-y-4">
                {previousDocs.find(doc => doc.documentId === selectedDocId)?.testcases.slice(0, visibleCount).map((tc: any) => {
                  console.log('Rendering test case:', tc._id, 'with sentStatus:', tc.sentStatus);
                  return (
                    <TestCaseCard
                      key={tc._id}
                      testCase={sanitizeTestCaseCategory({ ...tc, category: tc.category as string })}
                      integrations={integrations || { jira: { connected: false }, trello: { connected: false } }}
                      onSendToIntegration={handleSendToIntegration}
                      onGetBoards={handleGetBoards}
                    />
                  );
                })}
                {visibleCount < previousDocs.find(doc => doc.documentId === selectedDocId)?.testcases.length && (
                  <Button onClick={() => setVisibleCount(c => c + 10)}>Load More</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">Select a document to view its testcases.</div>
          )}
        </div>
      </div>

 <div ref={loadMoreRef} style={{ height: 1 }} />


    </div>
  );
}