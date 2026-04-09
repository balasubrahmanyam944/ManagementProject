"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Send, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { BoardSelectionDialog } from './board-selection-dialog';
import { Sprint } from '@/app/testcases/actions';

export interface TestCase {
  id: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  category: string;
  steps: string[];
  expectedResult: string;
  preconditions?: string[];
  testData?: string[];
  estimatedTime?: string;
  tags?: string[];
  sentStatus?: {
    jira: boolean;
    trello: boolean;
    testrail: boolean;
  };
}

export interface Integration {
  name: string;
  connected: boolean;
  icon: string;
}

export interface Board {
  id: string;
  name: string;
  key?: string; // For Jira projects
  lists?: List[]; // For Trello boards
  sprints?: Sprint[]; // For Jira boards
}

export interface List {
  id: string;
  name: string;
}

interface TestCaseCardProps {
  testCase: TestCase;
  integrations: any; // Accept IntegrationStatus | null for now
  onSendToIntegration: (testCase: TestCase, integration: string, boardId: string, listId?: string, sprintId?: string) => Promise<void>;
  onGetBoards: (integration: string) => Promise<Board[]>;
  className?: string;
}

export function TestCaseCard({ 
  testCase, 
  integrations, 
  onSendToIntegration,
  onGetBoards,
  className 
}: TestCaseCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [showBoardDialog, setShowBoardDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const { toast } = useToast();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-500 text-white';
      case 'High':
        return 'bg-orange-500 text-white';
      case 'Medium':
        return 'bg-yellow-500 text-black';
      case 'Low':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const handleSendToIntegration = async (integration: string) => {
    // Check if integrations object exists and is properly initialized
    if (!integrations) {
      toast({
        title: "Loading...",
        description: "Please wait while integrations are being loaded.",
        variant: "default",
      });
      return;
    }

    // Check the specific integration being requested
    const integrationKey = integration.toLowerCase();
    const integrationStatus = integrations[integrationKey];
    
    if (!integrationStatus || !integrationStatus.connected) {
      toast({
        title: "Integration Not Connected",
        description: `Please connect ${integration} in the integrations page first.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedIntegration(integration); // Keep original for dialog
    setLoadingBoards(true);
    setShowBoardDialog(true);
    setBoardError(null);
    setSendingTo(integrationKey); // Use lowercase for sendingTo state

    try {
      const boardList = await onGetBoards(integration);
      setBoards(boardList);
    } catch (error: any) {
      console.error(`Error loading ${integration} boards:`, error);
      const errorMessage = error?.message || `Failed to load ${integration} boards`;
      
      // Provide helpful error messages
      if (errorMessage.includes('unauthorized') || errorMessage.includes('Unauthorized') || errorMessage.includes('Not authenticated')) {
        setBoardError(`${integration} connection has expired. Please reconnect ${integration} in the integrations page.`);
      } else if (errorMessage.includes('not connected')) {
        setBoardError(`Please connect ${integration} in the integrations page first.`);
      } else {
        setBoardError(errorMessage);
      }
      setBoards([]);
    } finally {
      setLoadingBoards(false);
    }
  };

  const handleBoardSelected = async (boardId: string, listId?: string, sprintId?: string) => {
    if (!selectedIntegration) return;
    const integrationKey = selectedIntegration.toLowerCase(); // Convert to lowercase
    setSendingTo(integrationKey); // Use lowercase for sendingTo state
    setShowBoardDialog(false);
    setLoadingBoards(false);

    try {
      // Find the selected board object
      const board = boards.find(b => b.id === boardId);
      let projectKeyOrBoardId = boardId;
      if (selectedIntegration === 'Jira' && board && board.key) {
        projectKeyOrBoardId = board.key;
      }
      await onSendToIntegration(testCase, selectedIntegration, projectKeyOrBoardId, listId, sprintId);
      toast({
        title: "Test Case Sent",
        description: `Successfully sent to ${selectedIntegration}`,
      });
    } catch (error: any) {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send test case",
        variant: "destructive",
      });
    } finally {
      setSendingTo(null);
      setSelectedIntegration(null);
    }
  };

  const handleDialogClose = () => {
    setShowBoardDialog(false);
    setSelectedIntegration(null);
    setBoards([]);
    setBoardError(null);
  };

  return (
    <>
      <Card className={cn("w-full transition-all duration-200 hover:shadow-md", className)}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <CardTitle className="text-lg">{testCase.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {testCase.description}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getPriorityColor(testCase.priority)}>
                    {testCase.priority}
                  </Badge>
                  <Badge variant="outline">
                    {testCase.category}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-6">
                {/* Test Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Test Steps */}
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Test Steps</h4>
                    <ol className="list-decimal list-inside space-y-2">
                      {testCase.steps.map((step, index) => (
                        <li key={index} className="text-sm text-muted-foreground">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Expected Result */}
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Expected Result</h4>
                    <p className="text-sm text-muted-foreground">
                      {testCase.expectedResult}
                    </p>
                  </div>
                </div>

                {/* Preconditions */}
                {testCase.preconditions && testCase.preconditions.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Preconditions</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {testCase.preconditions.map((condition, index) => (
                        <li key={index} className="text-sm text-muted-foreground">
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Test Data */}
                {testCase.testData && testCase.testData.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Test Data</h4>
                    <div className="flex flex-wrap gap-2">
                      {testCase.testData.map((data, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {data}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {testCase.estimatedTime && (
                    <span>⏱️ Estimated Time: {testCase.estimatedTime}</span>
                  )}
                  {testCase.tags && testCase.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span>🏷️ Tags:</span>
                      {testCase.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Integration Buttons */}
                {integrations?.jira?.connected || integrations?.trello?.connected || integrations?.testrail?.connected ? (
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Send to Tools</h4>
                    <div className="flex flex-wrap gap-2">
                      {integrations?.jira?.connected && (
                        <Button
                          key="jira"
                          variant={testCase.sentStatus?.jira ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSendToIntegration('Jira')}
                          disabled={sendingTo === 'jira' || testCase.sentStatus?.jira}
                          className="flex items-center space-x-2"
                        >
                          {sendingTo === 'jira' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : testCase.sentStatus?.jira ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span>
                            {testCase.sentStatus?.jira ? 'Sent to Jira ✅' : 'Send to Jira'}
                          </span>
                        </Button>
                      )}
                      {integrations?.trello?.connected && (
                        <Button
                          key="trello"
                          variant={testCase.sentStatus?.trello ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSendToIntegration('Trello')}
                          disabled={sendingTo === 'trello' || testCase.sentStatus?.trello}
                          className="flex items-center space-x-2"
                        >
                          {sendingTo === 'trello' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : testCase.sentStatus?.trello ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span>
                            {testCase.sentStatus?.trello ? 'Sent to Trello ✅' : 'Send to Trello'}
                          </span>
                        </Button>
                      )}
                      {integrations?.testrail?.connected && (
                        <Button
                          key="testrail"
                          variant={testCase.sentStatus?.testrail ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSendToIntegration('TestRail')}
                          disabled={sendingTo === 'testrail' || testCase.sentStatus?.testrail}
                          className="flex items-center space-x-2"
                        >
                          {sendingTo === 'testrail' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : testCase.sentStatus?.testrail ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span>
                            {testCase.sentStatus?.testrail ? 'Sent to TestRail ✅' : 'Send to TestRail'}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 Connect Jira, Trello, or TestRail in the integrations page to send test cases directly
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Board Selection Dialog */}
      <BoardSelectionDialog
        open={showBoardDialog}
        onOpenChange={handleDialogClose}
        integration={selectedIntegration || ''}
        boards={boards}
        loading={loadingBoards}
        error={boardError}
        onBoardSelected={handleBoardSelected}
      />
    </>
  );
} 