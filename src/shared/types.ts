import { z } from 'zod';

// Common error types
export interface ApiError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  errorMessage?: string;
}

// Caching types
export interface CacheConfig {
  ttl: number;
  maxSize: number;
  namespace?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Monitoring types
export interface Metrics {
  requestCount: number;
  errorCount: number;
  latency: number[];
  lastRequest: Date;
  cacheHits: number;
  cacheMisses: number;
}

// Validation schemas
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000),
  maxRequests: z.number().min(1),
  errorMessage: z.string().optional()
});

export const CacheConfigSchema = z.object({
  ttl: z.number().min(0),
  maxSize: z.number().min(1),
  namespace: z.string().optional()
});

// Common utility types
export type AsyncResult<T> = Promise<{
  success: boolean;
  data?: T;
  error?: ApiError;
  cached?: boolean;
  metrics?: Partial<Metrics>;
}>;

export interface RequestContext {
  id: string;
  timestamp: number;
  source: string;
  authenticated: boolean;
  user?: string;
}

// Configuration types
export interface ServerConfig {
  name: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
  metrics: {
    enabled: boolean;
    interval: number;
  };
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  timeout: number;
  retries: {
    count: number;
    backoff: number;
  };
}

export const ServerConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.enum(['development', 'staging', 'production']),
  debug: z.boolean(),
  metrics: z.object({
    enabled: z.boolean(),
    interval: z.number().min(1000)
  }),
  cache: CacheConfigSchema,
  rateLimit: RateLimitConfigSchema,
  timeout: z.number().min(1000),
  retries: z.object({
    count: z.number().min(0),
    backoff: z.number().min(100)
  })
});
