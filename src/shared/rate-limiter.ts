import { RateLimitConfig } from './types.js';

export class RateLimiter {
  private tokens: Map<string, number[]>;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.tokens = new Map();
    this.config = config;

    // Cleanup old tokens periodically
    setInterval(() => this.cleanup(), Math.min(config.windowMs, 60000));
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.tokens.entries()) {
      const validTimestamps = timestamps.filter(
        ts => now - ts < this.config.windowMs
      );
      if (validTimestamps.length === 0) {
        this.tokens.delete(key);
      } else {
        this.tokens.set(key, validTimestamps);
      }
    }
  }

  async isRateLimited(key: string): Promise<boolean> {
    const now = Date.now();
    const timestamps = this.tokens.get(key) || [];
    
    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(
      ts => now - ts < this.config.windowMs
    );
    
    if (validTimestamps.length >= this.config.maxRequests) {
      return true;
    }
    
    validTimestamps.push(now);
    this.tokens.set(key, validTimestamps);
    
    return false;
  }

  async waitForToken(key: string): Promise<void> {
    while (await this.isRateLimited(key)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getRemainingTokens(key: string): number {
    const now = Date.now();
    const timestamps = this.tokens.get(key) || [];
    const validTimestamps = timestamps.filter(
      ts => now - ts < this.config.windowMs
    );
    return Math.max(0, this.config.maxRequests - validTimestamps.length);
  }

  getResetTime(key: string): number {
    const now = Date.now();
    const timestamps = this.tokens.get(key) || [];
    if (timestamps.length === 0) {
      return 0;
    }
    
    const oldestTimestamp = Math.min(...timestamps);
    return Math.max(0, this.config.windowMs - (now - oldestTimestamp));
  }

  clear(key?: string): void {
    if (key) {
      this.tokens.delete(key);
    } else {
      this.tokens.clear();
    }
  }

  getMetrics(key: string) {
    return {
      remaining: this.getRemainingTokens(key),
      resetIn: this.getResetTime(key),
      limit: this.config.maxRequests,
      window: this.config.windowMs
    };
  }
}

// Decorator for rate-limiting class methods
export function RateLimit(
  limiter: RateLimiter,
  keyGenerator: (args: any[]) => string
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = keyGenerator(args);
      await limiter.waitForToken(key);
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
