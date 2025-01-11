import { z } from 'zod';
import { ServerConfig, ServerConfigSchema } from './types.js';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ServerConfig;
  private readonly envPrefix: string;
  private configUpdateCallbacks: Array<(config: ServerConfig) => void> = [];

  private constructor(
    initialConfig: Partial<ServerConfig>,
    options: { envPrefix?: string } = {}
  ) {
    this.envPrefix = options.envPrefix || 'MCP_';
    this.config = this.loadConfig(initialConfig);
  }

  static getInstance(
    initialConfig: Partial<ServerConfig> = {},
    options: { envPrefix?: string } = {}
  ): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(initialConfig, options);
    }
    return ConfigManager.instance;
  }

  private loadConfig(initialConfig: Partial<ServerConfig>): ServerConfig {
    // Load from environment variables
    const envConfig = this.loadFromEnv();
    
    // Merge configs with precedence: env > initial > defaults
    const mergedConfig = {
      name: 'mcp-server',
      version: '1.0.0',
      environment: 'development',
      debug: false,
      metrics: {
        enabled: true,
        interval: 60000
      },
      cache: {
        ttl: 300000, // 5 minutes
        maxSize: 1000,
        namespace: 'mcp'
      },
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
        errorMessage: 'Too many requests'
      },
      timeout: 30000,
      retries: {
        count: 3,
        backoff: 1000
      },
      ...initialConfig,
      ...envConfig
    } as const;

    // Validate merged config
    return ServerConfigSchema.parse(mergedConfig);
  }

  private loadFromEnv(): Partial<ServerConfig> {
    const config: Record<string, any> = {};

    // Helper to convert string to typed value
    const parseValue = (value: string): string | number | boolean => {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
      return value;
    };

    // Load all environment variables with prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(this.envPrefix) && value !== undefined) {
        const configKey = key
          .slice(this.envPrefix.length)
          .toLowerCase()
          .split('_')
          .reduce((acc: any, part, i) => {
            if (i === 0) return part;
            return acc + part.charAt(0).toUpperCase() + part.slice(1);
          });

        // Handle nested keys (e.g., MCP_METRICS_ENABLED)
        const parts = configKey.split('__');
        let current = config;
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = current[parts[i]] || {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = parseValue(value);
      }
    }

    return config;
  }

  get<K extends keyof ServerConfig>(key: K): ServerConfig[K] {
    return this.config[key];
  }

  getAll(): Readonly<ServerConfig> {
    return { ...this.config };
  }

  set<K extends keyof ServerConfig>(key: K, value: ServerConfig[K]): void {
    const newConfig = { ...this.config, [key]: value };
    
    // Validate new config
    ServerConfigSchema.parse(newConfig);
    
    this.config = newConfig;
    this.notifyConfigUpdate();
  }

  update(updates: Partial<ServerConfig>): void {
    const newConfig = { ...this.config, ...updates };
    
    // Validate new config
    ServerConfigSchema.parse(newConfig);
    
    this.config = newConfig;
    this.notifyConfigUpdate();
  }

  onConfigUpdate(callback: (config: ServerConfig) => void): () => void {
    this.configUpdateCallbacks.push(callback);
    return () => {
      this.configUpdateCallbacks = this.configUpdateCallbacks.filter(
        cb => cb !== callback
      );
    };
  }

  private notifyConfigUpdate(): void {
    this.configUpdateCallbacks.forEach(callback => callback(this.config));
  }

  // Feature flags
  isFeatureEnabled(feature: string): boolean {
    const envVar = `${this.envPrefix}FEATURE_${feature.toUpperCase()}`;
    return process.env[envVar] === 'true';
  }

  // Environment checks
  isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  isStaging(): boolean {
    return this.config.environment === 'staging';
  }

  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  // Validation helpers
  validateConfig<T>(schema: z.ZodSchema<T>, config: unknown): T {
    return schema.parse(config);
  }

  // Secret management
  getSecret(key: string): string | undefined {
    const envVar = `${this.envPrefix}SECRET_${key.toUpperCase()}`;
    return process.env[envVar];
  }

  requireSecret(key: string): string {
    const secret = this.getSecret(key);
    if (!secret) {
      throw new Error(`Required secret ${key} not found in environment`);
    }
    return secret;
  }
}

// Configuration decorator
export function RequireConfig(
  configManager: ConfigManager,
  validator?: (config: ServerConfig) => boolean
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const config = configManager.getAll();
      
      if (validator && !validator(config)) {
        throw new Error(
          `Invalid configuration for ${propertyKey}: ${JSON.stringify(config)}`
        );
      }
      
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

// Feature flag decorator
export function RequireFeature(
  configManager: ConfigManager,
  feature: string
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      if (!configManager.isFeatureEnabled(feature)) {
        throw new Error(`Feature ${feature} is not enabled`);
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
