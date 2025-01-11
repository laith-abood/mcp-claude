// Import and re-export all shared utilities
import { Cache } from './cache.js';
import { ConfigManager } from './config.js';
import { McpError } from './errors.js';
import { Logger, LogMethod, LogLevel } from './logger.js';
import { MetricsCollector } from './metrics.js';
import { RateLimiter } from './rate-limiter.js';
import type { ServerConfig } from './types.js';

export * from './cache.js';
export * from './config.js';
export * from './errors.js';
export * from './logger.js';
export * from './metrics.js';
export * from './rate-limiter.js';
export * from './types.js';

// Export a function to initialize all shared utilities with default configuration
export function initializeSharedUtilities(options: {
  service?: string;
  environment?: 'development' | 'staging' | 'production';
  debug?: boolean;
  metrics?: {
    enabled?: boolean;
    interval?: number;
  };
  cache?: {
    ttl?: number;
    maxSize?: number;
    namespace?: string;
  };
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
    errorMessage?: string;
  };
  logging?: {
    minLevel?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'text';
    timestampFormat?: string;
  };
} = {}) {
  // Initialize config manager first as other utilities depend on it
  const configManager = ConfigManager.getInstance({
    name: options.service || 'mcp-server',
    version: '1.0.0',
    environment: options.environment || 'development',
    debug: options.debug || false,
    metrics: {
      enabled: options.metrics?.enabled ?? true,
      interval: options.metrics?.interval ?? 60000
    },
    cache: {
      ttl: options.cache?.ttl ?? 300000,
      maxSize: options.cache?.maxSize ?? 1000,
      namespace: options.cache?.namespace ?? 'mcp'
    },
    rateLimit: {
      windowMs: options.rateLimit?.windowMs ?? 60000,
      maxRequests: options.rateLimit?.maxRequests ?? 100,
      errorMessage: options.rateLimit?.errorMessage ?? 'Too many requests'
    },
    timeout: 30000,
    retries: {
      count: 3,
      backoff: 1000
    }
  });

  // Initialize logger
  const logger = Logger.getInstance({
    service: options.service,
    minLevel: (options.logging?.minLevel || 'info') as LogLevel,
    format: options.logging?.format || 'json',
    timestampFormat: options.logging?.timestampFormat || 'ISO',
    configManager
  });

  // Initialize metrics collector
  const metricsCollector = new MetricsCollector({
    maxHistorySize: 1000,
    flushInterval: options.metrics?.interval || 60000,
    onFlush: (metrics) => {
      if (configManager.getAll().metrics.enabled) {
        logger.metric('mcp_metrics_flush', metrics.size, {
          metrics: Object.fromEntries(metrics)
        });
      }
    }
  });

  // Initialize rate limiter
  const rateLimiter = new RateLimiter({
    windowMs: options.rateLimit?.windowMs || 60000,
    maxRequests: options.rateLimit?.maxRequests || 100,
    errorMessage: options.rateLimit?.errorMessage
  });

  // Initialize cache
  const cache = new Cache<unknown>({
    ttl: options.cache?.ttl || 300000,
    maxSize: options.cache?.maxSize || 1000,
    namespace: options.cache?.namespace
  });

  // Log initialization
  logger.info('Shared utilities initialized', {
    service: options.service,
    environment: options.environment,
    config: configManager.getAll()
  });

  return {
    configManager,
    logger,
    metricsCollector,
    rateLimiter,
    cache
  };
}

// Export a base MCP server class that uses all shared utilities
export abstract class BaseMcpServer {
  protected readonly configManager: ConfigManager;
  protected readonly logger: Logger;
  protected readonly metrics: MetricsCollector;
  protected readonly rateLimiter: RateLimiter;
  protected readonly cache: Cache<unknown>;
  private isRunning: boolean = false;

  constructor(options: Parameters<typeof initializeSharedUtilities>[0] = {}) {
    const utils = initializeSharedUtilities(options);
    this.configManager = utils.configManager;
    this.logger = utils.logger;
    this.metrics = utils.metricsCollector;
    this.rateLimiter = utils.rateLimiter;
    this.cache = utils.cache;
  }

  protected abstract initialize(): Promise<void>;
  protected abstract shutdown(): Promise<void>;

  @LogMethod()
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new McpError('SERVER_ALREADY_RUNNING', 'Server is already running');
    }

    try {
      await this.initialize();
      this.isRunning = true;
      this.logger.info('Server started successfully');
    } catch (error) {
      this.logger.error('Server startup failed', error as Error);
      throw error;
    }
  }

  @LogMethod()
  async stop(): Promise<void> {
    if (!this.isRunning) {
      throw new McpError('SERVER_NOT_RUNNING', 'Server is not running');
    }

    try {
      await this.shutdown();
      this.metrics.stop();
      this.isRunning = false;
      this.logger.info('Server stopped successfully');
    } catch (error) {
      this.logger.error('Server shutdown failed', error as Error);
      throw error;
    }
  }

  protected isFeatureEnabled(feature: string): boolean {
    return this.configManager.isFeatureEnabled(feature);
  }

  protected getSecret(key: string): string {
    return this.configManager.requireSecret(key);
  }

  protected async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== null) {
      this.metrics.recordCache(key, true);
      return cached as T;
    }

    const result = await operation();
    this.cache.set(key, result);
    this.metrics.recordCache(key, false);
    return result;
  }

  protected async withRateLimit(
    key: string,
    operation: () => Promise<any>
  ): Promise<any> {
    await this.rateLimiter.waitForToken(key);
    return operation();
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoff?: number;
      shouldRetry?: (error: Error) => boolean;
    } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.configManager.get('retries').count;
    const backoff = options.backoff ?? this.configManager.get('retries').backoff;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (options.shouldRetry && !options.shouldRetry(lastError)) {
          throw lastError;
        }
        if (attempt === maxRetries) {
          throw lastError;
        }
        await new Promise(resolve => setTimeout(resolve, backoff * attempt));
      }
    }

    throw lastError!;
  }
}
