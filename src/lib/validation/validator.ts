import { z } from 'zod';
import { ValidationError } from '@/lib/errors/error-handler';
import { logger } from '@/lib/utils/logger';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export class ValidationService {
  /**
   * Validates data against a Zod schema and throws ValidationError on failure
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
    const validationContext = context || 'ValidationService.validate';
    
    try {
      const result = schema.parse(data);
      logger.debug('Validation successful', { context: validationContext });
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        const errorMessage = `Validation failed: ${errorMessages.join(', ')}`;
        
        logger.error('Validation failed', { 
          errors: errorMessages,
          context: validationContext,
          data: typeof data === 'object' ? JSON.stringify(data, null, 2).substring(0, 500) : String(data)
        });
        
        throw new ValidationError(errorMessage, validationContext);
      }
      
      throw error;
    }
  }

  /**
   * Validates data against a Zod schema and returns a result object instead of throwing
   */
  static safeValidate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): ValidationResult<T> {
    const validationContext = context || 'ValidationService.safeValidate';
    
    try {
      const result = schema.parse(data);
      logger.debug('Safe validation successful', { context: validationContext });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        
        logger.warn('Safe validation failed', { 
          errors: errorMessages,
          context: validationContext
        });
        
        return {
          success: false,
          errors: errorMessages
        };
      }
      
      logger.error('Unexpected error during safe validation', { error, context: validationContext });
      return {
        success: false,
        errors: ['Unexpected validation error']
      };
    }
  }

  /**
   * Validates an array of items against a schema
   */
  static validateArray<T>(schema: z.ZodSchema<T>, data: unknown[], context?: string): T[] {
    const validationContext = context || 'ValidationService.validateArray';
    
    if (!Array.isArray(data)) {
      throw new ValidationError('Expected an array', validationContext);
    }

    const results: T[] = [];
    const errors: string[] = [];

    data.forEach((item, index) => {
      try {
        const validated = this.validate(schema, item, `${validationContext}[${index}]`);
        results.push(validated);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(`Item ${index}: ${error.message}`);
        } else {
          errors.push(`Item ${index}: Unexpected validation error`);
        }
      }
    });

    if (errors.length > 0) {
      throw new ValidationError(
        `Array validation failed: ${errors.join(', ')}`,
        validationContext
      );
    }

    return results;
  }

  /**
   * Validates partial data (useful for updates where not all fields are required)
   */
  static validatePartial<T extends Record<string, any>>(
    schema: z.ZodObject<any>, 
    data: unknown, 
    context?: string
  ): Partial<T> {
    const partialSchema = schema.partial();
    return this.validate(partialSchema, data, context) as Partial<T>;
  }

  /**
   * Sanitizes string input by trimming and removing potentially dangerous characters
   */
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove < and > to prevent basic XSS
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers like onclick=
  }

  /**
   * Validates and sanitizes form data
   */
  static validateFormData<T>(
    schema: z.ZodSchema<T>, 
    formData: FormData, 
    context?: string
  ): T {
    const validationContext = context || 'ValidationService.validateFormData';
    
    // Convert FormData to plain object
    const data: Record<string, any> = {};
    
    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        data[key] = this.sanitizeString(value);
      } else {
        data[key] = value;
      }
    });

    return this.validate(schema, data, validationContext);
  }

  /**
   * Validates URL parameters
   */
  static validateUrlParams<T>(
    schema: z.ZodSchema<T>, 
    params: URLSearchParams | Record<string, string>, 
    context?: string
  ): T {
    const validationContext = context || 'ValidationService.validateUrlParams';
    
    let data: Record<string, string>;
    
    if (params instanceof URLSearchParams) {
      data = {};
      params.forEach((value, key) => {
        data[key] = this.sanitizeString(value);
      });
    } else {
      data = Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, this.sanitizeString(value)])
      );
    }

    return this.validate(schema, data, validationContext);
  }

  /**
   * Validates environment variables
   */
  static validateEnvironment<T>(schema: z.ZodSchema<T>, context?: string): T {
    const validationContext = context || 'ValidationService.validateEnvironment';
    
    return this.validate(schema, process.env, validationContext);
  }

  /**
   * Type guard function to check if data matches a schema
   */
  static isValid<T>(schema: z.ZodSchema<T>, data: unknown): data is T {
    try {
      schema.parse(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a middleware function for validating request bodies
   */
  static createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
    return (data: unknown, context?: string) => {
      return this.validate(schema, data, context);
    };
  }
}

/**
 * Convenience functions for common validation patterns
 */
export const validate = ValidationService.validate;
export const safeValidate = ValidationService.safeValidate;
export const validateArray = ValidationService.validateArray;
export const isValid = ValidationService.isValid; 