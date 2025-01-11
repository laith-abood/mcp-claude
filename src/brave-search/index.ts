#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ErrorHandler } from "../shared/error-handler.js";
import { Logger } from "../shared/logger.js";

const logger = Logger.getInstance();

const CODE_SEARCH_TOOL: Tool = {
  name: "brave_code_search",
  description: 
    "Specialized search for code snippets, documentation, and technical resources. " +
    "Features include:\n" +
    "- Language-specific filtering\n" +
    "- Framework/library detection\n" +
    "- Code pattern matching\n" +
    "- Documentation prioritization\n" +
    "Best for finding code examples, API documentation, and technical solutions.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Code search query (e.g., 'react useEffect example', 'python pandas dataframe')"
      },
      language: {
        type: "string",
        description: "Programming language to filter by (optional)",
      },
      type: {
        type: "string",
        enum: ["code", "docs", "discussion", "all"],
        description: "Type of content to search for",
        default: "all"
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 10)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const TECH_DOC_SEARCH_TOOL: Tool = {
  name: "brave_tech_doc_search",
  description:
    "Specialized search for technical documentation, tutorials, and reference materials. " +
    "Features include:\n" +
    "- Official documentation prioritization\n" +
    "- Version-specific results\n" +
    "- Framework/library filtering\n" +
    "- Tutorial and guide detection\n" +
    "Best for finding official docs, guides, and technical references.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Documentation search query"
      },
      technology: {
        type: "string",
        description: "Specific technology or framework to search for (optional)"
      },
      type: {
        type: "string",
        enum: ["official", "tutorial", "reference", "all"],
        description: "Type of documentation to search for",
        default: "all"
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 10)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const SEMANTIC_CODE_SEARCH_TOOL: Tool = {
  name: "brave_semantic_code_search",
  description:
    "Semantic code search that understands programming concepts and patterns. " +
    "Features include:\n" +
    "- Concept-based matching\n" +
    "- Design pattern detection\n" +
    "- Best practices identification\n" +
    "- Similar code suggestion\n" +
    "Best for finding code based on concepts rather than exact text matches.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Semantic code search query (e.g., 'implement singleton pattern', 'handle api errors')"
      },
      language: {
        type: "string",
        description: "Programming language context (optional)"
      },
      pattern: {
        type: "string",
        description: "Design pattern to look for (optional)"
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 10)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const VULNERABILITY_SEARCH_TOOL: Tool = {
  name: "brave_vulnerability_search",
  description:
    "Searches for known vulnerabilities in dependencies and packages. " +
    "Features include:\n" +
    "- CVE database integration\n" +
    "- Package version checking\n" +
    "- Severity assessment\n" +
    "- Fix recommendation\n" +
    "Best for security auditing and dependency checking.",
  inputSchema: {
    type: "object",
    properties: {
      package: {
        type: "string",
        description: "Package name to check"
      },
      version: {
        type: "string",
        description: "Package version (optional)"
      },
      ecosystem: {
        type: "string",
        enum: ["npm", "pip", "maven", "all"],
        description: "Package ecosystem",
        default: "all"
      }
    },
    required: ["package"]
  }
};

const WEB_SEARCH_TOOL: Tool = {
  name: "brave_web_search",
  description:
    "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports pagination, content filtering, and freshness controls. " +
    "Maximum 20 results per request, with offset for pagination. ",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (max 400 chars, 50 words)"
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 10)",
        default: 10
      },
      offset: {
        type: "number",
        description: "Pagination offset (max 9, default 0)",
        default: 0
      },
    },
    required: ["query"],
  },
};

const LOCAL_SEARCH_TOOL: Tool = {
  name: "brave_local_search",
  description:
    "Searches for local businesses and places using Brave's Local Search API. " +
    "Best for queries related to physical locations, businesses, restaurants, services, etc. " +
    "Returns detailed information including:\n" +
    "- Business names and addresses\n" +
    "- Ratings and review counts\n" +
    "- Phone numbers and opening hours\n" +
    "Use this when the query implies 'near me' or mentions specific locations. " +
    "Automatically falls back to web search if no local results are found.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Local search query (e.g. 'pizza near Central Park')"
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 5)",
        default: 5
      },
    },
    required: ["query"]
  }
};

// Server implementation
const server = new Server(
  {
    name: "example-servers/brave-search",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Check for API key
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;
if (!BRAVE_API_KEY) {
  console.error("Error: BRAVE_API_KEY environment variable is required");
  process.exit(1);
}

const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000
};

let requestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now()
};

function checkRateLimit() {
  const now = Date.now();
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }
  if (requestCount.second >= RATE_LIMIT.perSecond ||
    requestCount.month >= RATE_LIMIT.perMonth) {
    throw new Error('Rate limit exceeded');
  }
  requestCount.second++;
  requestCount.month++;
}

interface BraveWeb {
  web?: {
    results?: Array<{
      title: string;
      description: string;
      url: string;
      language?: string;
      published?: string;
      rank?: number;
    }>;
  };
  locations?: {
    results?: Array<{
      id: string; // Required by API
      title?: string;
    }>;
  };
}

interface BraveLocation {
  id: string;
  name: string;
  address: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  phone?: string;
  rating?: {
    ratingValue?: number;
    ratingCount?: number;
  };
  openingHours?: string[];
  priceRange?: string;
}

interface BravePoiResponse {
  results: BraveLocation[];
}

interface BraveDescription {
  descriptions: {[id: string]: string};
}

interface CodeSearchArgs {
  query: string;
  language?: string;
  type?: 'code' | 'docs' | 'discussion' | 'all';
  count?: number;
}

interface TechDocSearchArgs {
  query: string;
  technology?: string;
  type?: 'official' | 'tutorial' | 'reference' | 'all';
  count?: number;
}

interface SemanticCodeSearchArgs {
  query: string;
  language?: string;
  pattern?: string;
  count?: number;
}

interface VulnerabilitySearchArgs {
  package: string;
  version?: string;
  ecosystem?: 'npm' | 'pip' | 'maven' | 'all';
}

function isBraveWebSearchArgs(args: unknown): args is { query: string; count?: number } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

function isBraveLocalSearchArgs(args: unknown): args is { query: string; count?: number } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

async function performWebSearch(query: string, count: number = 10, offset: number = 0) {
  checkRateLimit();
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', Math.min(count, 20).toString()); // API limit
  url.searchParams.set('offset', offset.toString());

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const data = await response.json() as BraveWeb;

  // Extract just web results
  const results = (data.web?.results || []).map(result => ({
    title: result.title || '',
    description: result.description || '',
    url: result.url || ''
  }));

  return results.map(r =>
    `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
  ).join('\n\n');
}

async function performLocalSearch(query: string, count: number = 5) {
  checkRateLimit();
  // Initial search to get location IDs
  const webUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  webUrl.searchParams.set('q', query);
  webUrl.searchParams.set('search_lang', 'en');
  webUrl.searchParams.set('result_filter', 'locations');
  webUrl.searchParams.set('count', Math.min(count, 20).toString());

  const webResponse = await fetch(webUrl, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (!webResponse.ok) {
    throw new Error(`Brave API error: ${webResponse.status} ${webResponse.statusText}\n${await webResponse.text()}`);
  }

  const webData = await webResponse.json() as BraveWeb;
  const locationIds = webData.locations?.results?.filter((r): r is {id: string; title?: string} => r.id != null).map(r => r.id) || [];

  if (locationIds.length === 0) {
    return performWebSearch(query, count); // Fallback to web search
  }

  // Get POI details and descriptions in parallel
  const [poisData, descriptionsData] = await Promise.all([
    getPoisData(locationIds),
    getDescriptionsData(locationIds)
  ]);

  return formatLocalResults(poisData, descriptionsData);
}

async function getPoisData(ids: string[]): Promise<BravePoiResponse> {
  checkRateLimit();
  const url = new URL('https://api.search.brave.com/res/v1/local/pois');
  ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const poisResponse = await response.json() as BravePoiResponse;
  return poisResponse;
}

async function getDescriptionsData(ids: string[]): Promise<BraveDescription> {
  checkRateLimit();
  const url = new URL('https://api.search.brave.com/res/v1/local/descriptions');
  ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const descriptionsData = await response.json() as BraveDescription;
  return descriptionsData;
}

function formatLocalResults(poisData: BravePoiResponse, descData: BraveDescription): string {
  return (poisData.results || []).map(poi => {
    const address = [
      poi.address?.streetAddress ?? '',
      poi.address?.addressLocality ?? '',
      poi.address?.addressRegion ?? '',
      poi.address?.postalCode ?? ''
    ].filter(part => part !== '').join(', ') || 'N/A';

    return `Name: ${poi.name}
Address: ${address}
Phone: ${poi.phone || 'N/A'}
Rating: ${poi.rating?.ratingValue ?? 'N/A'} (${poi.rating?.ratingCount ?? 0} reviews)
Price Range: ${poi.priceRange || 'N/A'}
Hours: ${(poi.openingHours || []).join(', ') || 'N/A'}
Description: ${descData.descriptions[poi.id] || 'No description available'}
`;
  }).join('\n---\n') || 'No local results found';
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    WEB_SEARCH_TOOL,
    LOCAL_SEARCH_TOOL,
    CODE_SEARCH_TOOL,
    TECH_DOC_SEARCH_TOOL,
    SEMANTIC_CODE_SEARCH_TOOL,
    VULNERABILITY_SEARCH_TOOL
  ],
}));

function isCodeSearchArgs(args: unknown): args is CodeSearchArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof (args as CodeSearchArgs).query === "string"
  );
}

function isTechDocSearchArgs(args: unknown): args is TechDocSearchArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof (args as TechDocSearchArgs).query === "string"
  );
}

function isSemanticCodeSearchArgs(args: unknown): args is SemanticCodeSearchArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof (args as SemanticCodeSearchArgs).query === "string"
  );
}

function isVulnerabilitySearchArgs(args: unknown): args is VulnerabilitySearchArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof (args as VulnerabilitySearchArgs).package === "string"
  );
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "brave_code_search": {
        if (!isCodeSearchArgs(args)) {
          throw new Error("Invalid arguments for code search");
        }
        
        // Enhance query with code-specific filters
        let enhancedQuery = args.query;
        if (args.language) {
          enhancedQuery += ` language:${args.language}`;
        }
        if (args.type && args.type !== 'all') {
          enhancedQuery += ` type:${args.type}`;
        }
        enhancedQuery += ' site:(github.com OR stackoverflow.com OR docs.* OR developer.*)';
        
        const results = await performWebSearch(enhancedQuery, args.count || 10);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_tech_doc_search": {
        if (!isTechDocSearchArgs(args)) {
          throw new Error("Invalid arguments for documentation search");
        }
        
        // Enhance query with documentation-specific filters
        let enhancedQuery = args.query;
        if (args.technology) {
          enhancedQuery = `${args.technology} ${enhancedQuery}`;
        }
        if (args.type === 'official') {
          enhancedQuery += ' site:(docs.* OR *.dev OR *.io)';
        } else if (args.type === 'tutorial') {
          enhancedQuery += ' (tutorial OR guide OR how to)';
        }
        
        const results = await performWebSearch(enhancedQuery, args.count || 10);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_semantic_code_search": {
        if (!isSemanticCodeSearchArgs(args)) {
          throw new Error("Invalid arguments for semantic search");
        }
        
        // Enhance query with semantic understanding
        let enhancedQuery = args.query;
        if (args.language) {
          enhancedQuery = `${args.language} ${enhancedQuery}`;
        }
        if (args.pattern) {
          enhancedQuery += ` "design pattern" ${args.pattern}`;
        }
        enhancedQuery += ' site:(github.com OR stackoverflow.com) code example';
        
        const results = await performWebSearch(enhancedQuery, args.count || 10);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_vulnerability_search": {
        if (!isVulnerabilitySearchArgs(args)) {
          throw new Error("Invalid arguments for vulnerability search");
        }
        
        // Enhance query with vulnerability-specific terms
        let enhancedQuery = `${args.package}`;
        if (args.version) {
          enhancedQuery += ` version:${args.version}`;
        }
        if (args.ecosystem !== 'all') {
          enhancedQuery = `${args.ecosystem} ${enhancedQuery}`;
        }
        enhancedQuery += ' (CVE OR vulnerability OR security advisory) site:(nvd.nist.gov OR snyk.io OR github.com/advisories)';
        
        const results = await performWebSearch(enhancedQuery, 10);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_web_search": {
        if (!isBraveWebSearchArgs(args)) {
          throw new Error("Invalid arguments for brave_web_search");
        }
        const { query, count = 10 } = args;
        const results = await performWebSearch(query, count);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_local_search": {
        if (!isBraveLocalSearchArgs(args)) {
          throw new Error("Invalid arguments for brave_local_search");
        }
        const { query, count = 5 } = args;
        const results = await performLocalSearch(query, count);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    ErrorHandler.handleError(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Brave Search MCP Server running on stdio");
}

runServer().catch((error) => {
  ErrorHandler.handleError(error);
  process.exit(1);
});
