import { ConfigManager } from './config.js';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
  service?: string;
  requestId?: string;
}

export interface LoggerOptions {
  service?: string;
  minLevel?: LogLevel;
  format?: 'json' | 'text';
  timestampFormat?: string;
  configManager?: ConfigManager;
}

export class Logger {
  private static instance: Logger;
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly format: 'json' | 'text';
  private readonly timestampFormat: string;
  private readonly configManager?: ConfigManager;

  private readonly levelPriority: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3
  };

  private constructor(options: LoggerOptions = {}) {
    this.service = options.service || 'mcp-server';
    this.minLevel = options.minLevel || LogLevel.INFO;
    this.format = options.format || 'json';
    this.timestampFormat = options.timestampFormat || 'ISO';
    this.configManager = options.configManager;
  }

  static getInstance(options: LoggerOptions = {}): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  private formatTimestamp(date: Date = new Date()): string {
    if (this.timestampFormat === 'ISO') {
      return date.toISOString();
    }
    if (this.timestampFormat === 'UTC') {
      return date.toUTCString();
    }
    return date.toLocaleString();
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatError(error: Error): Record<string, unknown> {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any)
    };
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      timestamp: this.formatTimestamp(),
      level,
      message,
      context: {
        ...context,
        environment: this.configManager?.getAll().environment,
        debug: this.configManager?.getAll().debug
      },
      error: error ? this.formatError(error) as Record<string, unknown> : undefined,
      service: this.service,
      requestId: (context?.requestId as string) || undefined
    };
  }

  private formatLogEntry(entry: LogEntry): string {
    if (this.format === 'json') {
      return JSON.stringify(entry);
    }

    // Text format
    let output = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.service}: ${entry.message}`;
    
    if (entry.requestId) {
      output += ` (requestId: ${entry.requestId})`;
    }
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += `\nContext: ${JSON.stringify(entry.context, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\nError: ${JSON.stringify(entry.error, null, 2)}`;
    }
    
    return output;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, context, error);
    const formattedEntry = this.formatLogEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedEntry);
        break;
      case LogLevel.WARN:
        console.warn(formattedEntry);
        break;
      case LogLevel.INFO:
        console.info(formattedEntry);
        break;
      case LogLevel.DEBUG:
        console.debug(formattedEntry);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  logError(error: Error, context?: Record<string, unknown>): void {
    this.error('An error occurred', error, context);
  }

  // Specialized logging methods
  request(
    method: string,
    path: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`${method} ${path}`, {
      type: 'request',
      method,
      path,
      ...context
    });
  }

  response(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: Record<string, unknown>
  ): void {
    this.info(`${method} ${path} ${statusCode} ${duration}ms`, {
      type: 'response',
      method,
      path,
      statusCode,
      duration,
      ...context
    });
  }

  metric(
    name: string,
    value: number,
    context?: Record<string, unknown>
  ): void {
    this.info(`Metric: ${name} = ${value}`, {
      type: 'metric',
      metric: name,
      value,
      ...context
    });
  }

  audit(
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Audit: ${action} on ${resource}`, {
      type: 'audit',
      action,
      resource,
      ...context
    });
  }
}

// Logging decorator
export function LogMethod(): MethodDecorator {
  const logger = Logger.getInstance();

  return function(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const className = this?.constructor?.name || 'Unknown';
      const methodName = String(propertyKey);
      const context = { class: className, method: methodName };

      try {
        logger.debug(`${className}.${methodName} - Start`, context);
        const result = await originalMethod.apply(this, args);
        logger.info(`${className}.${methodName} - Complete`, { ...context, success: true });
        return result;
      } catch (error) {
        logger.error(`${className}.${methodName} - Failed`, error as Error, { ...context });
        throw error;
      }
    };

    return descriptor;
  };
}
