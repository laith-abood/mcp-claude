# MCP Servers Architecture

## Overview

The Model Context Protocol (MCP) servers project is a collection of service implementations that extend AI model capabilities through standardized interfaces. Each server provides tools and resources that can be accessed via the MCP protocol.

## Core Concepts

### Tools

Tools are executable functions that perform specific operations. They:
- Accept structured input parameters defined by JSON schemas
- Execute operations (API calls, file operations, computations, etc.)
- Return structured responses
- Can be chained together to accomplish complex tasks

### Resources

Resources represent static or dynamic data sources that can be accessed by clients:
- Static resources have fixed URIs
- Resource templates allow dynamic URI generation
- Support standard MIME types
- Can represent files, API responses, or other data sources

## Server Implementation

Each MCP server follows a standard structure:

```typescript
class ExampleServer {
  private server: Server;

  constructor() {
    // Initialize server with metadata
    this.server = new Server({
      name: "example-server",
      version: "1.0.0"
    });

    // Set up request handlers
    this.setupTools();
    this.setupResources();
  }

  private setupTools() {
    // Register tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, ...);
    this.server.setRequestHandler(CallToolRequestSchema, ...);
  }

  private setupResources() {
    // Register resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, ...);
    this.server.setRequestHandler(ReadResourceRequestSchema, ...);
  }

  async run() {
    // Start server on stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

## Communication Protocol

MCP servers communicate over stdio using a JSON-RPC inspired protocol:

1. Client sends request:
```json
{
  "jsonrpc": "2.0",
  "method": "callTool",
  "params": {
    "name": "tool_name",
    "arguments": {
      "param1": "value1"
    }
  }
}
```

2. Server responds:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "Operation result"
    }]
  }
}
```

## Error Handling

Servers use standardized error codes and messages:

```typescript
throw new McpError(
  ErrorCode.InvalidRequest,
  "Invalid parameter: expected string"
);
```

Common error codes:
- InvalidRequest: Malformed or invalid request
- MethodNotFound: Unknown tool or resource
- InvalidParams: Missing or invalid parameters
- InternalError: Server-side error
- ResourceNotFound: Requested resource doesn't exist

## Security Considerations

- Servers run with limited system access
- Environment variables for sensitive configuration
- Input validation on all parameters
- Resource access controls
- Error message sanitization

## Testing

Each server should include:
1. Unit tests for tools and resources
2. Integration tests for external services
3. Error handling tests
4. Schema validation tests

Example test structure:
```typescript
describe('ExampleServer', () => {
  let server: ExampleServer;

  beforeEach(() => {
    server = new ExampleServer();
  });

  describe('tools', () => {
    it('should list available tools', async () => {
      const response = await server.handleRequest({
        method: 'listTools'
      });
      expect(response.tools).toBeDefined();
    });
  });
});
```

## Available Servers

| Server | Description | Key Features |
|--------|-------------|--------------|
| brave-search | Brave Search API integration | Web, news, and image search |
| gdrive | Google Drive integration | File operations, search |
| github | GitHub API integration | Repository management |
| fetch | HTTP client | URL fetching, content extraction |
| filesystem | File system operations | Read/write files, directory management |
| memory | Knowledge graph storage | Entity and relation management |
| sqlite | SQLite database integration | Query execution, schema management |
| time | Timezone operations | Current time, conversions |

This architecture enables extensible AI capabilities while maintaining security, reliability, and ease of development.