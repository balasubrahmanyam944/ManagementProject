# Webhook Debugging Guide

## Step 1: Check Current Webhook Status

Open browser console and run:

```javascript
// Check webhook status
fetch('/gmail/api/webhooks/status')
  .then(r => r.json())
  .then(data => {
    console.log('📊 Webhook Status:', data);
    console.log('\n✅ SSE Connected:', data.sse.connected);
    console.log('📡 Subscribers:', data.sse.subscriberCount);
    console.log('\n🔗 Jira Webhooks:');
    console.log('  Registered:', data.jira.registered);
    console.log('  Status:', data.jira.status);
    console.log('  Count:', data.jira.webhookCount);
    console.log('  Last Triggered:', data.jira.lastTriggered);
    console.log('  Recent Events:', data.recentEvents.length);
    
    if (data.recentEvents.length > 0) {
      console.log('\n📥 Recent Webhook Events:');
      data.recentEvents.forEach((e, i) => {
        console.log(`  ${i+1}. ${e.integrationType} - ${e.eventType} - ${e.projectId} - ${new Date(e.createdAt).toLocaleString()}`);
      });
    }
  });
```

## Step 2: Register Webhooks (if not registered)

If `jira.registered` is `false`, run:

```javascript
// Register Jira webhooks
fetch('/gmail/api/webhooks/manage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ integration: 'jira' })
})
  .then(r => r.json())
  .then(data => {
    console.log('🔗 Webhook Registration Result:', data);
    if (data.success) {
      console.log('✅ Webhooks registered successfully!');
      console.log('📋 Jira:', data.results.jira);
    } else {
      console.error('❌ Failed to register webhooks:', data);
    }
  });
```

## Step 3: Test Webhook Reception

After registering, make a change in Jira and check server logs for:

```
📥 JIRA WEBHOOK ENDPOINT: ========== WEBHOOK RECEIVED ==========
```

## Step 4: Manual Test (Simulate Webhook)

To test if SSE is working correctly:

```javascript
// Simulate a webhook event
fetch('/gmail/api/webhooks/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    integrationType: 'JIRA', 
    projectId: 'SCRUM' 
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('🧪 Test Result:', data);
    console.log('✅ If you see a notification and page refresh, SSE is working!');
  });
```

## Common Issues

### Issue 1: Webhooks Not Registered
**Solution:** Run Step 2 above to register webhooks

### Issue 2: Webhook URL Not Accessible
**Problem:** Jira can't reach your server at `http://172.16.34.21:9005`
**Solution:** 
- Use a public URL (ngrok, cloudflare tunnel, etc.)
- Or configure Jira to use your public IP/domain

### Issue 3: HTTPS Required
**Problem:** Jira Cloud requires HTTPS for webhooks
**Solution:** Use HTTPS URL or configure reverse proxy with SSL

### Issue 4: Webhooks Registered But Not Receiving Events
**Check:**
1. Verify webhook URL in Jira: Project Settings → Webhooks
2. Check if webhook is active/enabled
3. Verify webhook events are subscribed (issue_created, issue_updated, etc.)

## Expected Flow

1. **Change issue in Jira** → Jira sends webhook to your server
2. **Server receives webhook** → Logs: `📥 JIRA WEBHOOK ENDPOINT: WEBHOOK RECEIVED`
3. **Server processes webhook** → Logs: `📥 JIRA WEBHOOK: Processing event`
4. **Server broadcasts to SSE** → Logs: `📡 JIRA WEBHOOK: Broadcasting update`
5. **Browser receives SSE message** → Logs: `📡 WebhookProvider: Received SSE message`
6. **Page auto-refreshes** → Logs: `🔄 useAutoRefresh: Triggering refresh`

