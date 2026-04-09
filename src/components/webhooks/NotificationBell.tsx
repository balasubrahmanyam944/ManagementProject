"use client";

import { useState } from 'react';
import { Bell, Check, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useWebhookContextOptional } from '@/contexts/WebhookContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface NotificationBellProps {
  className?: string;
}

// Get icon based on integration type
function getIntegrationIcon(integrationType: string) {
  switch (integrationType) {
    case 'JIRA':
      return (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
          J
        </div>
      );
    case 'TRELLO':
      return (
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs">
          T
        </div>
      );
    case 'TESTRAIL':
      return (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs">
          TR
        </div>
      );
    case 'SLACK':
      return (
        <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xs">
          S
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">
          ?
        </div>
      );
  }
}

// Get description for event
function getEventDescription(event: any): string {
  if (event.data?.issueKey) {
    let desc = `Issue ${event.data.issueKey}`;
    if (event.data?.issueSummary) {
      desc += `: ${event.data.issueSummary.substring(0, 50)}`;
      if (event.data.issueSummary.length > 50) desc += '...';
    }
    if (event.data?.status) {
      desc += ` → ${event.data.status}`;
    }
    return desc;
  }
  
  if (event.data?.cardName) {
    let desc = `Card: ${event.data.cardName.substring(0, 50)}`;
    if (event.data.cardName.length > 50) desc += '...';
    if (event.data?.movedTo) {
      desc += ` → ${event.data.movedTo}`;
    }
    return desc;
  }
  
  if (event.eventType) {
    // Format event type to human readable
    return event.eventType
      .replace(/_/g, ' ')
      .replace(/jira:|trello:/g, '')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());
  }
  
  return 'Activity detected';
}

// Get link for event
function getEventLink(event: any): string | null {
  if (event.projectId) {
    return `/project/${event.projectId}`;
  }
  return null;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const webhookContext = useWebhookContextOptional();
  
  if (!webhookContext) {
    return null;
  }

  const { 
    events, 
    unreadCount, 
    markAllAsRead, 
    markAsRead, 
    deleteEvent,
    clearEvents,
    connected,
    reconnect,
    hasRecentActivity 
  } = webhookContext;

  // Get recent events (last 20)
  const recentEvents = [...events].reverse().slice(0, 20);

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const handleClearAll = () => {
    clearEvents();
    setOpen(false);
  };

  const handleEventClick = (eventId: string) => {
    markAsRead(eventId);
  };

  const handleDeleteEvent = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the click handler
    deleteEvent(eventId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        >
          <Bell className={cn(
            "h-5 w-5",
            hasRecentActivity && "animate-wiggle"
          )} />
          
          {/* Unread badge */}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!connected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={reconnect}
                title="Reconnect"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {events.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleClearAll}
                title="Clear all"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[400px]">
          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-center text-muted-foreground">
              <Bell className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs mt-1">
                {connected 
                  ? 'Changes from Jira/Trello will appear here'
                  : 'Not connected to real-time updates'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentEvents.map((event) => {
                const link = getEventLink(event);
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group",
                      !event.read && "bg-blue-50/50 dark:bg-blue-950/20"
                    )}
                    onClick={() => handleEventClick(event.id)}
                  >
                    {/* Integration icon */}
                    {getIntegrationIcon(event.integrationType)}
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase">
                          {event.integrationType}
                        </span>
                        {!event.read && (
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate">
                        {getEventDescription(event)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                    
                    {/* Actions - Always visible on the right */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Link indicator */}
                      {link && (
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-60 hover:opacity-100 transition-opacity" />
                      )}
                      {/* Delete button - always visible and prominent */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0 opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteEvent(event.id, e);
                        }}
                        title="Delete notification"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );

                if (link) {
                  return (
                    <Link key={event.id} href={link} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  );
                }
                
                return <div key={event.id}>{content}</div>;
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {events.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2 text-center">
              <Link 
                href="/project-overview" 
                onClick={() => setOpen(false)}
                className="text-sm text-primary hover:underline"
              >
                View all projects
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// CSS animation for wiggle effect - add to globals.css
// @keyframes wiggle {
//   0%, 100% { transform: rotate(0deg); }
//   25% { transform: rotate(-10deg); }
//   75% { transform: rotate(10deg); }
// }
// .animate-wiggle { animation: wiggle 0.3s ease-in-out; }

