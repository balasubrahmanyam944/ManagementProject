"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FolderOpen, List as ListIcon, ExternalLink, AlertCircle, Settings, Zap } from 'lucide-react';
import { Board, List } from './test-case-card';
import { Sprint } from '@/app/testcases/actions';

interface BoardSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: string;
  boards: Board[];
  loading: boolean;
  onBoardSelected: (boardId: string, listId?: string, sprintId?: string) => void;
  error?: string | null;
}

export function BoardSelectionDialog({
  open,
  onOpenChange,
  integration,
  boards,
  loading,
  onBoardSelected,
  error,
}: BoardSelectionDialogProps) {
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [selectedList, setSelectedList] = useState<List | null>(null);
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);

  const handleBoardSelect = (board: Board) => {
    setSelectedBoard(board);
    setSelectedList(null);
    setSelectedSprint(null);
    
    // If it's a simple case with no lists or sprints, send immediately
    if (integration === 'Jira' && (!board.sprints || board.sprints.length === 0)) {
      onBoardSelected(board.id);
      handleClose();
    } else if (integration === 'Trello' && (!board.lists || board.lists.length === 0)) {
      onBoardSelected(board.id);
      handleClose();
    } else if (integration === 'TestRail') {
      // For TestRail, we can send immediately since we'll find a section automatically
      onBoardSelected(board.id);
      handleClose();
    }
  };

  const handleListSelect = (list: List) => {
    setSelectedList(list);
  };

  const handleSprintSelect = (sprint: Sprint) => {
    setSelectedSprint(sprint);
  };

  const handleSend = () => {
    if (!selectedBoard) return;
    
    if (integration === 'Trello' && selectedList) {
      onBoardSelected(selectedBoard.id, selectedList.id);
    } else if (integration === 'Jira' && selectedSprint) {
      onBoardSelected(selectedBoard.id, undefined, selectedSprint.id);
    } else if (integration === 'Teams' && selectedList) {
      onBoardSelected(selectedBoard.id, selectedList.id);
    } else {
      onBoardSelected(selectedBoard.id);
    }
    
    handleClose();
  };

  const handleClose = () => {
    setSelectedBoard(null);
    setSelectedList(null);
    setSelectedSprint(null);
    onOpenChange(false);
  };

  const getIntegrationIcon = (integration: string) => {
    switch (integration) {
      case 'Jira':
        return '🔷';
      case 'Trello':
        return '📋';
      case 'Teams':
        return '💬';
      case 'TestRail':
        return '📊';
      default:
        return '🔗';
    }
  };

  const canSend = () => {
    if (!selectedBoard) return false;
    
    // For Jira, if there are sprints available, require sprint selection
    if (integration === 'Jira') {
      if (selectedBoard.sprints && selectedBoard.sprints.length > 0) {
        return selectedSprint !== null;
      }
      return true; // No sprints available, can send without sprint
    }
    
    // For Trello, if there are lists available, require list selection
    if (integration === 'Trello') {
      if (selectedBoard.lists && selectedBoard.lists.length > 0) {
        return selectedList !== null;
      }
      return true; // No lists available, can send without list
    }
    
    if (integration === 'Teams') {
      if (selectedBoard.lists && selectedBoard.lists.length > 0) {
        return selectedList !== null;
      }
      return true;
    }
    
    return true;
  };

  const isConnectionError = error && (
    error.includes('not connected') || 
    error.includes('not found') || 
    error.includes('Unauthorized') ||
    error.includes('authentication') ||
    error.includes('permissions') ||
    error.includes('scope')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>{getIntegrationIcon(integration)}</span>
            <span>Send to {integration}</span>
          </DialogTitle>
          <DialogDescription>
            {integration === 'Jira' 
              ? 'Select a project and optionally a sprint where you want to create the test case issue.'
              : integration === 'Trello'
              ? 'Select a board and list where you want to create the test case card.'
              : integration === 'Teams'
              ? 'Select a team and channel where you want to create the test case.'
              : integration === 'TestRail'
              ? 'Select a project where you want to create the test case.'
              : `Select a destination in ${integration} for your test case.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                {isConnectionError && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/integrations', '_blank')}
                    className="ml-2 flex items-center space-x-1"
                  >
                    <Settings className="h-3 w-3" />
                    <span>Fix Connection</span>
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading {integration} {integration === 'Jira' ? 'projects' : integration === 'Trello' ? 'boards' : integration === 'TestRail' ? 'projects' : 'teams'}...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Connection Error</h3>
              <p className="text-muted-foreground mb-4">
                {isConnectionError 
                  ? `${integration} is not properly connected. Please check your connection settings.`
                  : 'There was an error loading your data. Please try again.'
                }
              </p>
              <div className="flex justify-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => window.open('/integrations', '_blank')}
                  className="flex items-center space-x-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Go to Integrations</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClose}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No {integration === 'Jira' ? 'Projects' : integration === 'Trello' ? 'Boards' : integration === 'TestRail' ? 'Projects' : 'Teams'} Found</h3>
              <p className="text-muted-foreground mb-4">
                {integration === 'Jira' 
                  ? 'No accessible Jira projects found. Make sure you have permission to view projects.'
                  : integration === 'Trello'
                  ? 'No Trello boards found. Create a board in Trello first.'
                  : integration === 'TestRail'
                  ? 'No TestRail projects found. Create a project in TestRail first.'
                  : 'No Teams found. Create a team in Teams first.'
                }
              </p>
              <Button
                variant="outline"
                onClick={() => window.open(
                  integration === 'Jira' 
                    ? 'https://atlassian.net' 
                    : integration === 'Trello'
                    ? 'https://trello.com'
                    : integration === 'TestRail'
                    ? 'https://testrail.com'
                    : 'https://teams.microsoft.com', 
                  '_blank'
                )}
                className="flex items-center space-x-2"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open {integration}</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-96">
              {/* Board/Project Selection */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center space-x-2">
                  <FolderOpen className="h-4 w-4" />
                  <span>{integration === 'Jira' ? 'Projects' : integration === 'Trello' ? 'Boards' : integration === 'TestRail' ? 'Projects' : integration === 'Teams' ? 'Teams' : 'Boards'}</span>
                </h4>
                <ScrollArea className="h-64 border rounded-md">
                  <div className="p-2 space-y-2">
                    {boards.map((board) => (
                      <div
                        key={board.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedBoard?.id === board.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border'
                        }`}
                        onClick={() => handleBoardSelect(board)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="font-medium">{board.name}</h5>
                            {board.key && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {board.key}
                              </Badge>
                            )}
                          </div>
                          {selectedBoard?.id === board.id && (
                            <div className="w-2 h-2 bg-primary rounded-full" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Sprint Selection (for Jira) */}
              {integration === 'Jira' && selectedBoard && selectedBoard.sprints && selectedBoard.sprints.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center space-x-2">
                    <Zap className="h-4 w-4" />
                    <span>Sprints</span>
                  </h4>
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-2 space-y-2">
                      {selectedBoard.sprints.map((sprint) => (
                        <div
                          key={sprint.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedSprint?.id === sprint.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border'
                          }`}
                          onClick={() => handleSprintSelect(sprint)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium">{sprint.name}</h5>
                              <Badge 
                                variant={sprint.state === 'active' ? 'default' : 'secondary'} 
                                className="text-xs mt-1"
                              >
                                {sprint.state}
                              </Badge>
                            </div>
                            {selectedSprint?.id === sprint.id && (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* List Selection (for Trello) */}
              {integration === 'Trello' && selectedBoard && selectedBoard.lists && selectedBoard.lists.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center space-x-2">
                    <ListIcon className="h-4 w-4" />
                    <span>Lists</span>
                  </h4>
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-2 space-y-2">
                      {selectedBoard.lists.map((list) => (
                        <div
                          key={list.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedList?.id === list.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border'
                          }`}
                          onClick={() => handleListSelect(list)}
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium">{list.name}</h5>
                            {selectedList?.id === list.id && (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* List Selection (for Teams) */}
              {integration === 'Teams' && selectedBoard && selectedBoard.lists && selectedBoard.lists.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center space-x-2">
                    <ListIcon className="h-4 w-4" />
                    <span>Channels</span>
                  </h4>
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-2 space-y-2">
                      {selectedBoard.lists.map((list) => (
                        <div
                          key={list.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedList?.id === list.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border'
                          }`}
                          onClick={() => handleListSelect(list)}
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium">{list.name}</h5>
                            {selectedList?.id === list.id && (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Selection Summary */}
          {selectedBoard && !error && (
            <div className="bg-muted/30 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Selected Destination:</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span>{integration === 'Jira' ? 'Project' : integration === 'Trello' ? 'Board' : integration === 'TestRail' ? 'Project' : integration === 'Teams' ? 'Team' : 'Board'}: <strong>{selectedBoard.name}</strong></span>
                  {selectedBoard.key && (
                    <Badge variant="outline" className="text-xs">
                      {selectedBoard.key}
                    </Badge>
                  )}
                </div>
                {integration === 'Jira' && selectedSprint && (
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span>Sprint: <strong>{selectedSprint.name}</strong></span>
                    <Badge 
                      variant={selectedSprint.state === 'active' ? 'default' : 'secondary'} 
                      className="text-xs"
                    >
                      {selectedSprint.state}
                    </Badge>
                  </div>
                )}
                {integration === 'Trello' && selectedList && (
                  <div className="flex items-center space-x-2">
                    <ListIcon className="h-4 w-4 text-muted-foreground" />
                    <span>List: <strong>{selectedList.name}</strong></span>
                  </div>
                )}
                {integration === 'Teams' && selectedList && (
                  <div className="flex items-center space-x-2">
                    <ListIcon className="h-4 w-4 text-muted-foreground" />
                    <span>Channel: <strong>{selectedList.name}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {!error && (
              <Button 
                onClick={handleSend} 
                disabled={!canSend()}
                className="flex items-center space-x-2"
              >
                <span>{getIntegrationIcon(integration)}</span>
                <span>Send to {integration}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 