"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { JiraDashboardIssue } from "@/types/integrations";
import StatusDropdown from "./StatusDropdown";

interface ChartDrilldownProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  issues: JiraDashboardIssue[];
  projectType?: 'jira' | 'trello' | 'testrail';
  boardId?: string; // For Trello
  onExport?: () => void;
  onPrint?: () => void;
  onStatusChange?: (issueId: string, newStatus: string, newStatusId: string) => void;
}

export default function ChartDrilldown({
  isOpen,
  onClose,
  title,
  description,
  issues,
  projectType = 'jira',
  boardId,
  onExport,
  onPrint,
  onStatusChange
}: ChartDrilldownProps) {
  // Track local status updates for optimistic UI
  const [localStatusUpdates, setLocalStatusUpdates] = useState<Record<string, { name: string; id: string }>>({});

  const handleStatusChange = (issueId: string, issueKey: string, newStatus: string, newStatusId: string) => {
    // Update local state for optimistic UI
    setLocalStatusUpdates(prev => ({
      ...prev,
      [issueId]: { name: newStatus, id: newStatusId }
    }));
    
    // Call parent callback if provided
    onStatusChange?.(issueId, newStatus, newStatusId);
  };

  const getIssueStatus = (issue: JiraDashboardIssue) => {
    // Check for local updates first
    if (localStatusUpdates[issue.id]) {
      return localStatusUpdates[issue.id].name;
    }
    return issue.status.name;
  };

  const getIssueStatusId = (issue: JiraDashboardIssue) => {
    // Check for local updates first
    if (localStatusUpdates[issue.id]) {
      return localStatusUpdates[issue.id].id;
    }
    return issue.status.id;
  };

  // Get list ID for Trello issues
  const getListId = (issue: JiraDashboardIssue) => {
    // For Trello issues converted to JiraDashboardIssue format
    // The listId might be stored in a custom field or status.id
    return (issue as any).listId || issue.status.id;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        
        <div className="flex justify-end gap-2 mb-4">
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          )}
        </div>
        
        <div id="drilldown-content" className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Key</TableHead>
                <TableHead className="min-w-[200px]">Summary</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[120px]">Assignee</TableHead>
                <TableHead className="w-[100px]">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.length > 0 ? (
                issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.key}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={issue.summary}>
                      {issue.summary}
                    </TableCell>
                    <TableCell>
                      <StatusDropdown
                        currentStatus={getIssueStatus(issue)}
                        currentStatusId={getIssueStatusId(issue)}
                        issueId={issue.id}
                        issueKey={issue.key}
                        projectType={projectType}
                        boardId={boardId}
                        listId={projectType === 'trello' ? getListId(issue) : undefined}
                        onStatusChange={(newStatus, newStatusId) => 
                          handleStatusChange(issue.id, issue.key, newStatus, newStatusId)
                        }
                      />
                    </TableCell>
                    <TableCell>{issue.issuetype.name}</TableCell>
                    <TableCell>{issue.assignee?.displayName || 'Unassigned'}</TableCell>
                    <TableCell>{new Date(issue.updated).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                    No issues found matching the criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
