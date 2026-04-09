# Webhook Flow Tests

This directory contains integration tests for the webhook flow system.

## Running Tests

### Option 1: Using npx tsx (Recommended)
```bash
npx tsx src/__tests__/webhook-flow.test.ts
```

### Option 2: Using npm script
```bash
npm run test:webhooks
```

### Option 3: Using genkit (if tsx is not available)
```bash
genkit start -- tsx src/__tests__/webhook-flow.test.ts
```

## Test Coverage

The test suite covers:

1. **Real-time Service - Broadcast Update**
   - Verifies that updates are broadcast to subscribers
   - Checks that subscribers receive the correct message

2. **Real-time Service - Pending Updates Queue**
   - Verifies that updates are queued when no subscribers exist
   - Checks that queued updates can be retrieved

3. **Real-time Service - Multiple Subscribers**
   - Verifies that all subscribers receive updates
   - Tests concurrent subscriber notifications

4. **Real-time Service - Pending Updates Delivery**
   - Verifies that pending updates are available for new subscribers
   - Tests the queue persistence

5. **Webhook Message Format**
   - Verifies that webhook messages have all required fields
   - Validates message structure

6. **Subscriber Count Tracking**
   - Verifies subscriber count is tracked correctly
   - Tests subscribe/unsubscribe operations

7. **Event Type Filtering**
   - Verifies different event types are handled correctly
   - Tests multiple event types in sequence

8. **Multiple Users Isolation**
   - Verifies that updates are isolated per user
   - Tests that users only receive their own updates

## Expected Output

When tests pass, you should see:
```
🧪 Starting Webhook Flow Tests...

================================================================================

📋 Test: Real-time Service should broadcast update to subscribers
   ✅ PASSED

📋 Test: Real-time Service should queue updates when no subscribers
   ✅ PASSED

...

================================================================================

📊 Test Results:
   ✅ Passed: 8
   ❌ Failed: 0
   📈 Total:  8

================================================================================
```

## Troubleshooting

### Test fails with "Cannot find module"
- Make sure you're running from the project root
- Install dependencies: `npm install`

### Tests pass but notifications still don't work
- Check browser console for client-side errors
- Verify SSE connection is established
- Check server logs for webhook processing errors

### Subscriber not receiving messages
- Verify the subscriber is registered before broadcasting
- Check that userId matches between broadcast and subscription
- Ensure the callback function is not throwing errors

## Adding New Tests

To add a new test:

```typescript
test(
  'Test description',
  async () => {
    // Test implementation
    // Use clearLogs() to reset log capture
    // Use findLog(pattern) to check for expected logs
  },
  ['Expected log pattern 1', /Expected log pattern 2/], // Optional
  ['Expected error pattern'], // Optional
)
```

## Integration with CI/CD

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Webhook Tests
  run: npm run test:webhooks
```

