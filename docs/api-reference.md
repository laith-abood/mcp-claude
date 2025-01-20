# API Reference

This document details the tools and resources provided by each MCP server implementation.

## Brave Search Server

### Tools

#### `get_web_results`
Search web content via Brave Search API.

```typescript
interface WebSearchParams {
  query: string;        // Search query
  count?: number;       // Number of results (1-20)
  offset?: number;      // Pagination offset
}
```

#### `get_news_results`
Search news articles via Brave Search API.

```typescript
interface NewsSearchParams {
  query: string;        // Search query
  count?: number;       // Number of results
  offset?: number;      // Pagination offset
}
```

## GitHub Server

### Tools

#### `create_or_update_file`
Create or update a file in a GitHub repository.

```typescript
interface GitHubFileParams {
  owner: string;        // Repository owner
  repo: string;         // Repository name
  path: string;         // File path
  content: string;      // File content
  message: string;      // Commit message
  branch: string;       // Target branch
  sha?: string;         // File SHA (required for updates)
}
```

#### `create_pull_request`
Create a new pull request.

```typescript
interface PullRequestParams {
  owner: string;        // Repository owner
  repo: string;         // Repository name
  title: string;        // PR title
  body: string;         // PR description
  head: string;         // Source branch
  base: string;        // Target branch
  draft?: boolean;     // Create as draft PR
}
```

## Google Drive Server

### Tools

#### `search`
Search files in Google Drive.

```typescript
interface DriveSearchParams {
  query: string;        // Search query
}
```

#### `get_workbook_data`
Get data from all sheets in a workbook.

```typescript
interface WorkbookParams {
  fileId: string;       // Google Sheet ID
}
```

## Memory Server

### Tools

#### `create_entities`
Create entities in the knowledge graph.

```typescript
interface EntityCreationParams {
  entities: Array<{
    name: string;           // Entity name
    entityType: string;     // Entity type
    observations: string[]; // Entity observations
  }>;
}
```

#### `create_relations`
Create relations between entities.

```typescript
interface RelationParams {
  relations: Array<{
    from: string;          // Source entity
    to: string;           // Target entity
    relationType: string; // Relation type
  }>;
}
```

## Filesystem Server

### Tools

#### `read_file`
Read file contents.

```typescript
interface ReadFileParams {
  path: string;         // File path
}
```

#### `write_file`
Write content to a file.

```typescript
interface WriteFileParams {
  path: string;         // File path
  content: string;      // File content
}
```

#### `list_directory`
List directory contents.

```typescript
interface ListDirParams {
  path: string;         // Directory path
}
```

## Time Server

### Tools

#### `get_current_time`
Get current time in a specific timezone.

```typescript
interface TimeParams {
  timezone: string;     // IANA timezone name
}
```

#### `convert_time`
Convert time between timezones.

```typescript
interface TimeConversionParams {
  source_timezone: string;  // Source timezone
  target_timezone: string;  // Target timezone
  time: string;            // Time to convert (HH:MM)
}
```

## SQLite Server

### Tools

#### `read_query`
Execute a SELECT query.

```typescript
interface QueryParams {
  query: string;        // SQL SELECT query
}
```

#### `write_query`
Execute an INSERT/UPDATE/DELETE query.

```typescript
interface WriteQueryParams {
  query: string;        // SQL modification query
}
```

## Resource URI Templates

### Google Drive
- `gdrive:///{fileId}` - Access specific Google Drive file

### GitHub
- `github://{owner}/{repo}/contents/{path}` - Access repository content
- `github://{owner}/{repo}/issues/{number}` - Access specific issue

### Memory
- `memory:///entity/{name}` - Access entity by name
- `memory:///relation/{id}` - Access relation by ID

For detailed error codes, response formats, and additional parameters, consult each server's source code and README.