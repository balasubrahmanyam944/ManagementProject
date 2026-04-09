export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly context?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace?.(this, ApiError);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string, context?: string) {
    super(message, 401, context);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, context?: string) {
    super(message, 400, context);
    this.name = 'ValidationError';
  }
}

export class ExternalServiceError extends ApiError {
  constructor(
    message: string,
    statusCode: number,
    context: string,
    originalError?: Error
  ) {
    super(message, statusCode, context, originalError);
    this.name = 'ExternalServiceError';
  }
}

export interface ErrorResponse {
  error: string;
  code?: string;
  context?: string;
  timestamp: string;
}

export class ErrorHandler {
  /**
   * Handles API response errors and throws appropriate errors
   */
  static async handleApiResponse(
    response: Response,
    context: string
  ): Promise<any> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Could not retrieve error text");
      const truncatedError = errorText.substring(0, 200);
      
      const message = `${context}: HTTP ${response.status} - ${truncatedError}`;
      
      // Log the error
      this.logError(message, {
        status: response.status,
        url: response.url,
        context,
        errorText: truncatedError
      });

      // Throw appropriate error based on status code
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(message, context);
      } else if (response.status >= 400 && response.status < 500) {
        throw new ValidationError(message, context);
      } else {
        throw new ExternalServiceError(message, response.status, context);
      }
    }

    try {
      return await response.json();
    } catch (parseError) {
      this.logError(`Failed to parse JSON response in ${context}`, { parseError });
      throw new ApiError(`Invalid JSON response from ${context}`, response.status, context);
    }
  }

  /**
   * Logs error with consistent format
   */
  static logError(message: string, details?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
      level: 'ERROR',
      ...details
    };

    console.error(`[${timestamp}] ERROR: ${message}`, details || '');
  }

  /**
   * Logs informational messages
   */
  static logInfo(message: string, details?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] INFO: ${message}`, details || '');
    }
  }

  /**
   * Creates a standardized error response
   */
  static createErrorResponse(error: Error): ErrorResponse {
    const timestamp = new Date().toISOString();
    
    if (error instanceof ApiError) {
      return {
        error: error.message,
        code: error.name,
        context: error.context,
        timestamp
      };
    }

    return {
      error: error.message || 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      timestamp
    };
  }

  /**
   * Wraps async functions with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error; // Re-throw our custom errors
      }

      const message = `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logError(message, { originalError: error });
      throw new ApiError(message, undefined, context, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Creates a Next.js Response with proper error formatting
   */
  // static createApiErrorResponse(error: Error, status?: number): Response {
  //   const errorResponse = this.createErrorResponse(error);
  //   const statusCode = status || (error instanceof ApiError ? error.statusCode : undefined) || 500;

  //   return new Response(JSON.stringify(errorResponse), {
  //     status: statusCode,
  //     headers: { 'Content-Type': 'application/json' },
  //   });
  // }
}