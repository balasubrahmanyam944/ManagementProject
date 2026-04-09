"use client";

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory?: {
      id: number;
      name: string;
      colorName?: string;
    };
  };
}

interface TrelloList {
  id: string;
  name: string;
  pos?: number;
}

interface StatusDropdownProps {
  // Common props
  currentStatus: string;
  currentStatusId?: string;
  issueId: string;
  issueKey?: string;
  projectType: 'jira' | 'trello' | 'testrail';
  
  // For Trello
  boardId?: string;
  listId?: string;
  
  // Callbacks
  onStatusChange?: (newStatus: string, newStatusId: string) => void;
  
  // Styling
  className?: string;
  disabled?: boolean;
}

// Status category colors based on Jira's status categories
const statusCategoryColors: Record<string, string> = {
  'To Do': 'bg-gray-100 text-gray-800 border-gray-300',
  'new': 'bg-gray-100 text-gray-800 border-gray-300',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-300',
  'indeterminate': 'bg-blue-100 text-blue-800 border-blue-300',
  'Done': 'bg-green-100 text-green-800 border-green-300',
  'done': 'bg-green-100 text-green-800 border-green-300',
};

function getStatusColor(status: string, categoryName?: string): string {
  if (categoryName && statusCategoryColors[categoryName]) {
    return statusCategoryColors[categoryName];
  }
  
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('done') || lowerStatus.includes('closed') || lowerStatus.includes('complete') || lowerStatus.includes('resolved')) {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  if (lowerStatus.includes('progress') || lowerStatus.includes('review') || lowerStatus.includes('doing')) {
    return 'bg-blue-100 text-blue-800 border-blue-300';
  }
  return 'bg-gray-100 text-gray-800 border-gray-300';
}

export default function StatusDropdown({
  currentStatus,
  currentStatusId,
  issueId,
  issueKey,
  projectType,
  boardId,
  listId,
  onStatusChange,
  className,
  disabled = false,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitions, setTransitions] = useState<JiraTransition[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [status, setStatus] = useState(currentStatus);
  const [statusId, setStatusId] = useState(currentStatusId || listId);
  
  const { toast } = useToast();
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  // Fetch available transitions/lists when dropdown opens
  const fetchOptions = async () => {
    if (projectType === 'testrail') {
      // TestRail doesn't support status changes from here
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      if (projectType === 'jira' && issueKey) {
        const response = await fetch(
          `${basePath}/api/integrations/jira/transitions?issueKey=${encodeURIComponent(issueKey)}`
        );
        const data = await response.json();
        
        if (data.success) {
          setTransitions(data.transitions);
        } else {
          throw new Error(data.error || 'Failed to fetch transitions');
        }
      } else if (projectType === 'trello' && boardId) {
        const response = await fetch(
          `${basePath}/api/integrations/trello/cards/move?boardId=${encodeURIComponent(boardId)}`
        );
        const data = await response.json();
        
        if (data.success) {
          setLists(data.lists);
        } else {
          throw new Error(data.error || 'Failed to fetch lists');
        }
      }
    } catch (err) {
      console.error('Error fetching status options:', err);
      setError(err instanceof Error ? err.message : 'Failed to load options');
      toast({
        title: "Failed to load status options",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (value: string) => {
    if (updating) return;
    
    setUpdating(true);
    setError(null);
    
    try {
      if (projectType === 'jira' && issueKey) {
        // For Jira, value is the transition ID
        const transition = transitions.find(t => t.id === value);
        if (!transition) {
          throw new Error('Invalid transition selected');
        }
        
        // Check if the new status is the same as the current status
        if (transition.to.name === currentStatus || transition.to.name === status || transition.to.id === statusId || transition.to.id === currentStatusId) {
          setUpdating(false);
          return; // No change needed, exit early
        }
        
        const response = await fetch(`${basePath}/api/integrations/jira/transitions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueKey,
            transitionId: value,
          }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          setStatus(transition.to.name);
          setStatusId(transition.to.id);
          onStatusChange?.(transition.to.name, transition.to.id);
          
          toast({
            title: "Status updated",
            description: `${issueKey} moved to "${transition.to.name}"`,
          });
        } else {
          throw new Error(data.error || 'Failed to update status');
        }
      } else if (projectType === 'trello') {
        // For Trello, value is the list ID
        const list = lists.find(l => l.id === value);
        if (!list) {
          throw new Error('Invalid list selected');
        }
        
        // Check if the new list is the same as the current list
        if (list.name === currentStatus || list.name === status || list.id === statusId) {
          setUpdating(false);
          return; // No change needed, exit early
        }
        
        const response = await fetch(`${basePath}/api/integrations/trello/cards/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: issueId,
            listId: value,
          }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          setStatus(list.name);
          setStatusId(list.id);
          onStatusChange?.(list.name, list.id);
          
          toast({
            title: "Card moved",
            description: `Card moved to "${list.name}"`,
          });
        } else {
          throw new Error(data.error || 'Failed to move card');
        }
      }
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update status');
      toast({
        title: "Failed to update status",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Render options based on project type
  const renderOptions = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="flex items-center justify-center py-4 text-destructive">
          <AlertCircle className="h-4 w-4 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      );
    }
    
    if (projectType === 'jira') {
      if (transitions.length === 0) {
        return (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No transitions available
          </div>
        );
      }
      
      return transitions.map((transition) => (
        <SelectItem 
          key={transition.id} 
          value={transition.id}
          className="cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 text-xs rounded border",
              getStatusColor(transition.to.name, transition.to.statusCategory?.name)
            )}>
              {transition.to.name}
            </span>
            {transition.to.name === status && (
              <Check className="h-3 w-3 text-green-600" />
            )}
          </div>
        </SelectItem>
      ));
    }
    
    if (projectType === 'trello') {
      if (lists.length === 0) {
        return (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No lists available
          </div>
        );
      }
      
      return lists.map((list) => (
        <SelectItem 
          key={list.id} 
          value={list.id}
          className="cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 text-xs rounded border",
              getStatusColor(list.name)
            )}>
              {list.name}
            </span>
            {list.id === statusId && (
              <Check className="h-3 w-3 text-green-600" />
            )}
          </div>
        </SelectItem>
      ));
    }
    
    return null;
  };

  // For TestRail, just show the status without dropdown
  if (projectType === 'testrail') {
    return (
      <span className={cn(
        "px-2 py-1 text-xs rounded border",
        getStatusColor(status),
        className
      )}>
        {status}
      </span>
    );
  }

  // Determine the current value to use for the Select
  // For Trello, we need to ensure we have a valid list ID
  const selectValue = statusId || '';

  return (
    <Select
      value={selectValue}
      onValueChange={handleStatusChange}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          fetchOptions();
        }
      }}
      disabled={disabled || updating}
    >
      <SelectTrigger 
        className={cn(
          "w-auto min-w-[120px] h-7 text-xs border focus:ring-0 focus:ring-offset-0",
          getStatusColor(status),
          updating && "opacity-50",
          className
        )}
      >
        {/* Always show the current status text, don't rely on SelectValue matching */}
        <div className="flex items-center gap-1 pr-2">
          {updating && <Loader2 className="h-3 w-3 animate-spin" />}
          <span>{status || 'Select status'}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {renderOptions()}
      </SelectContent>
    </Select>
  );
}

