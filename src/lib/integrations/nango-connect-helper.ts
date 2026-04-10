/**
 * Nango Connection Helper
 * 
 * Helper functions to initiate Nango OAuth flows from anywhere in the app.
 * Replaces old OAuth route calls (/api/auth/jira/start, etc.)
 */

import Nango from '@nangohq/frontend';
import { getNangoServerUrl, validateNangoConfig } from './nango-config';

function getBasePath(): string {
  if (typeof window !== 'undefined') {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return `/${pathParts[0]}`;
    }
  }

  return process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
}

/**
 * Fetch a short-lived Connect Session token from backend
 */
async function fetchConnectSessionToken(
  provider: 'jira' | 'trello' | 'slack',
  tenantId: string,
  userId: string
): Promise<string> {
  const basePath = getBasePath();
  const response = await fetch(`${basePath}/api/nango/connect-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider, tenantId, userId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error || 'Failed to create Nango connect session');
  }

  const data = await response.json();
  if (!data?.connectSessionToken) {
    throw new Error('Nango connect session token was not returned');
  }

  return data.connectSessionToken;
}

/**
 * Generate tenant-scoped connection ID
 */
function getConnectionId(tenantId: string, userId: string): string {
  const sanitizedTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${sanitizedTenant}_${sanitizedUser}`;
}

/**
 * Monitor for OAuth popup windows and detect when they are closed
 * This is needed because Nango's auth() promise never rejects when popup is manually closed
 */
function createPopupMonitor(): { 
  start: () => void; 
  stop: () => void; 
  onClose: Promise<void>;
} {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let resolveClose: (() => void) | null = null;
  
  const onClose = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });
  
  const start = () => {
    console.log('🔍 Popup Monitor: Starting to watch for OAuth popups...');
    
    // Monitor all open windows - check for popup closure
    let popupDetected = false;
    let checkCount = 0;
    
    intervalId = setInterval(() => {
      checkCount++;
      
      // Look for Nango OAuth popup windows
      // Nango opens popups with specific characteristics
      const openPopups: Window[] = [];
      
      // Try to find the popup by checking window.opener relationships
      // This is tricky because we can't directly access the popup reference
      // Instead, we'll use a different approach: monitor the document for focus changes
      
      // After 2 seconds, assume popup has opened (if flow started)
      if (checkCount >= 4 && !popupDetected) {
        popupDetected = true;
        console.log('🔍 Popup Monitor: Assuming OAuth popup is open');
      }
      
      // After popup is detected, monitor for when window regains focus without auth completing
      // This happens when user closes the popup manually
      if (popupDetected && document.hasFocus()) {
        // Window has focus - check if this is because popup was closed
        // Wait a bit to see if auth completes
        setTimeout(() => {
          // If we're still monitoring (auth didn't complete), popup was likely closed
          if (intervalId !== null) {
            console.log('🔍 Popup Monitor: Window regained focus, checking if popup was closed...');
          }
        }, 500);
      }
      
      // Safety timeout - after 5 minutes, stop monitoring
      if (checkCount > 600) {
        console.log('🔍 Popup Monitor: Timeout reached, stopping monitor');
        stop();
      }
    }, 500);
  };
  
  const stop = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      console.log('🔍 Popup Monitor: Stopped');
    }
  };
  
  return { start, stop, onClose };
}

/**
 * Connect to an integration via Nango with popup close detection
 * 
 * @param provider - Integration provider (jira, trello, slack)
 * @param tenantId - Tenant ID (from context or default)
 * @param userId - User ID (from session)
 * @returns Promise that resolves when connection is complete
 */
export async function connectIntegrationViaNango(
  provider: 'jira' | 'trello' | 'slack',
  tenantId: string,
  userId: string
): Promise<void> {
  const validation = validateNangoConfig();
  if (validation.warnings.length > 0) {
    console.warn('⚠️ Nango Configuration Warnings:');
    validation.warnings.forEach((warn) => console.warn('  -', warn));
  }

  if (!validation.valid) {
    console.error('❌ Nango Configuration Errors:');
    validation.errors.forEach((err) => console.error('  -', err));
    throw new Error('Nango is not configured correctly. Please check Nango server configuration.');
  }
  
  const connectionId = getConnectionId(tenantId, userId);
  const serverUrl = getNangoServerUrl();
  const connectSessionToken = await fetchConnectSessionToken(provider, tenantId, userId);

  const nango = new Nango({
    connectSessionToken,
    host: serverUrl.replace(/\/$/, ''),
  });
  
  console.log(`🔄 Nango: Connecting ${provider} for ${connectionId}`);
  console.log(`🔧 Nango: Using server URL:`, serverUrl);
  console.log('🔧 Nango: Using connect session token');
  
  // Intercept window.open to capture the popup reference
  const originalWindowOpen = window.open;
  let popupWindow: Window | null = null;
  let popupCheckInterval: ReturnType<typeof setInterval> | null = null;
  
  // Override window.open to capture the popup
  window.open = function(...args) {
    const result = originalWindowOpen.apply(this, args);
    if (result) {
      popupWindow = result;
      console.log('🔍 Popup Monitor: Captured OAuth popup window');
    }
    return result;
  };
  
  // Create a promise that rejects when popup is closed
  const popupClosedPromise = new Promise<never>((_, reject) => {
    // Start checking for popup closure after a short delay
    setTimeout(() => {
      popupCheckInterval = setInterval(() => {
        if (popupWindow && popupWindow.closed) {
          console.log('🔍 Popup Monitor: Detected popup was closed by user');
          clearInterval(popupCheckInterval!);
          popupCheckInterval = null;
          reject(new Error('POPUP_CLOSED'));
        }
      }, 300); // Check every 300ms
    }, 1000); // Wait 1 second before starting to check (popup needs time to open)
  });
  
  try {
    console.log(`🚀 Nango: Opening OAuth popup for ${provider}...`);
    console.log(`⚠️ Nango: Note - WebSocket errors are expected with ngrok free tier and won't affect OAuth flow`);
    
    // For Jira specifically, add extra logging and validation
    if (provider === 'jira') {
      console.log(`🔍 Nango Jira: Provider: ${provider}, Connection ID: ${connectionId}`);
      console.log(`🔍 Nango Jira: Server URL: ${serverUrl}`);
      console.log(`🔍 Nango Jira: Connect session token present: ${!!connectSessionToken}`);
      console.log(`🔍 Nango Jira: Nango instance created: ${!!nango}`);
      
      // Verify Nango instance has auth method
      if (!nango || typeof nango.auth !== 'function') {
        window.open = originalWindowOpen; // Restore before throwing
        throw new Error('Nango instance is not properly initialized. Please check Nango configuration.');
      }
    }
    
    const authPromise = nango.auth(provider, connectionId);
    console.log(`⏳ Nango: Waiting for OAuth popup to complete...`);
    
    // For Jira, add a timeout to detect if popup never opens
    let jiraTimeout: ReturnType<typeof setTimeout> | null = null;
    if (provider === 'jira') {
      jiraTimeout = setTimeout(() => {
        if (!popupWindow || (popupWindow && popupWindow.closed)) {
          console.error('❌ Nango Jira: Popup did not open within 3 seconds');
          console.error('❌ Nango Jira: Possible causes:');
          console.error('   1. Popup blocker is enabled');
          console.error('   2. Jira provider not configured in Nango dashboard');
          console.error('   3. Nango server is not accessible');
          console.error('   4. Browser security settings blocking popup');
        }
      }, 3000);
    }
    
    // Race between auth completing and popup being closed
    try {
      await Promise.race([authPromise, popupClosedPromise]);
      
      // Clear timeout if we got here
      if (jiraTimeout) {
        clearTimeout(jiraTimeout);
      }
      
      console.log(`✅ Nango: Successfully connected ${provider}`);
    } catch (raceError: any) {
      // Clear timeout on error
      if (jiraTimeout) {
        clearTimeout(jiraTimeout);
      }
      
      // Check if popup was never opened (for Jira specifically)
      if (provider === 'jira' && !popupWindow) {
        console.error('❌ Nango Jira: Popup window was never created');
        console.error('❌ Nango Jira: This suggests Nango.auth() failed to open popup');
        throw new Error('Failed to open OAuth popup. Please check: 1) Popup blocker settings, 2) Jira configuration in Nango dashboard, 3) Browser console for errors');
      }
      
      throw raceError;
    }
  } catch (error: any) {
    console.error(`❌ Nango: Failed to connect ${provider}:`, error);
    console.error(`❌ Nango: Error details:`, {
      message: error?.message,
      name: error?.name,
      type: error?.type,
      code: error?.code,
    });
    
    // Check if it's our popup closed error
    if (error?.message === 'POPUP_CLOSED') {
      console.log(`ℹ️ Nango: User closed the popup without completing OAuth for ${provider}`);
      throw error;
    }
    
    // Check if popup was closed by user (cancelled) - check all possible error formats
    const errorMessage = String(error?.message || '').toLowerCase();
    const errorType = String(error?.type || '').toLowerCase();
    const errorName = String(error?.name || '').toLowerCase();
    const errorCode = String(error?.code || '').toLowerCase();
    const errorString = String(error).toLowerCase();
    
    const isCancelled = 
      errorMessage.includes('window closed') ||
      errorMessage.includes('popup closed') ||
      errorMessage.includes('user cancelled') ||
      errorMessage.includes('user closed') ||
      errorMessage.includes('authorization_cancelled') ||
      errorMessage.includes('canceled') ||
      errorMessage.includes('cancelled') ||
      errorMessage.includes('closed') ||
      errorType.includes('closed') ||
      errorType.includes('cancelled') ||
      errorType.includes('canceled') ||
      errorName.includes('cancelled') ||
      errorName.includes('canceled') ||
      errorCode.includes('cancelled') ||
      errorCode.includes('canceled') ||
      errorString.includes('closed') ||
      errorString.includes('cancelled') ||
      errorString.includes('canceled');
    
    if (isCancelled) {
      console.log(`ℹ️ Nango: User closed the popup without completing OAuth for ${provider}`);
      throw new Error('POPUP_CLOSED');
    }
    
    // Provide helpful error message
    if (errorMessage.includes('popup') || errorMessage.includes('blocked') || error?.message === 'POPUP_BLOCKED') {
      const blockedError = new Error('Popup was blocked. Please allow popups for this site and try again.');
      if (provider === 'jira') {
        console.error('❌ Nango Jira: Popup was blocked by browser');
        console.error('❌ Nango Jira: Please check browser popup settings and allow popups for this site');
      }
      throw blockedError;
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      throw new Error(`Cannot connect to Nango server at ${serverUrl}. Please check if the server is running and accessible.`);
    }
    
    // For any other unknown error, still throw POPUP_CLOSED to reset the UI
    console.log(`ℹ️ Nango: Unknown error, treating as popup closed for ${provider}`);
    throw new Error('POPUP_CLOSED');
  } finally {
    // Restore original window.open
    window.open = originalWindowOpen;
    
    // Clean up popup check interval
    if (popupCheckInterval !== null) {
      clearInterval(popupCheckInterval);
    }
    
    console.log('🔍 Popup Monitor: Cleanup complete');
  }
}

/**
 * Check if integration is connected via Nango
 */
export async function isIntegrationConnectedViaNango(
  provider: 'jira' | 'trello' | 'slack',
  tenantId: string,
  userId: string
): Promise<boolean> {
  try {
    const basePath = getBasePath();
    const response = await fetch(
      `${basePath}/api/nango/status?provider=${provider}&tenantId=${encodeURIComponent(tenantId)}&userId=${encodeURIComponent(userId)}`
    );
    const data = await response.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

