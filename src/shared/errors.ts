import { ApiError } from './types.js';

export enum ErrorCode {
  // Client errors (4xx)
  BadRequest = 'BAD_REQUEST',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  ValidationError = 'VALIDATION_ERROR',
  
  // Server errors (5xx)
  InternalError = 'INTERNAL_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  GatewayTimeout = 'GATEWAY_TIMEOUT',
  
  // API-specific errors
  ApiError = 'API_ERROR',
  NetworkError = 'NETWORK_ERROR',
  ParseError = 'PARSE_ERROR',
  CacheError = 'CACHE_ERROR',
  
  // Authentication errors
  InvalidToken = 'INVALID_TOKEN',
  TokenExpired = 'TOKEN_EXPIRED',
  MissingToken = 'MISSING_TOKEN'
}

export class McpError extends Error implements ApiError {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: number;
  public readonly path?: string;
  public readonly method?: string;

  constructor(
    code: ErrorCode | string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }

    // Parse path and method from stack trace if available
    const stackLines = this.stack?.split('\n') || [];
    if (stackLines.length > 1) {
      const callerLine = stackLines[1];
      if (callerLine) {
        const match = callerLine.match(/at\s+(\S+)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
          this.method = match[1];
          this.path = match[2];
        }
      }
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      path: this.path,
      method: this.method,
      stack: this.stack
    };
  }

  static fromError(error: Error | unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      return new McpError(
        ErrorCode.InternalError,
        error.message,
        500,
        { originalError: error.name, stack: error.stack }
      );
    }

    return new McpError(
      ErrorCode.InternalError,
      'An unknown error occurred',
      500,
      { originalError: String(error) }
    );
  }

  static badRequest(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.BadRequest, message, 400, details);
  }

  static unauthorized(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.Unauthorized, message, 401, details);
  }

  static forbidden(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.Forbidden, message, 403, details);
  }

  static notFound(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.NotFound, message, 404, details);
  }

  static rateLimitExceeded(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.RateLimitExceeded, message, 429, details);
  }

  static validation(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.ValidationError, message, 400, details);
  }

  static internal(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.InternalError, message, 500, details);
  }

  static serviceUnavailable(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.ServiceUnavailable, message, 503, details);
  }

  static apiError(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.ApiError, message, 502, details);
  }

  static networkError(message: string, details?: Record<string, unknown>): McpError {
    return new McpError(ErrorCode.NetworkError, message, 503, details);
  }
}

// Error handler decorator
export function ErrorHandler(options: {
  rethrow?: boolean;
  logError?: boolean;
} = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const mcpError = McpError.fromError(error);

        if (options.logError !== false) {
          console.error('[MCP Error]', mcpError.toJSON());
        }

        if (options.rethrow !== false) {
          throw mcpError;
        }

        return {
          success: false,
          error: mcpError
        };
      }
    };

    return descriptor;
  };
}

// Validation error helper
export class ValidationError extends McpError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    details?: Record<string, unknown>
  ) {
    super(
      ErrorCode.ValidationError,
      message,
      400,
      {
        ...details,
        field,
        value
      }
    );
    this.name = 'ValidationError';
  }

  static invalidType(field: string, expectedType: string, value: unknown): ValidationError {
    return new ValidationError(
      `Invalid type for field '${field}'. Expected ${expectedType}`,
      field,
      value,
      { expectedType }
    );
  }

  static required(field: string): ValidationError {
    return new ValidationError(
      `Field '${field}' is required`,
      field,
      undefined
    );
  }

  static invalidValue(field: string, value: unknown, reason: string): ValidationError {
    return new ValidationError(
      `Invalid value for field '${field}': ${reason}`,
      field,
      value,
      { reason }
    );
  }
}
