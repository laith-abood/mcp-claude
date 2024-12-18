# MCP Tools Workflow Guide

This guide explains how to effectively use the MCP tools together for various tasks.

## Project Analysis and Code Review Workflow

### 1. Initial Project Analysis
```typescript
// First, analyze the project structure
await use_mcp_tool({
  server_name: "project-analyzer",
  tool_name: "analyze_project_structure",
  arguments: {
    projectPath: "/path/to/project",
    owner: "laith-abood",  // Your GitHub username
    repo: "repository-name"
  }
});

// Then analyze dependencies
await use_mcp_tool({
  server_name: "project-analyzer",
  tool_name: "analyze_dependencies",
  arguments: {
    projectPath: "/path/to/project"
  }
});
```

### 2. Code Review Strategy
```typescript
// Get recommended review strategy for changed files
await use_mcp_tool({
  server_name: "project-analyzer",
  tool_name: "suggest_review_strategy",
  arguments: {
    projectPath: "/path/to/project",
    changedFiles: [
      "src/components/Auth.tsx",
      "src/utils/api.ts"
    ]
  }
});
```

### 3. Specialized Code Reviews
```typescript
// Perform security audit
await use_mcp_tool({
  server_name: "openai",
  tool_name: "code_review",
  arguments: {
    code: "your code here",
    reviewType: "securityAudit",
    fileExtension: "ts",
    context: {
      repository: "your-repo",
      filePath: "src/components/Auth.tsx"
    }
  }
});

// Perform TypeScript analysis
await use_mcp_tool({
  server_name: "openai",
  tool_name: "code_review",
  arguments: {
    code: "your code here",
    reviewType: "typeScriptAnalysis",
    fileExtension: "ts",
    context: {
      repository: "your-repo",
      filePath: "src/utils/api.ts"
    }
  }
});
```

## GitHub Integration Workflow

### 1. Repository Operations
Always specify your GitHub username (laith-abood) when using GitHub tools:

```typescript
// Fork a repository
await use_mcp_tool({
  server_name: "github",
  tool_name: "fork_repository",
  arguments: {
    owner: "original-owner",
    repo: "repository-name"
  }
});

// Create a branch
await use_mcp_tool({
  server_name: "github",
  tool_name: "create_branch",
  arguments: {
    owner: "laith-abood",
    repo: "repository-name",
    branch: "feature/new-feature"
  }
});
```

### 2. File Operations
```typescript
// Update a file
await use_mcp_tool({
  server_name: "github",
  tool_name: "create_or_update_file",
  arguments: {
    owner: "laith-abood",
    repo: "repository-name",
    path: "src/components/NewComponent.tsx",
    content: "file content",
    message: "Add new component",
    branch: "feature/new-feature"
  }
});
```

## Best Practices

1. **Project Analysis First**
   - Always start with project analysis to understand the codebase
   - Use insights to guide review strategy
   - Consider project structure when making changes

2. **GitHub Operations**
   - Always specify 'laith-abood' as owner for your repositories
   - Use meaningful branch names and commit messages
   - Keep changes focused and atomic

3. **Code Review Process**
   - Start with project-wide analysis
   - Follow suggested review strategy
   - Use specialized reviews based on file types
   - Consider security implications for auth/API changes

4. **Directory Structure**
   - Check main directories: src/, lib/, test/
   - Review configuration files
   - Analyze package dependencies

5. **Review Types by File Location**
   - src/auth/* → Security audit
   - src/api/* → Security + Performance
   - src/components/* → Accessibility + TypeScript
   - test/* → Testing review
   - *.ts → TypeScript analysis

## Common Workflows

### New Feature Development
1. Analyze project structure
2. Create new branch
3. Implement changes
4. Run code reviews
5. Create pull request

### Code Review
1. Analyze changed files
2. Get review strategy
3. Run appropriate specialized reviews
4. Create review comments
5. Verify fixes

### Security Audit
1. Analyze project structure
2. Focus on auth/api directories
3. Run security audits
4. Check dependencies
5. Document findings

## Error Prevention

1. **GitHub Operations**
   - Always verify owner is 'laith-abood'
   - Check branch names before operations
   - Verify file paths exist

2. **Code Reviews**
   - Ensure file content is complete
   - Provide full context in review requests
   - Use correct file extensions

3. **Project Analysis**
   - Verify project path exists
   - Check for required configuration files
   - Handle missing dependencies gracefully

## Tool Selection Guide

1. **Project Understanding**
   - New to project → project-analyzer
   - Need dependencies → analyze_dependencies
   - Need structure → analyze_project_structure

2. **Code Review**
   - Security concerns → securityAudit
   - Performance issues → performanceReview
   - Type safety → typeScriptAnalysis
   - Testing → testingReview
   - Documentation → documentationReview

3. **GitHub Operations**
   - Repository management → github tools
   - File operations → create_or_update_file
   - Issue tracking → create_issue

Remember: Always start with project analysis before making changes or performing reviews. This ensures you have the proper context and understanding of the codebase.
