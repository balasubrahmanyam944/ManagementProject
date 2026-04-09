# Client-Side Webhook Flow Test Guide

Since server-side tests pass, the issue is likely in the client-side flow. Use this guide to test the client-side components.

## Manual Testing Steps

### 1. Test SSE Connection
Open browser console and check:

```javascript
// Check if WebhookContext is connected
// Look for these logs:
📡 WebhookProvider: Mounting, connecting to SSE...
📡 WebhookProvider: ✅ SSE Connected successfully
📡 WebhookProvider: Received SSE message: {"type":"connected"...}
```

**Expected**: Connection established within 1-2 seconds

### 2. Test Event Reception
When a Jira update happens, check browser console for:

```javascript
📡 WebhookProvider: 📨 Received update event: { type: 'project_update', ... }
📡 WebhookProvider: Notifying X subscriber(s) for event
```

**Expected**: Events are received and subscribers are notified

### 3. Test useAutoRefresh Hook
Check if the hook receives events:

```javascript
🔄 useAutoRefresh: ========== EVENT RECEIVED ==========
🔄 useAutoRefresh: Event details: { ... }
🔄 useAutoRefresh: ✅ Project matches, triggering refresh
🔄 useAutoRefresh: Scheduling debounced refresh in 2000ms
```

**Expected**: Hook receives events and schedules refresh

### 4. Test Refresh Callback
Check if the refresh callback is executed:

```javascript
🔄 useAutoRefresh: Debounce timeout expired, executing refresh
🔄 useAutoRefresh: ========== PERFORMING REFRESH ==========
🔄 useAutoRefresh: onRefresh callback exists, calling...
📡 Project Details: ========== AUTO-REFRESH TRIGGERED ==========
📡 Project Details: ✅ Auto-refresh completed successfully
```

**Expected**: Refresh callback is called and data is fetched

## Common Issues to Check

### Issue 1: SSE Connection Drops
**Symptom**: Connection established but then drops
**Check**: Look for `📡 WebhookProvider: Connection closed, will reconnect`
**Solution**: Check network stability, server logs for connection errors

### Issue 2: Events Not Received
**Symptom**: Server broadcasts but client doesn't receive
**Check**: 
- Is SSE connection active? (Check for heartbeat messages)
- Are there any errors in browser console?
- Check server logs for "No active subscribers"

### Issue 3: Project ID Mismatch
**Symptom**: Events received but refresh not triggered
**Check**: 
- Look for `🔄 useAutoRefresh: ❌ Skipping - different project`
- Compare `eventProjectId` vs `subscribedProjectId` in logs
- Ensure projectId format matches (e.g., "SCRUM" not "scrum")

### Issue 4: Refresh Callback Not Executed
**Symptom**: Refresh scheduled but never executed
**Check**:
- Look for `🔄 useAutoRefresh: Debounce timeout expired`
- Check if `performRefresh` is called
- Verify `onRefreshRef.current` is not null

## Debugging Commands

### Check Webhook Status
```javascript
// In browser console
fetch('/api/webhooks/status').then(r => r.json()).then(console.log)
```

### Check SSE Connection
```javascript
// In browser console - check if EventSource exists
// Look for EventSource in Network tab (should see /api/webhooks/events)
```

### Manually Trigger Refresh
```javascript
// In browser console on Project Details page
// The useAutoRefresh hook exposes triggerRefresh (if available)
```

## Expected Complete Flow

When everything works, you should see this sequence:

1. **SSE Connection**:
   ```
   📡 WebhookProvider: ✅ SSE Connected successfully
   ```

2. **Event Received**:
   ```
   📡 WebhookProvider: 📨 Received update event
   📡 WebhookProvider: Notifying 1 subscriber(s)
   ```

3. **Auto Refresh Triggered**:
   ```
   🔄 useAutoRefresh: ✅ Triggering refresh for event
   🔄 useAutoRefresh: Scheduling debounced refresh in 2000ms
   ```

4. **Refresh Executed**:
   ```
   🔄 useAutoRefresh: Debounce timeout expired, executing refresh
   📡 Project Details: ✅ Auto-refresh completed successfully
   ```

5. **UI Updates**:
   - Charts refresh with new data
   - Notification appears
   - Status counts update

## If Tests Still Fail

1. **Check Browser Console**: Look for errors or warnings
2. **Check Network Tab**: Verify SSE connection is active
3. **Check Server Logs**: Verify events are being broadcast
4. **Compare Project IDs**: Ensure they match exactly
5. **Check Timing**: Debounce delay is 2 seconds - wait for it

