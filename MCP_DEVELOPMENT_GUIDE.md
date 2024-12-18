# MCP Server Development Guide

## Server Structure Standards

Each MCP server should follow this standard structure:

```
server-name/
├── .github/            # GitHub Actions workflows
├── docs/              # Documentation
│   └── README.md      # Server-specific documentation
├── src/               # Source code (for TypeScript servers)
├── tests/             # Test files
├── index.ts           # Main entry point (TypeScript)
├── server.py          # Main entry point (Python)
├── package.json       # Node.js package config
├── pyproject.toml     # Python package config
├── tsconfig.json      # TypeScript config
└── README.md         # Main documentation
```

## Language-Specific Standards

### TypeScript Servers
- Use TypeScript strict mode
- Include proper type definitions
- Use ES modules (`"type": "module"` in package.json)
- Implement both tools and resources where applicable
- Include comprehensive tests

### Python Servers
- Use type hints
- Follow PEP 8 style guide
- Use pyproject.toml for dependencies
- Include proper package structure
- Implement comprehensive tests

## Server Implementation Checklist

- [ ] Basic Setup
  - [ ] Proper package configuration (package.json/pyproject.toml)
  - [ ] TypeScript/Python configuration
  - [ ] GitHub Actions for CI/CD
  - [ ] Comprehensive README

- [ ] Core Implementation
  - [ ] Server class implementation
  - [ ] Tool definitions
  - [ ] Resource definitions (if applicable)
  - [ ] Error handling
  - [ ] Logging

- [ ] Testing
  - [ ] Unit tests
  - [ ] Integration tests
  - [ ] Test coverage reporting

- [ ] Documentation
  - [ ] API documentation
  - [ ] Usage examples
  - [ ] Configuration guide
  - [ ] Development guide

## Current Server Analysis

### API Integration Servers

#### OpenAI Server (TypeScript)
Status: ✅ Well-structured
- Tools:
  - openai_chat: Chat completion API integration
  - code_review: Specialized code review functionality
- Features:
  - Model selection (gpt-4o, o1)
  - Review type specialization
  - Context-aware analysis

#### GitHub Server (TypeScript)
Status: ✅ Comprehensive
- Tools:
  - Repository operations (create, fork, branch)
  - Issue management (create, update, comment)
  - Pull request handling
  - Code search functionality
  - File operations
- Features:
  - Full GitHub API integration
  - Rich search capabilities
  - Comprehensive repository management

#### GitLab Server (TypeScript)
Status: ✅ Feature Complete
- Tools:
  - Repository operations
  - Merge request handling
  - File management
  - Issue tracking
- Features:
  - Similar to GitHub server
  - GitLab-specific features

### Development Tools

#### Project Analyzer (TypeScript)
Status: ✅ New
- Tools:
  - analyze_project_structure
  - analyze_dependencies
  - suggest_review_strategy
- Features:
  - Code structure analysis
  - Dependency management
  - Review coordination

#### Filesystem Server (TypeScript)
Status: ✅ Well-structured
- Tools:
  - File operations (read, write, move)
  - Directory management
  - Search functionality
  - File info retrieval
- Features:
  - Secure file access
  - Comprehensive file operations
  - Directory traversal

### Data Management

#### Memory Server (TypeScript)
Status: ✅ Well-structured
- Tools:
  - create_entities/relations
  - add_observations
  - delete operations
  - search/query capabilities
- Features:
  - Knowledge graph operations
  - Entity management
  - Relation handling

#### PostgreSQL Server (TypeScript)
Status: ⚠️ Basic Implementation
- Tools:
  - query: Read-only SQL operations
  - Schema inspection
- Features:
  - Database connectivity
  - Safe query execution

#### SQLite Server (Python)
Status: 🚧 In Development
- Features:
  - Lightweight database operations
  - Local storage

### Integration Services

#### Slack Server (TypeScript)
Status: ✅ Feature Rich
- Tools:
  - Channel operations
  - Message handling
  - User management
  - Reaction handling
- Features:
  - Complete Slack API integration
  - Thread management
  - User profiles

#### Google Maps Server (TypeScript)
Status: ✅ Comprehensive
- Tools:
  - Geocoding operations
  - Place search/details
  - Distance calculations
  - Direction finding
- Features:
  - Full Maps API integration
  - Location services
  - Travel planning

### Browser Automation

#### Puppeteer Server (TypeScript)
Status: ✅ Well-implemented
- Tools:
  - Navigation
  - Screenshot capture
  - Element interaction
  - JavaScript evaluation
- Features:
  - Browser automation
  - Visual testing
  - Web scraping

### Search and Retrieval

#### Brave Search Server (TypeScript)
Status: ✅ Stable
- Tools:
  - Web search
  - Local search
- Features:
  - Comprehensive search
  - Local business info

#### AWS KB Retrieval Server (TypeScript)
Status: ✅ Specialized
- Tools:
  - Knowledge base retrieval
- Features:
  - AWS integration
  - Specialized search

### Utility Servers

#### Sequential Thinking Server (TypeScript)
Status: ✅ Specialized
- Tools:
  - Problem-solving framework
- Features:
  - Structured thinking
  - Dynamic analysis

#### Time Server (Python)
Status: 🚧 Basic
- Features:
  - Time operations
  - Schedule management

## Development Status Overview

### TypeScript Servers (Majority)
- Well-structured type definitions
- Consistent error handling
- Good documentation practices

### Python Servers (Minority)
- Following PEP standards
- Type hints implementation
- Integration with Python ecosystem

## Areas for Standardization

1. **Testing Coverage**
   - Add comprehensive tests to all servers
   - Implement consistent testing patterns
   - Add integration tests

2. **Documentation**
   - Standardize README format
   - Add detailed API documentation
   - Include usage examples

3. **Error Handling**
   - Implement consistent error codes
   - Add detailed error messages
   - Improve error recovery

4. **Configuration**
   - Standardize environment variables
   - Implement validation
   - Add configuration documentation

5. **Security**
   - Add input validation
   - Implement rate limiting
   - Add security documentation

## Development Guidelines

### 1. Tool Implementation
- Each tool should have:
  ```typescript
  {
    name: string;
    description: string;
    inputSchema: JSONSchema;
    outputSchema?: JSONSchema;
  }
  ```
- Clear parameter documentation
- Proper error handling
- Response formatting

### 2. Resource Implementation
- Define clear URI patterns
- Implement both static and template resources
- Handle resource updates
- Proper error states

### 3. Error Handling
```typescript
throw new McpError(
    ErrorCode.InvalidRequest,
    "Detailed error message"
);
```

### 4. Configuration
- Use environment variables for sensitive data
- Implement proper validation
- Provide clear configuration documentation

### 5. Testing
```typescript
describe('Tool: example_tool', () => {
    it('should handle valid input', async () => {
        // Test implementation
    });

    it('should handle invalid input', async () => {
        // Error handling test
    });
});
```

## Best Practices

1. **Code Organization**
   - Separate concerns (tools, resources, utils)
   - Clear file naming
   - Consistent directory structure

2. **Error Handling**
   - Use MCP error codes
   - Provide detailed error messages
   - Implement proper error recovery

3. **Documentation**
   - Clear README
   - API documentation
   - Example usage
   - Configuration guide

4. **Testing**
   - Unit tests for all tools
   - Integration tests
   - Error case coverage
   - Mock external services

5. **Security**
   - Validate all inputs
   - Sanitize outputs
   - Handle secrets properly
   - Implement rate limiting

## Development Workflow

1. **Starting a New Server**
   ```bash
   npx @modelcontextprotocol/create-server server-name
   cd server-name
   npm install
   ```

2. **Implementing Tools**
   ```typescript
   server.setRequestHandler(ListToolsRequestSchema, async () => ({
       tools: [
           {
               name: "example_tool",
               description: "Tool description",
               inputSchema: {
                   type: "object",
                   properties: {
                       // Tool parameters
                   }
               }
           }
       ]
   }));
   ```

3. **Testing**
   ```bash
   npm test
   npm run coverage
   ```

4. **Building**
   ```bash
   npm run build
   ```

## Configuration Guide

### TypeScript Server
```json
{
    "name": "@mcp/server-name",
    "version": "0.1.0",
    "type": "module",
    "main": "dist/index.js",
    "scripts": {
        "build": "tsc && shx chmod +x dist/index.js",
        "test": "jest",
        "dev": "tsx watch index.ts"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "1.0.1"
    }
}
```

### Python Server
```toml
[project]
name = "mcp-server-name"
version = "0.1.0"
dependencies = [
    "modelcontextprotocol-sdk>=1.0.1"
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

## MCP Configuration
```json
{
    "mcpServers": {
        "server-name": {
            "command": "node",
            "args": ["/path/to/server/dist/index.js"],
            "env": {
                "API_KEY": "your-api-key"
            }
        }
    }
}
```

## Common Issues and Solutions

1. **Server Not Starting**
   - Check file permissions
   - Verify environment variables
   - Check port availability

2. **Tool Execution Failing**
   - Validate input schema
   - Check error handling
   - Verify external service availability

3. **Resource Access Issues**
   - Check URI format
   - Verify access permissions
   - Validate resource existence

## Maintenance and Updates

1. **Dependency Updates**
   - Regular security audits
   - Version compatibility checks
   - Breaking change management

2. **Version Management**
   - Semantic versioning
   - Changelog maintenance
   - Deprecation notices

3. **Performance Monitoring**
   - Response time tracking
   - Error rate monitoring
   - Resource usage optimization

Remember: The goal is to maintain consistency across all MCP servers while allowing for specialized functionality where needed. Follow these guidelines to ensure your server integrates smoothly with the MCP ecosystem.
