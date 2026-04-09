import crypto from 'crypto'

/**
 * Generate a secure random verification token
 * @returns A URL-safe base64 encoded token
 */
export function generateVerificationToken(): string {
  // Generate 32 random bytes and convert to base64url
  const token = crypto.randomBytes(32).toString('base64url')
  return token
}

/**
 * Generate token expiration date (24 hours from now)
 * @returns Date object for token expiration
 */
export function generateTokenExpiration(): Date {
  const expires = new Date()
  expires.setHours(expires.getHours() + 24) // Token valid for 24 hours
  return expires
}

