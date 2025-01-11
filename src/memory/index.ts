#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE_PATH = path.join(__dirname, 'memory.json');

interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  lastAccessed?: number;
  accessCount?: number;
  createdAt?: number;
  updatedAt?: number;
  priority?: number;
  contextCategory?: 'core' | 'recent' | 'background';
  confidence?: number;
  source?: string;
  expiresAt?: number;
  validationStatus?: 'verified' | 'inferred' | 'uncertain';
}

interface MemoryContext {
  id: string;
  timestamp: number;
  entities: string[];
  relations: string[];
  summary: string;
  priority: number;
  category: string;
  source: string;
  validUntil?: number;
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
  strength?: number;
  metadata?: Record<string, any>;
  createdAt?: number;
  updatedAt?: number;
}

interface Pattern {
  id: string;
  entities: Entity[];
  relations: Relation[];
  frequency: number;
  lastSeen: number;
  confidence: number;
  context: string;
  category: string;
  priority: number;
  validUntil?: number;
}

interface MemoryStats {
  totalEntities: number;
  totalRelations: number;
  totalPatterns: number;
  categoryCounts: Record<string, number>;
  avgConfidence: number;
  recentAccess: number;
  storageUsage: number;
  compressionRatio: number;
  semanticClusters: number;
  temporalDensity: number;
  staleEntities: number;
  qualityScore: number;
}

interface SemanticVector {
  vector: number[];
  timestamp: number;
  source: string;
}

interface MemoryCompression {
  originalSize: number;
  compressedSize: number;
  summary: string;
  keywords: string[];
  semanticHash: string;
}

interface TemporalMetadata {
  firstSeen: number;
  lastSeen: number;
  frequency: number;
  seasonality?: {
    pattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
    confidence: number;
  };
}

interface QualityMetrics {
  completeness: number;
  consistency: number;
  recency: number;
  relevance: number;
  reliability: number;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  patterns?: Pattern[];
  contexts: MemoryContext[];
  stats: MemoryStats;
  lastOptimized?: number;
  version: string;
}

class KnowledgeGraphManager {
  private patterns: Map<string, Pattern> = new Map();
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly OPTIMIZATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CONTEXTS = 1000;

  async optimizeMemory(): Promise<void> {
    const graph = await this.loadGraph();
    const now = Date.now();

    // Remove expired contexts
    graph.contexts = graph.contexts.filter(ctx => 
      !ctx.validUntil || ctx.validUntil > now
    );

    // Sort contexts by priority
    graph.contexts.sort((a, b) => b.priority - a.priority);

    // Keep only MAX_CONTEXTS most relevant contexts
    if (graph.contexts.length > this.MAX_CONTEXTS) {
      graph.contexts = graph.contexts.slice(0, this.MAX_CONTEXTS);
    }

    // Update entity priorities based on context
    graph.entities.forEach(entity => {
      const relatedContexts = graph.contexts.filter(ctx => 
        ctx.entities.includes(entity.name)
      );
      
      if (relatedContexts.length > 0) {
        entity.priority = relatedContexts.reduce((sum, ctx) => 
          sum + ctx.priority, 0
        ) / relatedContexts.length;
      }
    });

    // Update stats
    graph.stats = this.calculateStats(graph);
    graph.lastOptimized = now;

    await this.saveGraph(graph);
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    const cacheKey = 'fullGraph';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      
      const initialGraph: KnowledgeGraph = {
        entities: [],
        relations: [],
        patterns: [],
        contexts: [],
          stats: {
            totalEntities: 0,
            totalRelations: 0,
            totalPatterns: 0,
            categoryCounts: {},
            avgConfidence: 0,
            recentAccess: 0,
            storageUsage: 0,
            compressionRatio: 1,
            semanticClusters: 0,
            temporalDensity: 0,
            staleEntities: 0,
            qualityScore: 0
          },
        version: "1.0.0"
      };

      const graph = lines.reduce((acc, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") acc.entities.push(item as Entity);
        if (item.type === "relation") acc.relations.push(item as Relation);
        if (item.type === "context") acc.contexts.push(item as MemoryContext);
        return acc;
      }, initialGraph);

      // Update stats
      graph.stats = this.calculateStats(graph);
      
      this.cache.set(cacheKey, { data: graph, timestamp: Date.now() });
      return graph;
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return {
          entities: [],
          relations: [],
          patterns: [],
          contexts: [],
          stats: {
            totalEntities: 0,
            totalRelations: 0,
            totalPatterns: 0,
            categoryCounts: {},
            avgConfidence: 0,
            recentAccess: 0,
            storageUsage: 0,
            compressionRatio: 1,
            semanticClusters: 0,
            temporalDensity: 0,
            staleEntities: 0,
            qualityScore: 0
          },
          version: "1.0.0"
        };
      }
      throw error;
    }
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const timestamp = Date.now();
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ 
        type: "entity",
        ...e,
        updatedAt: timestamp 
      })),
      ...graph.relations.map(r => JSON.stringify({ 
        type: "relation",
        ...r,
        updatedAt: timestamp 
      })),
      ...graph.contexts.map(c => JSON.stringify({
        type: "context",
        ...c,
        updatedAt: timestamp
      }))
    ];

    // Check if optimization is needed
    const now = Date.now();
    if (!graph.lastOptimized || now - graph.lastOptimized > this.OPTIMIZATION_INTERVAL) {
      await this.optimizeMemory();
      graph.lastOptimized = now;
    }
    await fs.writeFile(MEMORY_FILE_PATH, lines.join("\n"));
    this.cache.clear();
  }

  private updateEntityMetadata(entity: Entity): Entity {
    const now = Date.now();
    return {
      ...entity,
      lastAccessed: now,
      accessCount: (entity.accessCount || 0) + 1,
      updatedAt: now
    };
  }

  private calculateRelationStrength(relation: Relation, graph: KnowledgeGraph): number {
    const fromEntity = graph.entities.find(e => e.name === relation.from);
    const toEntity = graph.entities.find(e => e.name === relation.to);
    
    if (!fromEntity || !toEntity) return 0;

    // Factors affecting strength:
    // 1. Access frequency of connected entities
    const accessFactor = ((fromEntity.accessCount || 0) + (toEntity.accessCount || 0)) / 2;
    
    // 2. Recency of updates
    const recencyFactor = Math.min(
      Date.now() - (relation.createdAt || 0),
      Date.now() - (relation.updatedAt || 0)
    ) / (24 * 60 * 60 * 1000); // Convert to days

    // 3. Number of shared observations
    const sharedObservations = fromEntity.observations.filter(
      obs => toEntity.observations.includes(obs)
    ).length;

    return (accessFactor * 0.4 + (1 / recencyFactor) * 0.3 + sharedObservations * 0.3);
  }

  private calculateStats(graph: KnowledgeGraph): MemoryStats {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const categoryCounts: Record<string, number> = {};
    let totalConfidence = 0;
    let recentAccess = 0;
    let staleEntities = 0;
    let totalQuality = 0;

    // Calculate basic stats
    graph.entities.forEach(entity => {
      if (entity.contextCategory) {
        categoryCounts[entity.contextCategory] = 
          (categoryCounts[entity.contextCategory] || 0) + 1;
      }
      if (entity.confidence) {
        totalConfidence += entity.confidence;
      }
      if (entity.lastAccessed && now - entity.lastAccessed < DAY) {
        recentAccess++;
      }
      if (entity.lastAccessed && now - entity.lastAccessed > 30 * DAY) {
        staleEntities++;
      }

      // Calculate quality metrics
      const quality = this.calculateQualityMetrics(entity);
      totalQuality += (
        quality.completeness * 0.2 +
        quality.consistency * 0.2 +
        quality.recency * 0.2 +
        quality.relevance * 0.2 +
        quality.reliability * 0.2
      );
    });

    // Calculate semantic clusters using k-means
    const semanticClusters = this.calculateSemanticClusters(graph.entities);

    // Calculate temporal density
    const temporalDensity = this.calculateTemporalDensity(graph);

    // Calculate compression ratio
    const compression = this.compressMemory(graph);
    const compressionRatio = compression.originalSize / compression.compressedSize;

    return {
      totalEntities: graph.entities.length,
      totalRelations: graph.relations.length,
      totalPatterns: graph.patterns?.length || 0,
      categoryCounts,
      avgConfidence: totalConfidence / (graph.entities.length || 1),
      recentAccess,
      storageUsage: JSON.stringify(graph).length,
      compressionRatio,
      semanticClusters: semanticClusters.length,
      temporalDensity,
      staleEntities,
      qualityScore: totalQuality / (graph.entities.length || 1)
    };
  }

  private calculateQualityMetrics(entity: Entity): QualityMetrics {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Completeness: ratio of filled optional fields
    const optionalFields = ['tags', 'metadata', 'contextCategory', 'source'];
    const completeness = optionalFields.filter(field => entity[field as keyof Entity]).length / optionalFields.length;

    // Consistency: check for contradictions in observations
    const consistency = this.checkConsistency(entity.observations);

    // Recency: exponential decay based on last update
    const recency = Math.exp(-(now - (entity.updatedAt || now)) / (30 * DAY));

    // Relevance: based on access patterns and relations
    const relevance = (entity.accessCount || 0) / 100; // Normalized to 0-1

    // Reliability: based on source and validation status
    const reliability = entity.validationStatus === 'verified' ? 1 :
                       entity.validationStatus === 'inferred' ? 0.7 :
                       0.4;

    return {
      completeness,
      consistency,
      recency,
      relevance,
      reliability
    };
  }

  private checkConsistency(observations: string[]): number {
    // Simple contradiction detection using keywords
    const contradictionPairs = [
      ['always', 'never'],
      ['true', 'false'],
      ['high', 'low'],
      ['increase', 'decrease']
    ];

    let contradictions = 0;
    observations.forEach((obs, i) => {
      observations.slice(i + 1).forEach(otherObs => {
        contradictionPairs.forEach(([a, b]) => {
          if ((obs.includes(a) && otherObs.includes(b)) ||
              (obs.includes(b) && otherObs.includes(a))) {
            contradictions++;
          }
        });
      });
    });

    return Math.max(0, 1 - (contradictions / observations.length));
  }

  private calculateSemanticClusters(entities: Entity[]): Array<{
    centroid: SemanticVector;
    members: Entity[];
  }> {
    // Simplified k-means clustering based on observation similarity
    const k = Math.min(5, Math.ceil(entities.length / 10));
    const clusters: Array<{
      centroid: SemanticVector;
      members: Entity[];
    }> = [];

    // Initialize clusters with random entities
    for (let i = 0; i < k; i++) {
      const randomEntity = entities[Math.floor(Math.random() * entities.length)];
      clusters.push({
        centroid: {
          vector: this.entityToVector(randomEntity),
          timestamp: Date.now(),
          source: 'clustering'
        },
        members: []
      });
    }

    // Assign entities to nearest cluster
    entities.forEach(entity => {
      let minDistance = Infinity;
      let nearestCluster = clusters[0];

      clusters.forEach(cluster => {
        const distance = this.calculateDistance(
          this.entityToVector(entity),
          cluster.centroid.vector
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestCluster = cluster;
        }
      });

      nearestCluster.members.push(entity);
    });

    return clusters;
  }

  private entityToVector(entity: Entity): number[] {
    // Simple vector representation based on observation words
    const words = entity.observations
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 0);
    
    // Create a basic frequency vector
    const vector = new Array(100).fill(0);
    words.forEach(word => {
      const hash = this.simpleHash(word);
      vector[hash % 100]++;
    });
    
    return vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private calculateDistance(vec1: number[], vec2: number[]): number {
    return Math.sqrt(
      vec1.reduce((sum, val, i) => sum + Math.pow(val - vec2[i], 2), 0)
    );
  }

  private calculateTemporalDensity(graph: KnowledgeGraph): number {
    const now = Date.now();
    const timeWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    // Count events in time window
    const events = graph.entities
      .map(e => e.updatedAt || e.createdAt || 0)
      .concat(graph.relations.map(r => r.updatedAt || r.createdAt || 0))
      .filter(timestamp => now - timestamp < timeWindow);
    
    // Calculate density as events per day
    return events.length / 30;
  }

  private compressMemory(graph: KnowledgeGraph): MemoryCompression {
    const originalSize = JSON.stringify(graph).length;
    
    // Generate summary
    const summary = `Knowledge graph with ${graph.entities.length} entities and ${graph.relations.length} relations. ` +
      `Main categories: ${Object.keys(graph.stats.categoryCounts).join(', ')}`;
    
    // Extract keywords
    const keywords = new Set<string>();
    graph.entities.forEach(entity => {
      keywords.add(entity.entityType);
      entity.tags?.forEach(tag => keywords.add(tag));
    });
    
    // Calculate semantic hash
    const semanticHash = this.calculateSemanticHash(graph);
    
    // Estimate compressed size (actual compression would be more complex)
    const compressedSize = originalSize * 0.6;
    
    return {
      originalSize,
      compressedSize,
      summary,
      keywords: Array.from(keywords),
      semanticHash
    };
  }

  private calculateSemanticHash(graph: KnowledgeGraph): string {
    // Create a deterministic hash of the graph's semantic content
    const content = graph.entities
      .map(e => `${e.name}:${e.entityType}:${e.observations.join(',')}`)
      .sort()
      .join('|');
    
    return this.simpleHash(content).toString(16);
  }

  private detectPatterns(graph: KnowledgeGraph): Pattern[] {
    const patterns: Pattern[] = [];
    const now = Date.now();

    // Look for frequently co-occurring entities
    graph.entities.forEach(entity1 => {
      graph.entities.forEach(entity2 => {
        if (entity1.name === entity2.name) return;

        // Find relations between these entities
        const relations = graph.relations.filter(
          r => (r.from === entity1.name && r.to === entity2.name) ||
               (r.from === entity2.name && r.to === entity1.name)
        );

        if (relations.length > 0) {
          // Check for shared observations or tags
          const sharedObservations = entity1.observations.filter(
            obs => entity2.observations.includes(obs)
          );

          const sharedTags = (entity1.tags || []).filter(
            tag => (entity2.tags || []).includes(tag)
          );

          if (sharedObservations.length > 0 || sharedTags.length > 0) {
            const patternId = `pattern_${entity1.name}_${entity2.name}_${now}`;
            const confidence = (sharedObservations.length + sharedTags.length) / 
                             Math.max(entity1.observations.length, entity2.observations.length);
            
            patterns.push({
              id: patternId,
              entities: [entity1, entity2],
              relations,
              frequency: sharedObservations.length + sharedTags.length,
              lastSeen: now,
              confidence,
              context: `Pattern between ${entity1.name} and ${entity2.name}`,
              category: confidence > 0.7 ? 'strong' : confidence > 0.4 ? 'moderate' : 'weak',
              priority: confidence,
              validUntil: now + (30 * 24 * 60 * 60 * 1000) // 30 days
            });
          }
        }
      });
    });

    return patterns;
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const timestamp = Date.now();
    
    const newEntities = entities.map(e => ({
      ...e,
      createdAt: timestamp,
      updatedAt: timestamp,
      accessCount: 0,
      lastAccessed: timestamp,
      tags: e.tags || [],
      metadata: e.metadata || {}
    })).filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const timestamp = Date.now();
    
    const newRelations = relations.map(r => ({
      ...r,
      createdAt: timestamp,
      updatedAt: timestamp,
      strength: 1,
      metadata: r.metadata || {}
    })).filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType
    ));
    
    graph.relations.push(...newRelations);
    
    // Update relation strengths
    graph.relations = graph.relations.map(r => ({
      ...r,
      strength: this.calculateRelationStrength(r, graph)
    }));
    
    await this.saveGraph(graph);
    return newRelations;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: { from: string; to: string; relationType: string }[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map((o: { entityName: string; contents: string[] }) => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      
      // Update entity metadata
      Object.assign(entity, this.updateEntityMetadata(entity));
      
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    
    // Update patterns after adding observations
    graph.patterns = this.detectPatterns(graph);
    
    await this.saveGraph(graph);
    return results;
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Enhanced search with pattern matching and metadata
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase())) ||
      (e.tags || []).some(t => t.toLowerCase().includes(query.toLowerCase())) ||
      Object.values(e.metadata || {}).some(v => 
        typeof v === 'string' && v.toLowerCase().includes(query.toLowerCase())
      )
    );
    
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
    
    // Include relations with strength above threshold
    const filteredRelations = graph.relations.filter(r => 
      (filteredEntityNames.has(r.from) || filteredEntityNames.has(r.to)) &&
      (r.strength || 0) > 0.5
    );
    
    // Update access metadata for matched entities
    filteredEntities.forEach(e => Object.assign(e, this.updateEntityMetadata(e)));
    
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
      patterns: graph.patterns?.filter(p => 
        p.entities.some(e => filteredEntityNames.has(e.name))
      ),
      contexts: graph.contexts.filter(ctx =>
        ctx.entities.some(e => filteredEntityNames.has(e))
      ),
      stats: this.calculateStats({
        entities: filteredEntities,
        relations: filteredRelations,
        patterns: graph.patterns || [],
        contexts: graph.contexts,
        stats: graph.stats,
        version: graph.version
      }),
      version: graph.version
    };
    
    await this.saveGraph(graph); // Save updated access metadata
    return filteredGraph;
  }

  async analyzeRelationships(entityName: string): Promise<any> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }

    const directRelations = graph.relations.filter(
      r => r.from === entityName || r.to === entityName
    );

    const connectedEntities = graph.entities.filter(e =>
      directRelations.some(r => r.from === e.name || r.to === e.name)
    );

    const patterns = graph.patterns?.filter(p =>
      p.entities.some(e => e.name === entityName)
    );

    return {
      entity,
      directRelations: directRelations.map(r => ({
        ...r,
        strength: this.calculateRelationStrength(r, graph)
      })),
      connectedEntities,
      patterns
    };
  }

  async findSimilarEntities(entityName: string): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }

    return graph.entities
      .filter(e => e.name !== entityName)
      .map(e => {
        const sharedObservations = entity.observations.filter(
          obs => e.observations.includes(obs)
        ).length;
        const sharedTags = (entity.tags || []).filter(
          tag => (e.tags || []).includes(tag)
        ).length;
        const sharedRelations = graph.relations.filter(
          r => (r.from === entity.name && r.to === e.name) ||
               (r.from === e.name && r.to === entity.name)
        ).length;

        return {
          entity: e,
          similarity: sharedObservations * 0.4 + sharedTags * 0.3 + sharedRelations * 0.3
        };
      })
      .filter(result => result.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .map(result => result.entity);
  }

  async getEntityTimeline(entityName: string): Promise<any> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }

    const relatedEvents = [
      {
        type: 'created',
        timestamp: entity.createdAt,
        details: 'Entity created'
      },
      {
        type: 'updated',
        timestamp: entity.updatedAt,
        details: 'Last updated'
      },
      {
        type: 'accessed',
        timestamp: entity.lastAccessed,
        details: `Accessed ${entity.accessCount} times`
      }
    ];

    const relationEvents = graph.relations
      .filter(r => r.from === entityName || r.to === entityName)
      .map(r => ({
        type: 'relation',
        timestamp: r.createdAt,
        details: `Relation ${r.relationType} with ${r.from === entityName ? r.to : r.from}`
      }));

    return [...relatedEvents, ...relationEvents]
      .filter(event => event.timestamp)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();

const server = new Server({
  name: "memory-server",
  version: "1.1.0",
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "optimize_memory",
      description: "Optimize memory storage by cleaning up old contexts and updating priorities",
      inputSchema: {
        type: "object",
        properties: {},
      }
    },
    {
      name: "get_memory_stats",
      description: "Get statistics about the current memory state",
      inputSchema: {
        type: "object",
        properties: {},
      }
    },
    {
      name: "create_context",
      description: "Create a new memory context",
      inputSchema: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: { type: "string" },
            description: "Entity names involved in this context"
          },
          summary: {
            type: "string",
            description: "Summary of the context"
          },
          category: {
            type: "string",
            description: "Context category (core, recent, background)"
          },
          priority: {
            type: "number",
            description: "Initial priority (0-1)"
          },
          source: {
            type: "string",
            description: "Source of the context"
          },
          validUntil: {
            type: "number",
            description: "Optional timestamp when this context expires"
          }
        },
        required: ["entities", "summary", "category", "priority", "source"]
      }
    },
    {
      name: "create_entities",
      description: "Create multiple new entities in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "The name of the entity" },
                entityType: { type: "string", description: "The type of the entity" },
                observations: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "An array of observation contents associated with the entity"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional tags for categorizing the entity"
                },
                metadata: {
                  type: "object",
                  description: "Optional metadata for the entity"
                }
              },
              required: ["name", "entityType", "observations"],
            },
          },
        },
        required: ["entities"],
      },
    },
    {
      name: "create_relations",
      description: "Create multiple new relations between entities in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          relations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "string", description: "The name of the entity where the relation starts" },
                to: { type: "string", description: "The name of the entity where the relation ends" },
                relationType: { type: "string", description: "The type of the relation" },
                metadata: {
                  type: "object",
                  description: "Optional metadata for the relation"
                }
              },
              required: ["from", "to", "relationType"],
            },
          },
        },
        required: ["relations"],
      },
    },
    {
      name: "analyze_relationships",
      description: "Analyze relationships and patterns for a specific entity",
      inputSchema: {
        type: "object",
        properties: {
          entityName: { type: "string", description: "The name of the entity to analyze" }
        },
        required: ["entityName"],
      },
    },
    {
      name: "find_similar_entities",
      description: "Find entities similar to a given entity based on observations, tags, and relations",
      inputSchema: {
        type: "object",
        properties: {
          entityName: { type: "string", description: "The name of the entity to find similar entities for" }
        },
        required: ["entityName"],
      },
    },
    {
      name: "get_entity_timeline",
      description: "Get a timeline of events related to an entity",
      inputSchema: {
        type: "object",
        properties: {
          entityName: { type: "string", description: "The name of the entity to get timeline for" }
        },
        required: ["entityName"],
      },
    },
    {
      name: "add_observations",
      description: "Add new observations to existing entities in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          observations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                entityName: { type: "string", description: "The name of the entity to add the observations to" },
                contents: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "An array of observation contents to add"
                },
              },
              required: ["entityName", "contents"],
            },
          },
        },
        required: ["observations"],
      },
    },
    {
      name: "delete_entities",
      description: "Delete multiple entities and their associated relations from the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          entityNames: { 
            type: "array", 
            items: { type: "string" },
            description: "An array of entity names to delete" 
          },
        },
        required: ["entityNames"],
      },
    },
    {
      name: "delete_observations",
      description: "Delete specific observations from entities in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          deletions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                entityName: { type: "string", description: "The name of the entity containing the observations" },
                observations: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "An array of observations to delete"
                },
              },
              required: ["entityName", "observations"],
            },
          },
        },
        required: ["deletions"],
      },
    },
    {
      name: "delete_relations",
      description: "Delete multiple relations from the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          relations: { 
            type: "array", 
            items: {
              type: "object",
              properties: {
                from: { type: "string", description: "The name of the entity where the relation starts" },
                to: { type: "string", description: "The name of the entity where the relation ends" },
                relationType: { type: "string", description: "The type of the relation" },
              },
              required: ["from", "to", "relationType"],
            },
            description: "An array of relations to delete" 
          },
        },
        required: ["relations"],
      },
    },
    {
      name: "read_graph",
      description: "Read the entire knowledge graph",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "search_nodes",
      description: "Search for nodes in the knowledge graph based on a query",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
        },
        required: ["query"],
      },
    },
    {
      name: "open_nodes",
      description: "Open specific nodes in the knowledge graph by their names",
      inputSchema: {
        type: "object",
        properties: {
          names: {
            type: "array",
            items: { type: "string" },
            description: "An array of entity names to retrieve",
          },
        },
        required: ["names"],
      },
    }
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  try {
    switch (name) {
      case "create_entities":
        if (!Array.isArray(args.entities) || !args.entities.every(e => 
          typeof e === "object" && e !== null &&
          typeof e.name === "string" &&
          typeof e.entityType === "string" &&
          Array.isArray(e.observations) &&
          e.observations.every((o: string) => typeof o === "string")
        )) {
          throw new Error("Invalid entities format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities), null, 2) }] };

      case "create_relations":
        if (!Array.isArray(args.relations) || !args.relations.every(r =>
          typeof r === "object" && r !== null &&
          typeof r.from === "string" &&
          typeof r.to === "string" &&
          typeof r.relationType === "string"
        )) {
          throw new Error("Invalid relations format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations), null, 2) }] };

      case "analyze_relationships":
        if (typeof args.entityName !== "string") {
          throw new Error("Invalid entityName format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.analyzeRelationships(args.entityName), null, 2) }] };

      case "find_similar_entities":
        if (typeof args.entityName !== "string") {
          throw new Error("Invalid entityName format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.findSimilarEntities(args.entityName), null, 2) }] };

      case "get_entity_timeline":
        if (typeof args.entityName !== "string") {
          throw new Error("Invalid entityName format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.getEntityTimeline(args.entityName), null, 2) }] };
      case "add_observations":
        if (!Array.isArray(args.observations) || !args.observations.every((o: { entityName: string; contents: string[] }) =>
          typeof o === "object" && o !== null &&
          typeof o.entityName === "string" &&
          Array.isArray(o.contents) &&
          o.contents.every(c => typeof c === "string")
        )) {
          throw new Error("Invalid observations format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations), null, 2) }] };

      case "delete_entities":
        if (!Array.isArray(args.entityNames) || !args.entityNames.every(n => typeof n === "string")) {
          throw new Error("Invalid entityNames format");
        }
        await knowledgeGraphManager.deleteEntities(args.entityNames);
        return { content: [{ type: "text", text: "Entities deleted successfully" }] };

      case "delete_observations":
        if (!Array.isArray(args.deletions) || !args.deletions.every((d: { entityName: string; observations: string[] }) =>
          typeof d === "object" && d !== null &&
          typeof d.entityName === "string" &&
          Array.isArray(d.observations) &&
          d.observations.every(o => typeof o === "string")
        )) {
          throw new Error("Invalid deletions format");
        }
        await knowledgeGraphManager.deleteObservations(args.deletions);
        return { content: [{ type: "text", text: "Observations deleted successfully" }] };

      case "delete_relations":
        if (!Array.isArray(args.relations) || !args.relations.every((r: { from: string; to: string; relationType: string }) =>
          typeof r === "object" && r !== null &&
          typeof r.from === "string" &&
          typeof r.to === "string" &&
          typeof r.relationType === "string"
        )) {
          throw new Error("Invalid relations format");
        }
        await knowledgeGraphManager.deleteRelations(args.relations);
        return { content: [{ type: "text", text: "Relations deleted successfully" }] };

      case "read_graph":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };

      case "search_nodes":
        if (typeof args.query !== "string") {
          throw new Error("Invalid query format");
        }
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query), null, 2) }] };

      case "open_nodes":
        if (!Array.isArray(args.names) || !args.names.every(n => typeof n === "string")) {
          throw new Error("Invalid names format");
        }
        const graph = await knowledgeGraphManager.readGraph();
        const names = args.names as string[];
        const filteredEntities = graph.entities.filter((e: Entity) => names.includes(e.name));
        const filteredEntityNames = new Set(filteredEntities.map((e: Entity) => e.name));
        const filteredRelations = graph.relations.filter((r: Relation) => 
          filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
        );
        return { content: [{ type: "text", text: JSON.stringify({
          entities: filteredEntities,
          relations: filteredRelations
        }, null, 2) }] };

      case "optimize_memory":
        await knowledgeGraphManager.optimizeMemory();
        return { content: [{ type: "text", text: "Memory optimization completed successfully" }] };

      case "get_memory_stats":
        const stats = (await knowledgeGraphManager.readGraph()).stats;
        return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };

      case "create_context": {
        if (!Array.isArray(args.entities) || !args.entities.every(e => typeof e === "string") ||
            typeof args.summary !== "string" ||
            typeof args.category !== "string" ||
            typeof args.priority !== "number" ||
            typeof args.source !== "string") {
          throw new Error("Invalid context creation parameters");
        }

        const validUntil = args.validUntil ? Number(args.validUntil) : undefined;

        const context: MemoryContext = {
          id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          entities: args.entities,
          relations: [],
          summary: args.summary,
          category: args.category,
          priority: args.priority,
          source: args.source,
          validUntil
        };

        const currentGraph = await knowledgeGraphManager.readGraph();
        currentGraph.contexts.push(context);
        await knowledgeGraphManager.saveGraph(currentGraph);

        return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
