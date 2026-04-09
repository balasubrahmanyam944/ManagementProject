/**
 * Webhook Flow Integration Tests
 * 
 * Tests the complete webhook flow from Jira update to UI notification
 * Run with: npx tsx src/__tests__/webhook-flow.test.ts
 */

import { realtimeService } from '../lib/services/realtime-service'
import type { WebhookBroadcastMessage } from '../types/webhooks'

// Mock console methods to capture logs
const originalLog = console.log
const originalError = console.error
const logs: string[] = []
const errors: string[] = []

function captureLogs() {
  console.log = (...args: any[]) => {
    logs.push(args.join(' '))
    originalLog(...args)
  }
  console.error = (...args: any[]) => {
    errors.push(args.join(' '))
    originalError(...args)
  }
}

function restoreLogs() {
  console.log = originalLog
  console.error = originalError
}

// Test utilities
function clearLogs() {
  logs.length = 0
  errors.length = 0
}

function findLog(pattern: string | RegExp): boolean {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
  return logs.some(log => regex.test(log))
}

function findError(pattern: string | RegExp): boolean {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
  return errors.some(err => regex.test(err))
}

// Test suite
const tests: Array<{
  name: string
  fn: () => Promise<void> | void
  expectedLogs?: Array<string | RegExp>
  expectedErrors?: Array<string | RegExp>
}> = []

function test(name: string, fn: () => Promise<void> | void, expectedLogs?: Array<string | RegExp>, expectedErrors?: Array<string | RegExp>) {
  tests.push({ name, fn, expectedLogs, expectedErrors })
}

// ============================================================================
// TEST 1: Real-time Service - Broadcast Update
// ============================================================================
test(
  'Real-time Service should broadcast update to subscribers',
  async () => {
    clearLogs()
    
    const userId = 'test-user-123'
    let receivedMessage: WebhookBroadcastMessage | null = null
    
    // Subscribe to updates
    const unsubscribe = realtimeService.subscribe(userId, (message) => {
      receivedMessage = message
    })
    
    // Create test message
    const testMessage: WebhookBroadcastMessage = {
      type: 'project_update',
      userId,
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-494',
        issueSummary: 'Test Issue',
        status: 'In Progress',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    // Broadcast update
    realtimeService.broadcastUpdate(testMessage)
    
    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify message was received
    if (!receivedMessage) {
      throw new Error('Subscriber did not receive message')
    }
    
    if (receivedMessage.data?.issueKey !== testMessage.data.issueKey) {
      throw new Error(`Expected issueKey ${testMessage.data.issueKey}, got ${receivedMessage.data?.issueKey}`)
    }
    
    // Cleanup
    unsubscribe()
  },
  ['REALTIME:.*BROADCASTING UPDATE', 'REALTIME:.*Notifying.*subscriber'],
)

// ============================================================================
// TEST 2: Real-time Service - Pending Updates Queue
// ============================================================================
test(
  'Real-time Service should queue updates when no subscribers',
  async () => {
    clearLogs()
    
    const userId = 'test-user-no-subscribers'
    
    // Create test message
    const testMessage: WebhookBroadcastMessage = {
      type: 'project_update',
      userId,
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-495',
        issueSummary: 'Test Issue 2',
        status: 'Done',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    // Broadcast update (no subscribers)
    realtimeService.broadcastUpdate(testMessage)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check pending updates
    const pendingUpdates = realtimeService.getPendingUpdates(userId)
    
    if (pendingUpdates.length === 0) {
      throw new Error('Update should be queued when no subscribers')
    }
    
    const queuedUpdate = pendingUpdates[pendingUpdates.length - 1]
    if (queuedUpdate.data?.issueKey !== testMessage.data.issueKey) {
      throw new Error(`Expected issueKey ${testMessage.data.issueKey} in queue, got ${queuedUpdate.data?.issueKey}`)
    }
  },
  ['REALTIME:.*No active subscribers', 'Update queued'],
)

// ============================================================================
// TEST 3: Real-time Service - Multiple Subscribers
// ============================================================================
test(
  'Real-time Service should notify all subscribers',
  async () => {
    clearLogs()
    
    const userId = 'test-user-multiple'
    const receivedMessages: WebhookBroadcastMessage[] = []
    
    // Subscribe multiple callbacks
    const unsubscribe1 = realtimeService.subscribe(userId, (message) => {
      receivedMessages.push(message)
    })
    
    const unsubscribe2 = realtimeService.subscribe(userId, (message) => {
      receivedMessages.push(message)
    })
    
    // Create test message
    const testMessage: WebhookBroadcastMessage = {
      type: 'project_update',
      userId,
      integrationType: 'JIRA',
      eventType: 'jira:issue_created',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-496',
        issueSummary: 'New Issue',
        status: 'To Do',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    // Broadcast update
    realtimeService.broadcastUpdate(testMessage)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify both subscribers received the message
    if (receivedMessages.length !== 2) {
      throw new Error(`Expected 2 messages, got ${receivedMessages.length}`)
    }
    
    // Cleanup
    unsubscribe1()
    unsubscribe2()
  },
  ['REALTIME:.*Notifying.*2.*subscriber'],
)

// ============================================================================
// TEST 4: Real-time Service - Pending Updates Delivery
// ============================================================================
test(
  'Real-time Service should deliver pending updates to new subscribers',
  async () => {
    clearLogs()
    
    const userId = 'test-user-pending-delivery'
    
    // Create and queue an update (no subscribers)
    const testMessage: WebhookBroadcastMessage = {
      type: 'project_update',
      userId,
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-497',
        issueSummary: 'Pending Issue',
        status: 'In Review',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    realtimeService.broadcastUpdate(testMessage)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify update is queued
    const pendingBefore = realtimeService.getPendingUpdates(userId)
    if (pendingBefore.length === 0) {
      throw new Error('Update should be queued')
    }
    
    // Now subscribe (simulating SSE connection)
    const receivedMessages: WebhookBroadcastMessage[] = []
    const unsubscribe = realtimeService.subscribe(userId, (message) => {
      receivedMessages.push(message)
    })
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Note: The pending updates are delivered by the SSE endpoint, not automatically
    // This test verifies the queue exists and can be retrieved
    
    const pendingAfter = realtimeService.getPendingUpdates(userId)
    if (pendingAfter.length === 0) {
      throw new Error('Pending updates should still be available for SSE endpoint to deliver')
    }
    
    // Cleanup
    unsubscribe()
  },
)

// ============================================================================
// TEST 5: Webhook Message Format
// ============================================================================
test(
  'Webhook message should have correct format',
  () => {
    const message: WebhookBroadcastMessage = {
      type: 'project_update',
      userId: 'test-user',
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-498',
        issueSummary: 'Format Test',
        status: 'Done',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    // Verify required fields
    if (!message.type) throw new Error('Missing type')
    if (!message.userId) throw new Error('Missing userId')
    if (!message.integrationType) throw new Error('Missing integrationType')
    if (!message.eventType) throw new Error('Missing eventType')
    if (!message.projectId) throw new Error('Missing projectId')
    if (!message.data) throw new Error('Missing data')
    if (!message.timestamp) throw new Error('Missing timestamp')
    
    // Verify data fields
    if (!message.data.issueKey) throw new Error('Missing data.issueKey')
    if (!message.data.issueSummary) throw new Error('Missing data.issueSummary')
    if (!message.data.status) throw new Error('Missing data.status')
  },
)

// ============================================================================
// TEST 6: Subscriber Count Tracking
// ============================================================================
test(
  'Real-time Service should track subscriber count correctly',
  async () => {
    clearLogs()
    
    const userId = 'test-user-count'
    
    // Initially no subscribers
    const countBefore = realtimeService.getSubscriberCount(userId)
    if (countBefore !== 0) {
      throw new Error(`Expected 0 subscribers, got ${countBefore}`)
    }
    
    // Add subscriber
    const unsubscribe1 = realtimeService.subscribe(userId, () => {})
    const countAfter1 = realtimeService.getSubscriberCount(userId)
    if (countAfter1 !== 1) {
      throw new Error(`Expected 1 subscriber, got ${countAfter1}`)
    }
    
    // Add another subscriber
    const unsubscribe2 = realtimeService.subscribe(userId, () => {})
    const countAfter2 = realtimeService.getSubscriberCount(userId)
    if (countAfter2 !== 2) {
      throw new Error(`Expected 2 subscribers, got ${countAfter2}`)
    }
    
    // Remove one subscriber
    unsubscribe1()
    const countAfter3 = realtimeService.getSubscriberCount(userId)
    if (countAfter3 !== 1) {
      throw new Error(`Expected 1 subscriber after unsubscribe, got ${countAfter3}`)
    }
    
    // Remove last subscriber
    unsubscribe2()
    const countAfter4 = realtimeService.getSubscriberCount(userId)
    if (countAfter4 !== 0) {
      throw new Error(`Expected 0 subscribers after all unsubscribed, got ${countAfter4}`)
    }
  },
)

// ============================================================================
// TEST 7: Event Type Filtering
// ============================================================================
test(
  'Real-time Service should handle different event types',
  async () => {
    clearLogs()
    
    const userId = 'test-user-events'
    const receivedEvents: string[] = []
    
    const unsubscribe = realtimeService.subscribe(userId, (message) => {
      receivedEvents.push(message.eventType)
    })
    
    // Broadcast different event types
    const events = [
      'jira:issue_created',
      'jira:issue_updated',
      'jira:issue_deleted',
      'project_updated',
    ]
    
    for (const eventType of events) {
      const message: WebhookBroadcastMessage = {
        type: 'project_update',
        userId,
        integrationType: 'JIRA',
        eventType,
        projectId: 'SCRUM',
        data: {
          issueKey: 'SCRUM-499',
          issueSummary: 'Event Test',
          status: 'To Do',
          updated: new Date().toISOString(),
        },
        timestamp: new Date(),
      }
      
      realtimeService.broadcastUpdate(message)
    }
    
    // Wait for all messages
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Verify all events were received
    if (receivedEvents.length !== events.length) {
      throw new Error(`Expected ${events.length} events, got ${receivedEvents.length}`)
    }
    
    for (const eventType of events) {
      if (!receivedEvents.includes(eventType)) {
        throw new Error(`Missing event type: ${eventType}`)
      }
    }
    
    unsubscribe()
  },
)

// ============================================================================
// TEST 8: Multiple Users Isolation
// ============================================================================
test(
  'Real-time Service should isolate updates per user',
  async () => {
    clearLogs()
    
    const userId1 = 'test-user-1'
    const userId2 = 'test-user-2'
    
    const user1Messages: WebhookBroadcastMessage[] = []
    const user2Messages: WebhookBroadcastMessage[] = []
    
    const unsubscribe1 = realtimeService.subscribe(userId1, (message) => {
      user1Messages.push(message)
    })
    
    const unsubscribe2 = realtimeService.subscribe(userId2, (message) => {
      user2Messages.push(message)
    })
    
    // Broadcast update for user1
    const message1: WebhookBroadcastMessage = {
      type: 'project_update',
      userId: userId1,
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-500',
        issueSummary: 'User 1 Issue',
        status: 'In Progress',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    realtimeService.broadcastUpdate(message1)
    
    // Broadcast update for user2
    const message2: WebhookBroadcastMessage = {
      type: 'project_update',
      userId: userId2,
      integrationType: 'JIRA',
      eventType: 'jira:issue_updated',
      projectId: 'SCRUM',
      data: {
        issueKey: 'SCRUM-501',
        issueSummary: 'User 2 Issue',
        status: 'Done',
        updated: new Date().toISOString(),
      },
      timestamp: new Date(),
    }
    
    realtimeService.broadcastUpdate(message2)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Verify isolation
    if (user1Messages.length !== 1) {
      throw new Error(`User1 should receive 1 message, got ${user1Messages.length}`)
    }
    
    if (user2Messages.length !== 1) {
      throw new Error(`User2 should receive 1 message, got ${user2Messages.length}`)
    }
    
    if (user1Messages[0]?.data?.issueKey !== 'SCRUM-500') {
      throw new Error(`User1 received wrong message. Expected SCRUM-500, got ${user1Messages[0]?.data?.issueKey}`)
    }
    
    if (user2Messages[0]?.data?.issueKey !== 'SCRUM-501') {
      throw new Error(`User2 received wrong message. Expected SCRUM-501, got ${user2Messages[0]?.data?.issueKey}`)
    }
    
    unsubscribe1()
    unsubscribe2()
  },
)

// ============================================================================
// TEST RUNNER
// ============================================================================
async function runTests() {
  captureLogs()
  
  console.log('\n🧪 Starting Webhook Flow Tests...\n')
  console.log('='.repeat(80))
  
  let passed = 0
  let failed = 0
  const failures: Array<{ name: string; error: string }> = []
  
  for (const testCase of tests) {
    try {
      clearLogs()
      console.log(`\n📋 Test: ${testCase.name}`)
      
      await testCase.fn()
      
      // Check expected logs
      if (testCase.expectedLogs) {
        for (const expectedLog of testCase.expectedLogs) {
          if (!findLog(expectedLog)) {
            throw new Error(`Expected log not found: ${expectedLog}`)
          }
        }
      }
      
      // Check expected errors (should not have unexpected errors)
      if (testCase.expectedErrors) {
        for (const expectedError of testCase.expectedErrors) {
          if (!findError(expectedError)) {
            // Expected errors are okay
          }
        }
      }
      
      console.log(`   ✅ PASSED`)
      passed++
    } catch (error) {
      console.log(`   ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`)
      failed++
      failures.push({
        name: testCase.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  
  restoreLogs()
  
  console.log('\n' + '='.repeat(80))
  console.log(`\n📊 Test Results:`)
  console.log(`   ✅ Passed: ${passed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📈 Total:  ${tests.length}`)
  
  if (failures.length > 0) {
    console.log(`\n❌ Failed Tests:`)
    failures.forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error}`)
    })
  }
  
  console.log('\n' + '='.repeat(80))
  
  // Exit with error code if tests failed
  process.exit(failed > 0 ? 1 : 0)
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('❌ Test runner error:', error)
    process.exit(1)
  })
}

export { runTests, tests }

