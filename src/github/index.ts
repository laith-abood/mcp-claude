#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import fetch, { RequestInit } from "node-fetch";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'fs';
import { BaseMcpServer, LogMethod } from '../shared/index.js';
import * as schemas from './schemas.js';

type Environment = 'development' | 'staging' | 'production';

class GitHubServer extends BaseMcpServer {
  private server: Server;
  private readonly baseUrl = 'https://api.github.com';
  private readonly userAgent = 'github-mcp-server';

  constructor() {
    super({
      service: 'github',
      environment: (process.env.NODE_ENV || 'development') as Environment
    });

    this.server = new Server(
      {
        name: "github-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.server.onerror = (error) => this.logger.error('Server error', error);
  }

  @LogMethod()
  protected async initialize(): Promise<void> {
    const token = this.getSecret('GITHUB_PERSONAL_ACCESS_TOKEN');
    if (!token) {
      throw new McpError(ErrorCode.InvalidRequest, 'GitHub token not configured');
    }

    this.setupRequestHandlers();
    await this.setupTransport();
    this.logger.info('GitHub server initialized');
  }

  @LogMethod()
  protected async shutdown(): Promise<void> {
    await this.server.close();
    this.logger.info('GitHub server shut down');
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_or_update_file',
          description: 'Create or update a single file in a GitHub repository',
          inputSchema: zodToJsonSchema(schemas.CreateOrUpdateFileSchema)
        },
        {
          name: 'search_repositories',
          description: 'Search for GitHub repositories',
          inputSchema: zodToJsonSchema(schemas.SearchRepositoriesSchema)
        },
        {
          name: 'create_repository',
          description: 'Create a new GitHub repository in your account',
          inputSchema: zodToJsonSchema(schemas.CreateRepositorySchema)
        },
        {
          name: 'get_file_contents',
          description: 'Get the contents of a file or directory from a GitHub repository',
          inputSchema: zodToJsonSchema(schemas.GetFileContentsSchema)
        },
        {
          name: 'push_files',
          description: 'Push multiple files to a GitHub repository in a single commit',
          inputSchema: zodToJsonSchema(schemas.PushFilesSchema)
        },
        {
          name: 'create_issue',
          description: 'Create a new issue in a GitHub repository',
          inputSchema: zodToJsonSchema(schemas.CreateIssueSchema)
        },
        {
          name: 'create_pull_request',
          description: 'Create a new pull request in a GitHub repository',
          inputSchema: zodToJsonSchema(schemas.CreatePullRequestSchema)
        },
        {
          name: 'fork_repository',
          description: 'Fork a GitHub repository to your account',
          inputSchema: zodToJsonSchema(schemas.ForkRepositorySchema)
        },
        {
          name: 'create_branch',
          description: 'Create a new branch in a GitHub repository',
          inputSchema: zodToJsonSchema(schemas.CreateBranchSchema)
        },
        {
          name: 'analyze_code_quality',
          description: 'Analyze code quality metrics for a repository',
          inputSchema: zodToJsonSchema(schemas.AnalyzeCodeQualitySchema)
        },
        {
          name: 'security_scan',
          description: 'Perform security scanning on repository code',
          inputSchema: zodToJsonSchema(schemas.SecurityScanSchema)
        },
        {
          name: 'create_release',
          description: 'Create a new release with optional assets',
          inputSchema: zodToJsonSchema(schemas.CreateReleaseSchema)
        },
        {
          name: 'generate_changelog',
          description: 'Generate a changelog from commit history',
          inputSchema: zodToJsonSchema(schemas.GenerateChangelogSchema)
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await this.withRateLimit(`github:${request.params.name}`, async () => {
          const result = await this.handleToolCall(request.params.name, request.params.arguments);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        });
      } catch (error) {
        this.logger.error('Tool call failed', error as Error);
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true
        };
      }
    });
  }

  private async setupTransport(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Server transport connected');
  }

  @LogMethod()
  private async handleToolCall(name: string, args: unknown): Promise<unknown> {
    switch (name) {
      case 'create_or_update_file':
        return this.createOrUpdateFile(schemas.CreateOrUpdateFileSchema.parse(args));
      case 'search_repositories':
        return this.searchRepositories(schemas.SearchRepositoriesSchema.parse(args));
      case 'create_repository':
        return this.createRepository(schemas.CreateRepositorySchema.parse(args));
      case 'get_file_contents':
        return this.getFileContents(schemas.GetFileContentsSchema.parse(args));
      case 'push_files':
        return this.pushFiles(schemas.PushFilesSchema.parse(args));
      case 'create_issue':
        return this.createIssue(schemas.CreateIssueSchema.parse(args));
      case 'create_pull_request':
        return this.createPullRequest(schemas.CreatePullRequestSchema.parse(args));
      case 'fork_repository':
        return this.forkRepository(schemas.ForkRepositorySchema.parse(args));
      case 'create_branch':
        return this.createBranch(schemas.CreateBranchSchema.parse(args));
      case 'analyze_code_quality':
        return this.analyzeCodeQuality(schemas.AnalyzeCodeQualitySchema.parse(args));
      case 'security_scan':
        return this.securityScan(schemas.SecurityScanSchema.parse(args));
      case 'create_release':
        return this.createRelease(schemas.CreateReleaseSchema.parse(args));
      case 'generate_changelog':
        return this.generateChangelog(schemas.GenerateChangelogSchema.parse(args));
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  @LogMethod()
  private async githubRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = this.getSecret('GITHUB_PERSONAL_ACCESS_TOKEN');

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': this.userAgent,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new McpError(
        ErrorCode.InvalidRequest,
        `GitHub API error: ${(error as { message: string }).message}`
      );
    }

    return response.json() as Promise<T>;
  }

  // Tool implementations
  private async createOrUpdateFile(params: z.infer<typeof schemas.CreateOrUpdateFileSchema>) {
    return this.githubRequest<schemas.GitHubCreateUpdateFileResponse>(
      `/repos/${params.owner}/${params.repo}/contents/${params.path}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: params.message,
          content: Buffer.from(params.content).toString('base64'),
          branch: params.branch,
          sha: params.sha
        })
      }
    );
  }

  private async searchRepositories(params: z.infer<typeof schemas.SearchRepositoriesSchema>) {
    return this.githubRequest<schemas.GitHubSearchResponse>(
      `/search/repositories?q=${encodeURIComponent(params.query)}` +
      `&page=${params.page || 1}&per_page=${params.perPage || 30}`
    );
  }

  private async createRepository(params: z.infer<typeof schemas.CreateRepositorySchema>) {
    return this.githubRequest<schemas.GitHubRepository>(
      '/user/repos',
      {
        method: 'POST',
        body: JSON.stringify(params)
      }
    );
  }

  private async getFileContents(params: z.infer<typeof schemas.GetFileContentsSchema>) {
    const path = params.path ? `/${params.path}` : '';
    const query = params.branch ? `?ref=${params.branch}` : '';
    return this.githubRequest<schemas.GitHubContent>(
      `/repos/${params.owner}/${params.repo}/contents${path}${query}`
    );
  }

  private async pushFiles(params: z.infer<typeof schemas.PushFilesSchema>) {
    // First get the latest commit SHA
    const refResponse = await this.githubRequest<schemas.GitHubReference>(
      `/repos/${params.owner}/${params.repo}/git/refs/heads/${params.branch}`
    );

    // Create a tree with the new files
    const tree = await this.githubRequest<schemas.GitHubTree>(
      `/repos/${params.owner}/${params.repo}/git/trees`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_tree: refResponse.object.sha,
          tree: params.files.map(file => ({
            path: file.path,
            mode: '100644',
            type: 'blob',
            content: file.content
          }))
        })
      }
    );

    // Create a commit
    const commit = await this.githubRequest<schemas.GitHubCommit>(
      `/repos/${params.owner}/${params.repo}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: params.message,
          tree: tree.sha,
          parents: [refResponse.object.sha]
        })
      }
    );

    // Update the reference
    return this.githubRequest(
      `/repos/${params.owner}/${params.repo}/git/refs/heads/${params.branch}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: commit.sha
        })
      }
    );
  }

  private async createIssue(params: z.infer<typeof schemas.CreateIssueSchema>) {
    return this.githubRequest<schemas.GitHubIssue>(
      `/repos/${params.owner}/${params.repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify(params)
      }
    );
  }

  private async createPullRequest(params: z.infer<typeof schemas.CreatePullRequestSchema>) {
    return this.githubRequest<schemas.GitHubPullRequest>(
      `/repos/${params.owner}/${params.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify(params)
      }
    );
  }

  private async forkRepository(params: z.infer<typeof schemas.ForkRepositorySchema>) {
    return this.githubRequest<schemas.GitHubFork>(
      `/repos/${params.owner}/${params.repo}/forks`,
      {
        method: 'POST',
        body: JSON.stringify({
          organization: params.organization
        })
      }
    );
  }

  private async createBranch(params: z.infer<typeof schemas.CreateBranchSchema>) {
    // Get the SHA of the source branch
    const sourceRef = await this.githubRequest<schemas.GitHubReference>(
      `/repos/${params.owner}/${params.repo}/git/refs/heads/${params.from_branch || 'main'}`
    );

    // Create the new branch
    return this.githubRequest<schemas.GitHubReference>(
      `/repos/${params.owner}/${params.repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${params.branch}`,
          sha: sourceRef.object.sha
        })
      }
    );
  }

  private async analyzeCodeQuality(params: z.infer<typeof schemas.AnalyzeCodeQualitySchema>) {
    // Get repository contents
    const contents = await this.githubRequest<schemas.GitHubContent[]>(
      `/repos/${params.owner}/${params.repo}/contents${params.paths ? '/' + params.paths.join(',') : ''}?ref=${params.ref}`
    );

    // Analyze code metrics
    const metrics: schemas.CodeQualityMetrics = {
      complexity: 0,
      maintainability: 0,
      duplication: 0,
      lintIssues: []
    };

    // Process each file
    const fileContents = Array.isArray(contents) ? contents : [contents];
    for (const file of fileContents) {
      if ('type' in file && file.type === 'file' && 'download_url' in file && file.download_url) {
        const response = await fetch(file.download_url);
        const content = await response.text();

        // Calculate metrics
        metrics.complexity += this.calculateComplexity(content);
        metrics.maintainability += this.calculateMaintainability(content);
        metrics.duplication += this.detectDuplication(content);
        metrics.lintIssues.push(...this.lintCode(file.path, content));
      }
    }

    return metrics;
  }

  private async securityScan(params: z.infer<typeof schemas.SecurityScanSchema>) {
    const vulnerabilities: schemas.SecurityVulnerability[] = [];

    // Get repository contents
    const contents = await this.githubRequest<schemas.GitHubContent[]>(
      `/repos/${params.owner}/${params.repo}/contents${params.paths ? '/' + params.paths.join(',') : ''}?ref=${params.ref}`
    );

    // Process each scan type
    for (const scanType of params.scan_type) {
      switch (scanType) {
        case 'dependency':
          vulnerabilities.push(...await this.scanDependencies(params.owner, params.repo, params.ref));
          break;
        case 'sast':
          vulnerabilities.push(...await this.scanSourceCode(contents));
          break;
        case 'secret':
          vulnerabilities.push(...await this.scanSecrets(contents));
          break;
      }
    }

    return vulnerabilities;
  }

  private async createRelease(params: z.infer<typeof schemas.CreateReleaseSchema>) {
    // Create the release
    const release = await this.githubRequest<schemas.GitHubRelease>(
      `/repos/${params.owner}/${params.repo}/releases`,
      {
        method: 'POST',
        body: JSON.stringify({
          tag_name: params.tag_name,
          target_commitish: params.target_commitish || 'main',
          name: params.name || params.tag_name,
          body: params.body || '',
          draft: params.draft || false,
          prerelease: params.prerelease || false,
          generate_release_notes: params.generate_release_notes || false
        })
      }
    );

    // Upload assets if provided
    if (params.assets) {
      for (const asset of params.assets) {
        const content = await fs.readFile(asset.path);
        await this.githubRequest(
          release.upload_url.replace('{?name,label}', ''),
          {
            method: 'POST',
            body: content,
            headers: {
              'Content-Type': asset.content_type || 'application/octet-stream',
              'Content-Length': content.length.toString()
            }
          }
        );
      }
    }

    return release;
  }

  private async generateChangelog(params: z.infer<typeof schemas.GenerateChangelogSchema>) {
    // Get commits between tags
    const commits = await this.githubRequest<schemas.GitHubListCommits>(
      `/repos/${params.owner}/${params.repo}/commits?` +
      (params.from_tag ? `since=${params.from_tag}&` : '') +
      (params.to_tag ? `until=${params.to_tag}` : '')
    );

    // Group commits by type
    const groupedCommits: Record<string, string[]> = {};
    const includeTypes = params.include_types || ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'] as const;

    for (const commit of commits) {
      const match = commit.commit.message.match(/^(\w+)(?:\(.*?\))?: (.+)/);
      if (match) {
        const [, type, message] = match;
        if (includeTypes.includes(type as typeof includeTypes[number])) {
          groupedCommits[type] = groupedCommits[type] || [];
          groupedCommits[type].push(`- ${message} (${commit.sha.substring(0, 7)})`);
        }
      }
    }

    // Generate markdown
    let changelog = '# Changelog\n\n';
    for (const type of includeTypes) {
      if (groupedCommits[type]?.length > 0) {
        changelog += `\n## ${type}\n\n${groupedCommits[type].join('\n')}\n`;
      }
    }

    return { changelog };
  }

  // Helper methods for code analysis
  private calculateComplexity(code: string): number {
    // Simple cyclomatic complexity calculation
    const controlFlowKeywords = ['if', 'for', 'while', 'case', '&&', '||'];
    return controlFlowKeywords.reduce((count, keyword) => 
      count + (code.match(new RegExp(`\\b${keyword}\\b`, 'g'))?.length || 0), 1);
  }

  private calculateMaintainability(code: string): number {
    // Basic maintainability index calculation
    const lines = code.split('\n').length;
    const commentLines = code.split('\n').filter(line => line.trim().startsWith('//')).length;
    return Math.min(100, Math.max(0, 100 * (commentLines / lines)));
  }

  private detectDuplication(code: string): number {
    // Simple duplication detection
    const lines = code.split('\n');
    const duplicateLines = new Set();
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[i] === lines[j]) {
          duplicateLines.add(i);
          duplicateLines.add(j);
        }
      }
    }
    return (duplicateLines.size / lines.length) * 100;
  }

  private lintCode(path: string, content: string): schemas.CodeQualityMetrics['lintIssues'] {
    const issues: schemas.CodeQualityMetrics['lintIssues'] = [];
    const lines = content.split('\n');

    // Basic linting rules
    lines.forEach((line, index) => {
      if (line.length > 100) {
        issues.push({
          path,
          line: index + 1,
          rule: 'max-line-length',
          severity: 'warning',
          message: 'Line exceeds 100 characters'
        });
      }
      if (line.includes('console.log')) {
        issues.push({
          path,
          line: index + 1,
          rule: 'no-console',
          severity: 'warning',
          message: 'Unexpected console statement'
        });
      }
    });

    return issues;
  }

  // Helper methods for security scanning
  private async scanDependencies(owner: string, repo: string, ref: string): Promise<schemas.SecurityVulnerability[]> {
    const vulnerabilities: schemas.SecurityVulnerability[] = [];
    
    try {
      // Get package.json
      const packageJson = await this.githubRequest<schemas.GitHubContent>(
        `/repos/${owner}/${repo}/contents/package.json?ref=${ref}`
      );

      if ('content' in packageJson) {
        const content = JSON.parse(Buffer.from(packageJson.content, 'base64').toString());
        const dependencies = { ...content.dependencies, ...content.devDependencies };

        // Check each dependency (simplified example)
        for (const [name, version] of Object.entries(dependencies)) {
          if (typeof version === 'string' && version.startsWith('^')) {
            vulnerabilities.push({
              id: `DEP_${name}`,
              severity: 'low',
              title: 'Loose dependency version',
              description: `Package ${name} uses caret version range which may introduce breaking changes`,
              path: 'package.json',
              cwe: 'CWE-1104'
            });
          }
        }
      }
    } catch (error) {
      // Handle case where package.json doesn't exist
    }

    return vulnerabilities;
  }

  private async scanSourceCode(contents: schemas.GitHubContent[]): Promise<schemas.SecurityVulnerability[]> {
    const vulnerabilities: schemas.SecurityVulnerability[] = [];
    const fileContents = Array.isArray(contents) ? contents : [contents];

    for (const file of fileContents) {
      if ('type' in file && file.type === 'file' && 'download_url' in file && file.download_url) {
        const response = await fetch(file.download_url);
        const content = await response.text();

        // Check for common security issues
        if (content.includes('eval(')) {
          vulnerabilities.push({
            id: `SAST_EVAL_${file.sha}`,
            severity: 'high',
            title: 'Use of eval',
            description: 'Detected use of eval() which can lead to code injection vulnerabilities',
            path: file.path,
            line: content.split('\n').findIndex(line => line.includes('eval(')) + 1,
            cwe: 'CWE-95'
          });
        }

        // Add more SAST checks as needed
      }
    }

    return vulnerabilities;
  }

  private async scanSecrets(contents: schemas.GitHubContent[]): Promise<schemas.SecurityVulnerability[]> {
    const vulnerabilities: schemas.SecurityVulnerability[] = [];
    const secretPatterns: Array<{ pattern: RegExp; name: string }> = [
      { pattern: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/i, name: 'AWS Secret Key' },
      { pattern: /api[_-]?key\s*=\s*['"][A-Za-z0-9]{32,}['"]/i, name: 'API Key' }
    ];

    const fileContents = Array.isArray(contents) ? contents : [contents];
    for (const file of fileContents) {
      if ('type' in file && file.type === 'file' && 'download_url' in file && file.download_url) {
        const response = await fetch(file.download_url);
        const content = await response.text();

        for (const { pattern, name } of secretPatterns) {
          if (pattern.test(content)) {
            vulnerabilities.push({
              id: `SECRET_${file.sha}`,
              severity: 'critical',
              title: `Hardcoded ${name}`,
              description: `Found hardcoded ${name} in source code`,
              path: file.path,
              cwe: 'CWE-798'
            });
          }
        }
      }
    }

    return vulnerabilities;
  }
}

// Start the server
const server = new GitHubServer();
server.start().catch(console.error);
