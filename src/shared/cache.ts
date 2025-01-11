import { CacheConfig, CacheEntry } from './types.js';

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.cache = new Map();
    this.config = config;
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), Math.min(config.ttl, 60000));
  }

  private createKey(key: string): string {
    return this.config.namespace ? `${this.config.namespace}:${key}` : key;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private enforceMaxSize(): void {
    if (this.cache.size > this.config.maxSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, Math.floor(this.config.maxSize * 0.2)); // Remove 20%
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }

  get(key: string): T | null {
    const cacheKey = this.createKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return null;
    
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, value: T): void {
    this.enforceMaxSize();
    
    const now = Date.now();
    const cacheKey = this.createKey(key);
    
    this.cache.set(cacheKey, {
      data: value,
      timestamp: now,
      expiresAt: now + this.config.ttl
    });
  }

  has(key: string): boolean {
    const cacheKey = this.createKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return false;
    
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return false;
    }
    
    return true;
  }

  delete(key: string): void {
    const cacheKey = this.createKey(key);
    this.cache.delete(cacheKey);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  entries(): [string, T][] {
    const now = Date.now();
    return Array.from(this.cache.entries())
      .filter(([, entry]) => now < entry.expiresAt)
      .map(([key, entry]) => [key, entry.data]);
  }
}
