import { Metrics } from './types.js';

export class MetricsCollector {
  private metrics: Map<string, Metrics>;
  private readonly maxHistorySize: number;
  private readonly flushInterval: number;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(options: {
    maxHistorySize?: number;
    flushInterval?: number;
    onFlush?: (metrics: Map<string, Metrics>) => void;
  } = {}) {
    this.metrics = new Map();
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.flushInterval = options.flushInterval || 60000; // 1 minute default

    if (options.onFlush) {
      this.flushTimer = setInterval(() => {
        options.onFlush!(this.metrics);
        this.reset();
      }, this.flushInterval);
    }
  }

  private getOrCreateMetric(key: string): Metrics {
    let metric = this.metrics.get(key);
    if (!metric) {
      metric = {
        requestCount: 0,
        errorCount: 0,
        latency: [],
        lastRequest: new Date(),
        cacheHits: 0,
        cacheMisses: 0
      };
      this.metrics.set(key, metric);
    }
    return metric;
  }

  recordRequest(key: string, latencyMs: number, error?: boolean): void {
    const metric = this.getOrCreateMetric(key);
    
    metric.requestCount++;
    if (error) {
      metric.errorCount++;
    }
    
    metric.latency.push(latencyMs);
    if (metric.latency.length > this.maxHistorySize) {
      metric.latency = metric.latency.slice(-this.maxHistorySize);
    }
    
    metric.lastRequest = new Date();
  }

  recordCache(key: string, hit: boolean): void {
    const metric = this.getOrCreateMetric(key);
    if (hit) {
      metric.cacheHits++;
    } else {
      metric.cacheMisses++;
    }
  }

  getMetrics(key: string): Metrics | undefined {
    return this.metrics.get(key);
  }

  getAllMetrics(): Map<string, Metrics> {
    return new Map(this.metrics);
  }

  getAggregatedMetrics(key: string) {
    const metric = this.metrics.get(key);
    if (!metric) return undefined;

    const latencyStats = this.calculateLatencyStats(metric.latency);
    const cacheStats = this.calculateCacheStats(metric);
    const errorRate = metric.requestCount > 0 
      ? (metric.errorCount / metric.requestCount) * 100 
      : 0;

    return {
      totalRequests: metric.requestCount,
      errorsCount: metric.errorCount,
      errorRate: `${errorRate.toFixed(2)}%`,
      latency: latencyStats,
      cache: cacheStats,
      lastRequest: metric.lastRequest
    };
  }

  private calculateLatencyStats(latencies: number[]) {
    if (latencies.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95: sorted[p95Index],
      p99: sorted[p99Index]
    };
  }

  private calculateCacheStats(metric: Metrics) {
    const total = metric.cacheHits + metric.cacheMisses;
    const hitRate = total > 0 ? (metric.cacheHits / total) * 100 : 0;

    return {
      hits: metric.cacheHits,
      misses: metric.cacheMisses,
      total,
      hitRate: `${hitRate.toFixed(2)}%`
    };
  }

  reset(key?: string): void {
    if (key) {
      this.metrics.delete(key);
    } else {
      this.metrics.clear();
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}

// Metrics decorator
export function TrackMetrics(
  collector: MetricsCollector,
  key: string | ((args: any[]) => string)
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const metricKey = typeof key === 'function' ? key(args) : key;
      const start = Date.now();
      let error = false;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (e) {
        error = true;
        throw e;
      } finally {
        const latency = Date.now() - start;
        collector.recordRequest(metricKey, latency, error);
      }
    };

    return descriptor;
  };
}

// Cache metrics decorator
export function TrackCacheMetrics(
  collector: MetricsCollector,
  key: string | ((args: any[]) => string)
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const metricKey = typeof key === 'function' ? key(args) : key;
      const result = await originalMethod.apply(this, args);
      
      // Assume cache hit if result has cached=true metadata
      const isCacheHit = result?.metadata?.cached === true;
      collector.recordCache(metricKey, isCacheHit);
      
      return result;
    };

    return descriptor;
  };
}
