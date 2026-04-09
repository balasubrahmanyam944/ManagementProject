/**
 * Integration configuration settings
 */
export interface IntegrationConfig {
  // Whether to automatically disconnect integrations on validation failures
  autoDisconnectOnFailure: boolean
  // Whether to validate credentials on every connection check
  validateCredentialsOnCheck: boolean
  // Timeout for API validation calls (in milliseconds)
  validationTimeout: number
  // Retry attempts for failed validations
  maxRetryAttempts: number
}

/**
 * Default integration configuration
 */
export const defaultIntegrationConfig: IntegrationConfig = {
  // Don't automatically disconnect on validation failures
  autoDisconnectOnFailure: false,
  // Only validate credentials when explicitly needed
  validateCredentialsOnCheck: false,
  // 10 second timeout for API calls
  validationTimeout: 10000,
  // 3 retry attempts
  maxRetryAttempts: 3
}

/**
 * Get integration configuration
 */
export function getIntegrationConfig(): IntegrationConfig {
  return {
    ...defaultIntegrationConfig,
    // Override with environment variables if needed
    autoDisconnectOnFailure: process.env.INTEGRATION_AUTO_DISCONNECT === 'true',
    validateCredentialsOnCheck: process.env.INTEGRATION_VALIDATE_CREDENTIALS === 'true',
    validationTimeout: parseInt(process.env.INTEGRATION_TIMEOUT || '10000'),
    maxRetryAttempts: parseInt(process.env.INTEGRATION_MAX_RETRIES || '3')
  }
} 