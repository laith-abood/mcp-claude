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
  entities: Entity[];
  relations: Relation[];
  frequency: number;
  lastSeen: number;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  patterns?: Pattern[];
}

class KnowledgeGraphManager {
  private patterns: Map<string, Pattern> = new Map();
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private async loadGraph(): Promise<KnowledgeGraph> {
    const cacheKey = 'fullGraph';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      const graph = lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") graph.entities.push(item as Entity);
        if (item.type === "relation") graph.relations.push(item as Relation);
        return graph;
      }, { entities: [], relations: [], patterns: [] });

      this.cache.set(cacheKey, { data: graph, timestamp: Date.now() });
      return graph;
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [], patterns: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
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
    ];
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
            patterns.push({
              entities: [entity1, entity2],
              relations,
              frequency: sharedObservations.length + sharedTags.length,
              lastSeen: now
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
      )
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
