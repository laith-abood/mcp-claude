# MCP Servers List

This document provides a comprehensive list of all available MCP servers and their capabilities.

## Core Servers

### Brave Search
- **Purpose**: Web search integration
- **Features**: Web, news, and image search capabilities
- **Implementation**: TypeScript
- **Location**: `src/brave-search/`

### GitHub
- **Purpose**: GitHub API integration
- **Features**: Repository management, file operations, issues/PRs
- **Implementation**: TypeScript
- **Location**: `src/github/`

### GitLab
- **Purpose**: GitLab API integration
- **Features**: Repository and project management
- **Implementation**: TypeScript
- **Location**: `src/gitlab/`

### Google Drive
- **Purpose**: Google Drive integration
- **Features**: File operations, document management, sheets API
- **Implementation**: TypeScript
- **Location**: `src/gdrive/`

### Google Maps
- **Purpose**: Location and mapping services
- **Features**: Geocoding, places, directions
- **Implementation**: TypeScript
- **Location**: `src/google-maps/`

## Developer Tools

### Everything
- **Purpose**: Universal development tools
- **Features**: Code analysis, dependency tracking, type inference
- **Implementation**: TypeScript
- **Location**: `src/everything/`

### Filesystem
- **Purpose**: File system operations
- **Features**: File/directory management, content operations
- **Implementation**: TypeScript
- **Location**: `src/filesystem/`

### Git
- **Purpose**: Git operations
- **Features**: Repository management, commit operations
- **Implementation**: Python
- **Location**: `src/git/`

### Sequential Thinking
- **Purpose**: Problem-solving assistance
- **Features**: Thought process tracking, solution verification
- **Implementation**: TypeScript
- **Location**: `src/sequentialthinking/`

## Data Management

### AWS KB Retrieval
- **Purpose**: AWS knowledge base integration
- **Features**: Document retrieval and search
- **Implementation**: TypeScript
- **Location**: `src/aws-kb-retrieval-server/`

### Memory
- **Purpose**: Knowledge graph storage
- **Features**: Entity and relation management, vector storage
- **Implementation**: TypeScript
- **Location**: `src/memory/`

### PostgreSQL
- **Purpose**: PostgreSQL database integration
- **Features**: Query execution, schema management
- **Implementation**: TypeScript
- **Location**: `src/postgres/`

### SQLite
- **Purpose**: SQLite database integration
- **Features**: Query execution, local data storage
- **Implementation**: Python
- **Location**: `src/sqlite/`

## Utilities

### Fetch
- **Purpose**: HTTP client
- **Features**: URL fetching, content extraction
- **Implementation**: Python
- **Location**: `src/fetch/`

### Time
- **Purpose**: Time operations
- **Features**: Timezone conversion, current time
- **Implementation**: Python
- **Location**: `src/time/`

## Integration Services

### EverArt
- **Purpose**: Art and design integration
- **Features**: Art generation, style transfer
- **Implementation**: TypeScript
- **Location**: `src/everart/`

### Phi4
- **Purpose**: Phi-2 model integration
- **Features**: Text generation, model interaction
- **Implementation**: TypeScript
- **Location**: `src/phi4/`

### Puppeteer
- **Purpose**: Browser automation
- **Features**: Web scraping, page interaction
- **Implementation**: TypeScript
- **Location**: `src/puppeteer/`

### Sentry
- **Purpose**: Error tracking
- **Features**: Error monitoring, performance tracking
- **Implementation**: Python
- **Location**: `src/sentry/`

### Slack
- **Purpose**: Slack integration
- **Features**: Message sending, channel management
- **Implementation**: TypeScript
- **Location**: `src/slack/`

## Implementation Summary

### TypeScript Servers
- aws-kb-retrieval-server
- brave-search
- everart
- everything
- filesystem
- gdrive
- github
- gitlab
- google-maps
- memory
- phi4
- postgres
- puppeteer
- sequentialthinking
- slack

### Python Servers
- fetch
- git
- sentry
- sqlite
- time

Each server follows the MCP protocol for standardized communication and provides specific tools and resources for extending AI model capabilities. See individual server documentation for detailed setup and usage instructions.