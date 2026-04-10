/**
 * Integrations Index
 * 
 * Central export for all integration services.
 * Use Nango-based services for new code.
 */

// ============================================
// NANGO-BASED SERVICES (Recommended)
// ============================================

// Core Nango service for token management
export { 
  nangoService, 
  NangoError,
  type NangoProvider,
  type NangoConnection,
  type NangoConnectionStatus,
} from './nango-service';

// Jira service with Nango
export { 
  jiraNangoService,
  JiraNangoService,
  type JiraProject,
  type JiraBoard,
  type JiraSprint,
  type JiraIssue,
  type JiraTransition,
} from './jira-nango-service';

// Trello service with Nango
export { 
  trelloNangoService,
  TrelloNangoService,
  type TrelloBoard,
  type TrelloList,
  type TrelloCard,
  type TrelloMember,
} from './trello-nango-service';

// Slack service with Nango
export { 
  slackNangoService,
  SlackNangoService,
  type SlackChannel,
  type SlackMessage,
  type SlackUser,
  type SlackMentions,
  type SlackTeam,
} from './slack-nango-service';

// ============================================
// LEGACY SERVICES (For backward compatibility)
// ============================================

// Original Jira service (uses custom OAuth)
export { JiraService, jiraService } from './jira-service';

// Original Trello service (uses custom OAuth)
export { TrelloService, trelloService } from './trello-service';

// Original Slack service (uses custom OAuth)
export { slackService } from './slack-service';

// TestRail service (uses API key auth)
export { TestRailService, testrailService } from './testrail-service';

// ============================================
// CONFIGURATION
// ============================================

export { 
  getIntegrationConfig,
  defaultIntegrationConfig,
  type IntegrationConfig,
} from './integration-config';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if Nango is configured and should be used
 */
export function isNangoEnabled(): boolean {
  return !!process.env.NANGO_SECRET_KEY;
}

/**
 * Get the appropriate service based on configuration
 */
export function getJiraService() {
  if (isNangoEnabled()) {
    return jiraNangoService;
  }
  return jiraService;
}

export function getTrelloService() {
  if (isNangoEnabled()) {
    return trelloNangoService;
  }
  return trelloService;
}

export function getSlackService() {
  if (isNangoEnabled()) {
    return slackNangoService;
  }
  return slackService;
}

