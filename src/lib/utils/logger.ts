export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    this.logLevel = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const contextStr = context ? ` [${context}]` : '';
    return `[${timestamp}] ${levelName}${contextStr}: ${message}`;
  }

  debug(message: string, data?: Record<string, any>, context?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, context), data || '');
    }
  }

  info(message: string, data?: Record<string, any>, context?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, context), data || '');
    }
  }

  warn(message: string, data?: Record<string, any>, context?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, context), data || '');
    }
  }

  error(message: string, data?: Record<string, any>, context?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, context), data || '');
    }
  }

  // Convenience methods for API operations
  apiRequest(method: string, url: string, context?: string): void {
    this.debug(`${method} ${url}`, undefined, context || 'API');
  }

  apiSuccess(method: string, url: string, status: number, context?: string): void {
    this.info(`${method} ${url} - ${status}`, undefined, context || 'API');
  }

  apiError(method: string, url: string, status: number, error: string, context?: string): void {
    this.error(`${method} ${url} - ${status}`, { error }, context || 'API');
  }
}

export const logger = Logger.getInstance();