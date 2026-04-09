# Jira Webhook Flow Documentation

This document explains the complete flow of how updates from Jira are detected and reflected in the application UI.

## Overview

When a ticket is updated in Jira, the application uses **webhooks as the PRIMARY method**, with polling as a fallback:

1. **Direct Webhooks** (PRIMARY) - Real-time, instant updates when properly registered
2. **Polling Service** (FALLBACK ONLY) - Checks every 30 seconds, only used when:
   - Webhooks are not registered
   - Webhooks are in `PENDING` status
   - Webhooks are `ACTIVE` but have errors or haven't been triggered recently

**Architecture Decision**: Webhooks are the intended method for real-time updates. Polling is only used as a safety net when webhooks are unavailable or unreliable.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER UPDATES TICKET IN JIRA                                  │
│    Example: Changes SCRUM-494 status from "To Do" to "In Progress"│
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. JIRA POLLING SERVICE (Every 30 seconds)                      │
│    File: src/lib/services/jira-polling-service.ts                │
│                                                                   │
│    - Polls Jira API: GET /rest/api/3/search/jql                  │
│    - Query: "project = SCRUM ORDER BY updated DESC"              │
│    - Fetches last 50 issues                                      │
│    - Compares with cached state (lastIssueKeys, lastIssueUpdates)│
│                                                                   │
│    Detection Logic:                                              │
│    ✓ New Issue: Not in lastIssueKeys                            │
│    ✓ Updated Issue: updated timestamp > lastUpdate               │
│    ✓ Deleted Issue: In lastIssueKeys but not in current         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CHANGE DETECTED                                               │
│    Log: "🔄 JIRA POLLING: ✅ ISSUE UPDATED DETECTED"             │
│                                                                   │
│    Data Captured:                                                │
│    - Issue Key: SCRUM-494                                        │
│    - Summary: [TEST] Verify Cutting Mechanic Functionality      │
│    - Status: In Progress                                         │
│    - Updated Timestamp: 2025-12-05T11:26:56.467Z                 │
│    - Project: SCRUM                                              │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. BROADCAST CHANGE                                              │
│    File: src/lib/services/jira-polling-service.ts               │
│    Function: broadcastChange()                                   │
│                                                                   │
│    Calls: broadcastWebhookUpdate()                              │
│    - userId: 6932bb40c5c25143d79ea1c1                            │
│    - integrationType: 'JIRA'                                     │
│    - eventType: 'jira:issue_updated'                             │
│    - projectId: 'SCRUM'                                          │
│    - data: { issueKey, issueSummary, status, updated }           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. REALTIME SERVICE                                              │
│    File: src/lib/services/realtime-service.ts                    │
│    Function: broadcastUpdate()                                    │
│                                                                   │
│    Steps:                                                        │
│    1. Creates WebhookBroadcastMessage object                     │
│    2. Adds to pending updates queue (for later delivery)         │
│    3. Checks for active SSE subscribers                          │
│    4. If subscribers exist: Calls each subscriber callback       │
│    5. If no subscribers: Queues for later delivery               │
│                                                                   │
│    Log: "📡 REALTIME: ✅ Notifying X active subscriber(s)"       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. SSE ENDPOINT                                                  │
│    File: src/app/api/webhooks/events/route.ts                    │
│    Route: GET /api/webhooks/events                               │
│                                                                   │
│    The subscriber callback (registered in step 5) sends:         │
│    - Formats message as SSE: "data: {...}\n\n"                   │
│    - Enqueues to ReadableStream                                  │
│    - Client receives via EventSource                             │
│                                                                   │
│    Log: "📡 SSE: Sending update to user X: jira:issue_updated"   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. CLIENT: WEBHOOK CONTEXT                                      │
│    File: src/contexts/WebhookContext.tsx                         │
│                                                                   │
│    EventSource.onmessage handler:                                │
│    1. Receives SSE message                                       │
│    2. Parses JSON data                                           │
│    3. Skips 'heartbeat' and 'connected' messages                 │
│    4. Creates WebhookEvent object                                │
│    5. Adds to events array (for notifications)                  │
│    6. Shows toast notification                                   │
│    7. Calls notifySubscribers()                                  │
│                                                                   │
│    Log: "📡 WebhookProvider: 📨 Received update event"           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. CLIENT: NOTIFY SUBSCRIBERS                                   │
│    File: src/contexts/WebhookContext.tsx                         │
│    Function: notifySubscribers()                                 │
│                                                                   │
│    Iterates through all registered subscribers:                  │
│    - Checks if integrationType matches                           │
│    - Calls subscriber callback with event                         │
│                                                                   │
│    Log: "📡 WebhookProvider: Notifying X subscriber(s)"           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. CLIENT: USE AUTO REFRESH HOOK                                 │
│    File: src/hooks/useAutoRefresh.ts                             │
│                                                                   │
│    Subscriber callback (registered in Project Details page):      │
│    1. Receives event                                             │
│    2. Checks projectId match (if specified)                      │
│    3. If match: Triggers debounced refresh                       │
│    4. If no match: Skips                                         │
│                                                                   │
│    Log: "🔄 useAutoRefresh: ✅ Triggering refresh for event"      │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. DEBOUNCED REFRESH (2 second delay)                          │
│     File: src/hooks/useAutoRefresh.ts                            │
│     Function: debouncedRefresh()                                  │
│                                                                   │
│     - Clears any pending refresh timeout                         │
│     - Schedules new refresh after 2000ms                         │
│                                                                   │
│     Log: "🔄 useAutoRefresh: Scheduling debounced refresh"        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼ (After 2 seconds)
┌─────────────────────────────────────────────────────────────────┐
│ 11. PERFORM REFRESH                                              │
│     File: src/hooks/useAutoRefresh.ts                            │
│     Function: performRefresh()                                   │
│                                                                   │
│     Calls: onRefreshRef.current()                                │
│     (This is handleWebhookRefresh from Project Details page)     │
│                                                                   │
│     Log: "🔄 useAutoRefresh: ========== PERFORMING REFRESH"       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 12. PROJECT DETAILS: HANDLE WEBHOOK REFRESH                      │
│     File: src/app/project/[projectId]/page.tsx                   │
│     Function: handleWebhookRefresh()                             │
│                                                                   │
│     Calls: fetchData()                                           │
│     - Detects project type (jira/trello/testrail)                │
│     - Calls appropriate API: getJiraProjectDetailsAction()       │
│     - Fetches fresh data from Jira API                           │
│     - Updates state: setIssues(), setProject(), etc.             │
│                                                                   │
│     Log: "📡 Project Details: ✅ Auto-refresh completed"          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 13. UI RE-RENDERS                                                │
│     React automatically re-renders when state changes            │
│                                                                   │
│     Charts update with new data:                                 │
│     - Status Distribution Pie Chart                               │
│     - Issue Types Bar Chart                                      │
│     - Assignee Workload Chart                                    │
│     - Timeline Chart                                             │
│     - Gantt Chart                                                │
│                                                                   │
│     User sees updated data in UI! ✅                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Polling Service (`jira-polling-service.ts`) - FALLBACK ONLY
- **Frequency**: Every 30 seconds (only when webhooks are not working)
- **What it does**: 
  - **First checks webhook status** before starting
  - Only starts if webhooks are not `ACTIVE` or have errors
  - Fetches last 50 issues from Jira API
  - Compares with cached state
  - Detects new/updated/deleted issues
- **Started**: Automatically when user opens Project Details page, but only if webhooks are unavailable
- **Stopped**: When user navigates away, closes browser, or when webhooks become active
- **Note**: This is a fallback mechanism. Webhooks should handle updates in normal operation.

### 2. Real-time Service (`realtime-service.ts`)
- **Purpose**: Manages in-memory event queue and SSE subscriptions
- **Features**:
  - Stores pending updates (up to 100 per user)
  - Manages active SSE connections
  - Broadcasts updates to subscribers
  - Expires old updates after 5 minutes

### 3. SSE Endpoint (`/api/webhooks/events`)
- **Protocol**: Server-Sent Events (SSE)
- **Connection**: Long-lived HTTP connection
- **Features**:
  - Sends pending updates on connect
  - Streams new updates in real-time
  - Sends heartbeat every 30 seconds
  - Auto-reconnects on disconnect

### 4. Webhook Context (`WebhookContext.tsx`)
- **Purpose**: Client-side SSE connection manager
- **Features**:
  - Establishes SSE connection on mount
  - Processes incoming events
  - Manages subscriber callbacks
  - Shows toast notifications
  - Auto-reconnects on connection loss

### 5. Auto Refresh Hook (`useAutoRefresh.ts`)
- **Purpose**: Automatically refreshes data when webhook events arrive
- **Features**:
  - Subscribes to specific integration types
  - Filters by projectId (optional)
  - Debounces refresh calls (2 seconds default)
  - Tracks refresh count and last refresh time

---

## Timing Breakdown

| Step | Component | Time | Notes |
|------|-----------|------|-------|
| 1 | User updates Jira | 0s | User action |
| 2 | Polling detects change | 0-30s | Next poll cycle |
| 3-5 | Broadcast to SSE | <1s | Server-side processing |
| 6 | SSE sends to client | <1s | Network latency |
| 7-9 | Client processes event | <100ms | Client-side processing |
| 10 | Debounce delay | 2s | Prevents rapid refreshes |
| 11-12 | Fetch fresh data | 1-3s | API call to Jira |
| 13 | UI updates | <100ms | React re-render |

**Total Time**: ~3-35 seconds (depending on polling cycle timing)

---

## Pending Updates Flow

If the SSE connection is not active when an update is broadcast:

1. Update is **queued** in `pendingUpdates` map
2. When SSE connection is established:
   - All pending updates are sent immediately
   - Client processes them in order
   - UI updates accordingly

**Maximum Queue Size**: 100 updates per user  
**Expiry Time**: 5 minutes

---

## Direct Webhook Flow (Future)

When Jira webhooks are fully registered and working:

1. Jira sends HTTP POST to `/api/webhooks/jira`
2. Server verifies signature
3. Processes webhook payload
4. Broadcasts update (same as step 4 above)
5. Continues with steps 5-13

**Advantage**: Instant detection (no 30-second delay)

---

## Troubleshooting

### Issue: Updates not appearing in UI

**Check Server Logs:**
1. Is polling running? Look for "🔄 JIRA POLLING: Polling SCRUM for changes..."
2. Is change detected? Look for "🔄 JIRA POLLING: ✅ ISSUE UPDATED DETECTED"
3. Are subscribers active? Look for "📡 REALTIME: ✅ Notifying X active subscriber(s)"

**Check Browser Console:**
1. Is SSE connected? Look for "📡 WebhookProvider: ✅ SSE Connected successfully"
2. Is event received? Look for "📡 WebhookProvider: 📨 Received update event"
3. Is refresh triggered? Look for "🔄 useAutoRefresh: ✅ Triggering refresh"
4. Is data fetched? Look for "📡 Project Details: ✅ Auto-refresh completed"

### Common Issues:

1. **SSE Connection Dropped**
   - Symptom: "⚠️ REALTIME: No active subscribers"
   - Solution: Connection auto-reconnects, pending updates will be delivered

2. **Project ID Mismatch**
   - Symptom: "🔄 useAutoRefresh: ❌ Skipping - different project"
   - Solution: Check that `event.projectId` matches subscribed `projectId`

3. **Debounce Delay**
   - Symptom: Updates appear 2 seconds after notification
   - Solution: This is intentional to prevent rapid refreshes

---

## Files Involved

### Server-Side:
- `src/lib/services/jira-polling-service.ts` - Polling logic
- `src/lib/services/realtime-service.ts` - Event broadcasting
- `src/app/api/webhooks/events/route.ts` - SSE endpoint
- `src/app/api/webhooks/jira/route.ts` - Direct webhook endpoint (future)

### Client-Side:
- `src/contexts/WebhookContext.tsx` - SSE connection manager
- `src/hooks/useAutoRefresh.ts` - Auto-refresh hook
- `src/app/project/[projectId]/page.tsx` - Project Details page
- `src/components/webhooks/NotificationBell.tsx` - Notification UI

---

## Summary

The webhook flow ensures that:
1. ✅ Changes in Jira are detected (via polling every 30 seconds)
2. ✅ Updates are broadcast to all connected clients
3. ✅ Clients receive updates via SSE
4. ✅ UI automatically refreshes with new data
5. ✅ Users see updates within 3-35 seconds

The system is designed to be resilient:
- Pending updates are queued if connection is down
- Auto-reconnection handles network issues
- Debouncing prevents excessive API calls
- Polling ensures updates are never missed

