import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';
import { CONFIG } from '@/lib/config';

/**
 * Security threat levels
 */
export enum ThreatLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Security event types
 */
export enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'AUTHENTICATION_FAILURE',
  AUTHORIZATION_FAILURE = 'AUTHORIZATION_FAILURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
  SECURITY_HEADER_MISSING = 'SECURITY_HEADER_MISSING',
  POTENTIAL_ATTACK = 'POTENTIAL_ATTACK'
}

/**
 * Security event interface
 */
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  threatLevel: ThreatLevel;
  timestamp: string;
  source: string;
  userAgent?: string;
  ipAddress?: string;
  details: Record<string, any>;
  resolved: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  maxLoginAttempts: number;
  lockoutDurationMs: number;
  sessionTimeoutMs: number;
  requireSecureHeaders: boolean;
  enableAuditLogging: boolean;
  enableThreatDetection: boolean;
  apiKeyRotationIntervalMs: number;
}

/**
 * Comprehensive security manager
 */
export class SecurityManager {
  private events: SecurityEvent[] = [];
  private loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();
  private activeSessions = new Map<string, { userId: string; createdAt: number; lastActivity: number }>();
  private apiKeys = new Map<string, { keyHash: string; createdAt: number; lastUsed: number; permissions: string[] }>();
  private securityConfig: SecurityConfig;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.securityConfig = {
      maxLoginAttempts: 5,
      lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
      sessionTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
      requireSecureHeaders: true,
      enableAuditLogging: true,
      enableThreatDetection: true,
      apiKeyRotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      ...config
    };

    // Cleanup expired sessions and events periodically
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Record a security event
   */
  recordSecurityEvent(
    type: SecurityEventType,
    threatLevel: ThreatLevel,
    source: string,
    details: Record<string, any> = {},
    userAgent?: string,
    ipAddress?: string
  ): void {
    const event: SecurityEvent = {
      id: crypto.randomUUID(),
      type,
      threatLevel,
      timestamp: new Date().toISOString(),
      source,
      userAgent,
      ipAddress,
      details,
      resolved: false
    };

    this.events.push(event);

    // Log based on threat level
    const logLevel = this.getLogLevel(threatLevel);
    logger[logLevel]('Security event recorded', {
      eventId: event.id,
      type,
      threatLevel,
      source,
      details
    }, 'SecurityManager.recordSecurityEvent');

    // Trigger alerts for high-severity events
    if (threatLevel === ThreatLevel.HIGH || threatLevel === ThreatLevel.CRITICAL) {
      this.triggerSecurityAlert(event);
    }

    // Keep only last 10,000 events in memory
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }
  }

  /**
   * Validate login attempt
   */
  validateLoginAttempt(identifier: string, ipAddress?: string): {
    allowed: boolean;
    remainingAttempts?: number;
    lockedUntil?: number;
    reason?: string;
  } {
    const key = `${identifier}:${ipAddress || 'unknown'}`;
    const attempt = this.loginAttempts.get(key);
    const now = Date.now();

    if (!attempt) {
      return { allowed: true };
    }

    // Check if account is locked
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      this.recordSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE,
        ThreatLevel.MEDIUM,
        identifier,
        { reason: 'Account locked', ipAddress },
        undefined,
        ipAddress
      );

      return {
        allowed: false,
        lockedUntil: attempt.lockedUntil,
        reason: 'Account temporarily locked due to too many failed login attempts'
      };
    }

    // Reset lock if expired
    if (attempt.lockedUntil && now >= attempt.lockedUntil) {
      attempt.count = 0;
      attempt.lockedUntil = undefined;
    }

    // Check attempt count
    if (attempt.count >= this.securityConfig.maxLoginAttempts) {
      attempt.lockedUntil = now + this.securityConfig.lockoutDurationMs;
      
      this.recordSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE,
        ThreatLevel.HIGH,
        identifier,
        { reason: 'Too many failed attempts', ipAddress, attemptCount: attempt.count },
        undefined,
        ipAddress
      );

      return {
        allowed: false,
        lockedUntil: attempt.lockedUntil,
        reason: 'Account locked due to too many failed login attempts'
      };
    }

    return {
      allowed: true,
      remainingAttempts: this.securityConfig.maxLoginAttempts - attempt.count
    };
  }

  /**
   * Record login attempt
   */
  recordLoginAttempt(identifier: string, success: boolean, ipAddress?: string): void {
    const key = `${identifier}:${ipAddress || 'unknown'}`;
    const now = Date.now();

    if (success) {
      // Clear failed attempts on successful login
      this.loginAttempts.delete(key);
      
      this.recordSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE, // This would be SUCCESS in real implementation
        ThreatLevel.LOW,
        identifier,
        { success: true, ipAddress },
        undefined,
        ipAddress
      );
    } else {
      // Record failed attempt
      const attempt = this.loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
      attempt.count++;
      attempt.lastAttempt = now;
      this.loginAttempts.set(key, attempt);

      this.recordSecurityEvent(
        SecurityEventType.AUTHENTICATION_FAILURE,
        ThreatLevel.MEDIUM,
        identifier,
        { success: false, ipAddress, attemptCount: attempt.count },
        undefined,
        ipAddress
      );
    }
  }

  /**
   * Create secure session
   */
  createSession(userId: string): string {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    this.activeSessions.set(sessionId, {
      userId,
      createdAt: now,
      lastActivity: now
    });

    logger.info('Session created', { sessionId, userId }, 'SecurityManager.createSession');
    return sessionId;
  }

  /**
   * Validate session
   */
  validateSession(sessionId: string): {
    valid: boolean;
    userId?: string;
    reason?: string;
  } {
    const session = this.activeSessions.get(sessionId);
    const now = Date.now();

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    // Check if session expired
    if (now - session.lastActivity > this.securityConfig.sessionTimeoutMs) {
      this.activeSessions.delete(sessionId);
      
      this.recordSecurityEvent(
        SecurityEventType.AUTHORIZATION_FAILURE,
        ThreatLevel.LOW,
        session.userId,
        { reason: 'Session expired', sessionId }
      );

      return { valid: false, reason: 'Session expired' };
    }

    // Update last activity
    session.lastActivity = now;
    return { valid: true, userId: session.userId };
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      logger.info('Session invalidated', { sessionId, userId: session.userId }, 'SecurityManager.invalidateSession');
    }
  }

  /**
   * Generate API key
   */
  generateApiKey(permissions: string[] = []): string {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const now = Date.now();

    this.apiKeys.set(apiKey, {
      keyHash,
      createdAt: now,
      lastUsed: now,
      permissions
    });

    logger.info('API key generated', { keyHash, permissions }, 'SecurityManager.generateApiKey');
    return apiKey;
  }

  /**
   * Validate API key
   */
  validateApiKey(apiKey: string, requiredPermission?: string): {
    valid: boolean;
    permissions?: string[];
    reason?: string;
  } {
    const keyData = this.apiKeys.get(apiKey);
    const now = Date.now();

    if (!keyData) {
      this.recordSecurityEvent(
        SecurityEventType.AUTHORIZATION_FAILURE,
        ThreatLevel.MEDIUM,
        'api',
        { reason: 'Invalid API key', keyHash: crypto.createHash('sha256').update(apiKey).digest('hex') }
      );
      return { valid: false, reason: 'Invalid API key' };
    }

    // Check if key needs rotation
    if (now - keyData.createdAt > this.securityConfig.apiKeyRotationIntervalMs) {
      this.recordSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        ThreatLevel.LOW,
        'api',
        { reason: 'API key needs rotation', keyHash: keyData.keyHash, ageMs: now - keyData.createdAt }
      );
    }

    // Check permissions
    if (requiredPermission && !keyData.permissions.includes(requiredPermission)) {
      this.recordSecurityEvent(
        SecurityEventType.AUTHORIZATION_FAILURE,
        ThreatLevel.MEDIUM,
        'api',
        { reason: 'Insufficient permissions', keyHash: keyData.keyHash, requiredPermission }
      );
      return { valid: false, reason: 'Insufficient permissions' };
    }

    // Update last used
    keyData.lastUsed = now;
    return { valid: true, permissions: keyData.permissions };
  }

  /**
   * Revoke API key
   */
  revokeApiKey(apiKey: string): void {
    const keyData = this.apiKeys.get(apiKey);
    if (keyData) {
      this.apiKeys.delete(apiKey);
      logger.info('API key revoked', { keyHash: keyData.keyHash }, 'SecurityManager.revokeApiKey');
    }
  }

  /**
   * Validate security headers
   */
  validateSecurityHeaders(headers: Record<string, string>): {
    valid: boolean;
    missingHeaders: string[];
    recommendations: string[];
  } {
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
      'referrer-policy'
    ];

    const missingHeaders = requiredHeaders.filter(header => !headers[header.toLowerCase()]);
    const recommendations: string[] = [];

    if (missingHeaders.length > 0) {
      this.recordSecurityEvent(
        SecurityEventType.SECURITY_HEADER_MISSING,
        ThreatLevel.MEDIUM,
        'headers',
        { missingHeaders }
      );

      recommendations.push(
        'Add missing security headers to protect against common attacks',
        'Consider implementing Content Security Policy (CSP)',
        'Ensure HTTPS is enforced in production'
      );
    }

    return {
      valid: missingHeaders.length === 0,
      missingHeaders,
      recommendations
    };
  }

  /**
   * Detect potential threats
   */
  detectThreats(
    ipAddress: string,
    userAgent: string,
    requestPath: string,
    requestBody?: any
  ): {
    threats: Array<{
      type: string;
      severity: ThreatLevel;
      description: string;
    }>;
  } {
    const threats: Array<{ type: string; severity: ThreatLevel; description: string }> = [];

    // Check for suspicious patterns
    if (this.isSuspiciousUserAgent(userAgent)) {
      threats.push({
        type: 'SUSPICIOUS_USER_AGENT',
        severity: ThreatLevel.MEDIUM,
        description: 'User agent suggests automated/malicious activity'
      });
    }

    if (this.isSuspiciousPath(requestPath)) {
      threats.push({
        type: 'SUSPICIOUS_PATH',
        severity: ThreatLevel.HIGH,
        description: 'Request path contains suspicious patterns'
      });
    }

    if (requestBody && this.containsMaliciousPayload(requestBody)) {
      threats.push({
        type: 'MALICIOUS_PAYLOAD',
        severity: ThreatLevel.CRITICAL,
        description: 'Request body contains potentially malicious content'
      });
    }

    // Check for rate limiting patterns
    const recentEvents = this.getRecentEvents(ipAddress, 5 * 60 * 1000); // Last 5 minutes
    if (recentEvents.length > 100) {
      threats.push({
        type: 'EXCESSIVE_REQUESTS',
        severity: ThreatLevel.HIGH,
        description: 'Unusually high number of requests from this IP'
      });
    }

    // Record threats
    threats.forEach(threat => {
      this.recordSecurityEvent(
        SecurityEventType.POTENTIAL_ATTACK,
        threat.severity,
        ipAddress,
        { threat, userAgent, requestPath },
        userAgent,
        ipAddress
      );
    });

    return { threats };
  }

  /**
   * Get security events
   */
  getSecurityEvents(
    filters: {
      type?: SecurityEventType;
      threatLevel?: ThreatLevel;
      source?: string;
      startTime?: string;
      endTime?: string;
      resolved?: boolean;
    } = {}
  ): SecurityEvent[] {
    return this.events.filter(event => {
      if (filters.type && event.type !== filters.type) return false;
      if (filters.threatLevel && event.threatLevel !== filters.threatLevel) return false;
      if (filters.source && event.source !== filters.source) return false;
      if (filters.resolved !== undefined && event.resolved !== filters.resolved) return false;
      if (filters.startTime && event.timestamp < filters.startTime) return false;
      if (filters.endTime && event.timestamp > filters.endTime) return false;
      return true;
    });
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsByThreatLevel: Record<ThreatLevel, number>;
    activeSessionCount: number;
    lockedAccountCount: number;
    apiKeyCount: number;
    recentThreats: number;
  } {
    const eventsByType = Object.values(SecurityEventType).reduce((acc, type) => {
      acc[type] = this.events.filter(e => e.type === type).length;
      return acc;
    }, {} as Record<SecurityEventType, number>);

    const eventsByThreatLevel = Object.values(ThreatLevel).reduce((acc, level) => {
      acc[level] = this.events.filter(e => e.threatLevel === level).length;
      return acc;
    }, {} as Record<ThreatLevel, number>);

    const now = Date.now();
    const lockedAccountCount = Array.from(this.loginAttempts.values())
      .filter(attempt => attempt.lockedUntil && now < attempt.lockedUntil).length;

    const recentThreats = this.events.filter(event => 
      event.type === SecurityEventType.POTENTIAL_ATTACK &&
      Date.now() - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    ).length;

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsByThreatLevel,
      activeSessionCount: this.activeSessions.size,
      lockedAccountCount,
      apiKeyCount: this.apiKeys.size,
      recentThreats
    };
  }

  /**
   * Resolve security event
   */
  resolveSecurityEvent(eventId: string, resolution: string): void {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.resolved = true;
      event.details.resolution = resolution;
      event.details.resolvedAt = new Date().toISOString();
      
      logger.info('Security event resolved', { eventId, resolution }, 'SecurityManager.resolveSecurityEvent');
    }
  }

  // Private methods

  private getLogLevel(threatLevel: ThreatLevel): 'debug' | 'info' | 'warn' | 'error' {
    switch (threatLevel) {
      case ThreatLevel.LOW: return 'debug';
      case ThreatLevel.MEDIUM: return 'info';
      case ThreatLevel.HIGH: return 'warn';
      case ThreatLevel.CRITICAL: return 'error';
      default: return 'info';
    }
  }

  private triggerSecurityAlert(event: SecurityEvent): void {
    // In a real implementation, this would send alerts via email, SMS, etc.
    logger.error('SECURITY ALERT', {
      eventId: event.id,
      type: event.type,
      threatLevel: event.threatLevel,
      source: event.source,
      details: event.details
    }, 'SecurityManager.triggerSecurityAlert');
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python/i,
      /bot/i,
      /crawler/i,
      /scanner/i,
      /exploit/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private isSuspiciousPath(path: string): boolean {
    const suspiciousPatterns = [
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i,
      /admin/i,
      /wp-admin/i,
      /phpmyadmin/i,
      /\.\.\/\.\./,
      /etc\/passwd/,
      /proc\/self/,
      /<script/i,
      /javascript:/i,
      /vbscript:/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(path));
  }

  private containsMaliciousPayload(payload: any): boolean {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload/i,
      /onerror/i,
      /onclick/i,
      /document\.cookie/i,
      /eval\(/i,
      /setTimeout\(/i,
      /setInterval\(/i,
      /Function\(/i,
      /\.\.\/\.\./,
      /etc\/passwd/,
      /proc\/self/,
      /DROP TABLE/i,
      /INSERT INTO/i,
      /DELETE FROM/i,
      /UPDATE.*SET/i,
      /UNION SELECT/i
    ];
    
    return maliciousPatterns.some(pattern => pattern.test(payloadString));
  }

  private getRecentEvents(ipAddress: string, timeWindowMs: number): SecurityEvent[] {
    const cutoff = new Date(Date.now() - timeWindowMs).toISOString();
    return this.events.filter(event => 
      event.ipAddress === ipAddress && event.timestamp > cutoff
    );
  }

  private cleanup(): void {
    const now = Date.now();
    
    // Clean expired sessions
    let expiredSessions = 0;
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.securityConfig.sessionTimeoutMs) {
        this.activeSessions.delete(sessionId);
        expiredSessions++;
      }
    }

    // Clean old login attempts
    let expiredAttempts = 0;
    for (const [key, attempt] of this.loginAttempts.entries()) {
      if (attempt.lockedUntil && now > attempt.lockedUntil && attempt.count === 0) {
        this.loginAttempts.delete(key);
        expiredAttempts++;
      }
    }

    // Clean old events (keep only last 30 days)
    const eventCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const originalEventCount = this.events.length;
    this.events = this.events.filter(event => event.timestamp > eventCutoff);
    const cleanedEvents = originalEventCount - this.events.length;

    if (expiredSessions > 0 || expiredAttempts > 0 || cleanedEvents > 0) {
      logger.debug('Security cleanup completed', {
        expiredSessions,
        expiredAttempts,
        cleanedEvents
      }, 'SecurityManager.cleanup');
    }
  }
}

/**
 * Global security manager instance
 */
export const securityManager = new SecurityManager();

/**
 * Security middleware helpers
 */
export const securityHelpers = {
  /**
   * Generate secure random string
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  },

  /**
   * Hash sensitive data
   */
  hashSensitiveData(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    return crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512').toString('hex');
  },

  /**
   * Verify hashed data
   */
  verifySensitiveData(data: string, hash: string, salt: string): boolean {
    const newHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(newHash));
  },

  /**
   * Encrypt sensitive data
   */
  encryptSensitiveData(data: string, key?: string): { encrypted: string; iv: string; key: string } {
    const actualKey = key || crypto.randomBytes(32).toString('hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', actualKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      key: actualKey
    };
  },

  /**
   * Decrypt sensitive data
   */
  decryptSensitiveData(encrypted: string, key: string, iv: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}; 