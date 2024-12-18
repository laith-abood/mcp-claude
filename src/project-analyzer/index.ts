#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
    McpError,
    ErrorCode,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { glob } from "glob";
import ignore from "ignore";
import { readFileSync } from "fs";
import { join, relative, dirname, basename } from "path";

interface McpServerInfo {
    name: string;
    language: 'typescript' | 'python';
    hasTests: boolean;
    hasDocumentation: boolean;
    configFiles: string[];
    dependencies: string[];
    tools: string[];
}

interface ProjectStructure {
    mainDirectories: string[];
    mcpServers: McpServerInfo[];
    sourceDirectories: string[];
    testDirectories: string[];
    configFiles: string[];
    packageFiles: string[];
    documentationFiles: string[];
    gitFiles: string[];
}

interface ServerCapabilities {
    hasTools: boolean;
    hasResources: boolean;
    hasResourceTemplates: boolean;
}

interface DependencyInfo {
    name: string;
    version: string;
    type: "production" | "development";
}

interface ProjectInsights {
    structure: ProjectStructure;
    dependencies: {
        production: DependencyInfo[];
        development: DependencyInfo[];
    };
    mainLanguages: string[];
    frameworksDetected: string[];
    testingFrameworks: string[];
    buildTools: string[];
}

const TOOLS: Tool[] = [
    {
        name: "analyze_project_structure",
        description: "Analyzes the project structure including main directories, source code organization, and key files. Use this before performing detailed code reviews or making structural changes.",
        inputSchema: {
            type: "object",
            properties: {
                projectPath: {
                    type: "string",
                    description: "Path to the project root"
                },
                owner: {
                    type: "string",
                    description: "GitHub repository owner"
                },
                repo: {
                    type: "string",
                    description: "GitHub repository name"
                }
            },
            required: ["projectPath"]
        }
    },
    {
        name: "analyze_dependencies",
        description: "Analyzes project dependencies, their versions, and potential issues. Helps understand project requirements and potential upgrade paths.",
        inputSchema: {
            type: "object",
            properties: {
                projectPath: {
                    type: "string",
                    description: "Path to the project root"
                }
            },
            required: ["projectPath"]
        }
    },
    {
        name: "suggest_review_strategy",
        description: "Suggests a code review strategy based on project structure and changes. Helps coordinate between different review types and tools.",
        inputSchema: {
            type: "object",
            properties: {
                projectPath: {
                    type: "string",
                    description: "Path to the project root"
                },
                changedFiles: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "List of changed files to review"
                }
            },
            required: ["projectPath", "changedFiles"]
        }
    }
];

class ProjectAnalyzer {
    private async analyzeMcpServer(serverPath: string, serverName: string): Promise<McpServerInfo> {
        const files = await glob('**/*', {
            cwd: serverPath,
            dot: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        const info: McpServerInfo = {
            name: serverName,
            language: files.some(f => f.endsWith('.ts')) ? 'typescript' : 'python',
            hasTests: files.some(f => f.includes('test') || f.includes('spec')),
            hasDocumentation: files.some(f => f.endsWith('.md')),
            configFiles: [],
            dependencies: [],
            tools: []
        };

        // Analyze package.json or pyproject.toml for dependencies
        try {
            if (info.language === 'typescript') {
                const packageJson = JSON.parse(readFileSync(join(serverPath, 'package.json'), 'utf8'));
                info.dependencies = [
                    ...Object.keys(packageJson.dependencies || {}),
                    ...Object.keys(packageJson.devDependencies || {})
                ];
            } else {
                const pyproject = readFileSync(join(serverPath, 'pyproject.toml'), 'utf8');
                // Extract dependencies from pyproject.toml (simplified)
                const depMatches = pyproject.match(/dependencies\s*=\s*\[(.*?)\]/s);
                if (depMatches) {
                    info.dependencies = depMatches[1].split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('#'));
                }
            }
        } catch (error) {
            // Package file doesn't exist or is invalid
        }

        // Analyze server capabilities by checking imports and code patterns
        try {
            const indexContent = readFileSync(
                join(serverPath, info.language === 'typescript' ? 'index.ts' : 'server.py'),
                'utf8'
            );
            
            // Look for tool and resource definitions
            if (indexContent.includes('setRequestHandler(ListToolsRequestSchema')) {
                const toolMatches = indexContent.match(/name:\s*["']([^"']+)["']/g);
                if (toolMatches) {
                    info.tools = toolMatches.map(m => m.match(/["']([^"']+)["']/)![1]);
                }
            }
        } catch (error) {
            // Index file doesn't exist or is invalid
        }

        // Get config files
        info.configFiles = files.filter(f => 
            f.endsWith('.json') || 
            f.endsWith('.toml') || 
            f.endsWith('.yaml') || 
            f.endsWith('.yml') ||
            f.startsWith('.')
        );

        return info;
    }

    private async getProjectStructure(projectPath: string): Promise<ProjectStructure> {
        const ig = ignore();
        try {
            const gitignore = readFileSync(join(projectPath, '.gitignore'), 'utf8');
            ig.add(gitignore);
        } catch (error) {
            // .gitignore doesn't exist, continue without it
        }

        const allFiles = await glob('**/*', {
            cwd: projectPath,
            dot: true,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        const structure: ProjectStructure = {
            mainDirectories: [],
            mcpServers: [],
            sourceDirectories: [],
            testDirectories: [],
            configFiles: [],
            packageFiles: [],
            documentationFiles: [],
            gitFiles: []
        };

        // First, identify and analyze each MCP server
        const serverDirs = (await glob('*/', { cwd: projectPath }))
            .map(dir => dir.replace(/\/$/, ''))
            .filter(dir => !dir.startsWith('.'));

        for (const serverDir of serverDirs) {
            const serverInfo = await this.analyzeMcpServer(
                join(projectPath, serverDir),
                serverDir
            );
            structure.mcpServers.push(serverInfo);
            structure.mainDirectories.push(serverDir);
        }

        for (const file of allFiles) {
            if (ig.ignores(file)) continue;

            const dir = dirname(file);
            const base = basename(file);

            // Categorize directories
            if (dir === 'src' || dir === 'lib' || dir.startsWith('src/') || dir.startsWith('lib/')) {
                structure.sourceDirectories.push(file);
            } else if (dir === 'test' || dir === 'tests' || dir.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.spec.ts')) {
                structure.testDirectories.push(file);
            }

            // Categorize files
            if (base.match(/^(package|composer|gemfile|requirements)\.json$/i)) {
                structure.packageFiles.push(file);
            } else if (base.match(/\.(md|txt|doc|pdf)$/i)) {
                structure.documentationFiles.push(file);
            } else if (base.startsWith('.git') || base === '.gitignore' || base === '.gitmodules') {
                structure.gitFiles.push(file);
            } else if (base.match(/^(\.|webpack|tsconfig|babel|jest|eslint|prettier)/i)) {
                structure.configFiles.push(file);
            }

            // Track main directories
            const topLevelDir = file.split('/')[0];
            if (!structure.mainDirectories.includes(topLevelDir) && !topLevelDir.startsWith('.')) {
                structure.mainDirectories.push(topLevelDir);
            }
        }

        return structure;
    }

    private async analyzeDependencies(projectPath: string) {
        const dependencies: { production: DependencyInfo[]; development: DependencyInfo[] } = {
            production: [],
            development: []
        };

        try {
            const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));

            // Analyze production dependencies
            if (packageJson.dependencies) {
                dependencies.production = Object.entries(packageJson.dependencies).map(([name, version]) => ({
                    name,
                    version: version as string,
                    type: "production"
                }));
            }

            // Analyze dev dependencies
            if (packageJson.devDependencies) {
                dependencies.development = Object.entries(packageJson.devDependencies).map(([name, version]) => ({
                    name,
                    version: version as string,
                    type: "development"
                }));
            }
        } catch (error) {
            // package.json doesn't exist or is invalid
        }

        return dependencies;
    }

    private detectFrameworks(dependencies: { production: DependencyInfo[]; development: DependencyInfo[] }) {
        const allDeps = [...dependencies.production, ...dependencies.development].map(d => d.name);
        
        const frameworks: string[] = [];
        const testFrameworks: string[] = [];
        const buildTools: string[] = [];

        // Detect frameworks
        if (allDeps.includes('react')) frameworks.push('React');
        if (allDeps.includes('vue')) frameworks.push('Vue');
        if (allDeps.includes('angular')) frameworks.push('Angular');
        if (allDeps.includes('express')) frameworks.push('Express');
        if (allDeps.includes('next')) frameworks.push('Next.js');
        if (allDeps.includes('gatsby')) frameworks.push('Gatsby');

        // Detect testing frameworks
        if (allDeps.includes('jest')) testFrameworks.push('Jest');
        if (allDeps.includes('mocha')) testFrameworks.push('Mocha');
        if (allDeps.includes('cypress')) testFrameworks.push('Cypress');
        if (allDeps.includes('playwright')) testFrameworks.push('Playwright');

        // Detect build tools
        if (allDeps.includes('webpack')) buildTools.push('Webpack');
        if (allDeps.includes('rollup')) buildTools.push('Rollup');
        if (allDeps.includes('parcel')) buildTools.push('Parcel');
        if (allDeps.includes('vite')) buildTools.push('Vite');

        return { frameworks, testFrameworks, buildTools };
    }

    private detectMainLanguages(structure: ProjectStructure): string[] {
        const extensions = new Map<string, number>();
        
        for (const file of structure.sourceDirectories) {
            const ext = file.split('.').pop()?.toLowerCase();
            if (ext) {
                extensions.set(ext, (extensions.get(ext) || 0) + 1);
            }
        }

        return Array.from(extensions.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([ext]) => {
                switch (ext) {
                    case 'ts': return 'TypeScript';
                    case 'js': return 'JavaScript';
                    case 'py': return 'Python';
                    case 'java': return 'Java';
                    case 'rb': return 'Ruby';
                    case 'php': return 'PHP';
                    case 'go': return 'Go';
                    case 'rs': return 'Rust';
                    default: return ext.toUpperCase();
                }
            });
    }

    private suggestReviewStrategy(
        insights: ProjectInsights,
        changedFiles: string[]
    ): string {
        const strategy: string[] = [];
        const fileTypes = new Set(changedFiles.map(f => f.split('.').pop()));

        // Suggest security review for certain conditions
        if (
            changedFiles.some(f => 
                f.includes('auth') || 
                f.includes('security') || 
                f.includes('middleware') ||
                f.includes('api')
            )
        ) {
            strategy.push(`1. Security Audit:
- Focus on authentication/authorization changes
- Review API security
- Check for potential vulnerabilities`);
        }

        // Suggest performance review for core changes
        if (
            changedFiles.some(f => 
                f.startsWith('src/') || 
                f.startsWith('lib/') ||
                f.includes('core')
            )
        ) {
            strategy.push(`2. Performance Review:
- Analyze algorithmic efficiency
- Check resource utilization
- Review caching strategies`);
        }

        // Suggest TypeScript analysis
        if (fileTypes.has('ts')) {
            strategy.push(`3. TypeScript Analysis:
- Verify type safety
- Check interface definitions
- Review generic usage`);
        }

        // Suggest test review if test files changed
        if (changedFiles.some(f => f.includes('test') || f.includes('spec'))) {
            strategy.push(`4. Testing Review:
- Verify test coverage
- Check test quality
- Review edge cases`);
        }

        // Suggest accessibility review for frontend changes
        if (insights.frameworksDetected.some(f => ['React', 'Vue', 'Angular'].includes(f))) {
            strategy.push(`5. Accessibility Review:
- Check WCAG compliance
- Verify screen reader compatibility
- Review keyboard navigation`);
        }

        return `Review Strategy for ${insights.mainLanguages.join('/')} Project

${strategy.join('\n\n')}

Review Order:
1. Start with security audit if suggested
2. Proceed with TypeScript/language-specific analysis
3. Follow with performance review
4. Complete testing review
5. Finish with accessibility checks if applicable

Tools to Use:
${insights.frameworksDetected.length > 0 ? `- Framework-specific best practices for ${insights.frameworksDetected.join(', ')}` : ''}
${insights.testingFrameworks.length > 0 ? `- Testing frameworks: ${insights.testingFrameworks.join(', ')}` : ''}
${insights.buildTools.length > 0 ? `- Build tools: ${insights.buildTools.join(', ')}` : ''}

Note: This strategy is based on the project structure and changed files. Adjust based on specific requirements and priorities.`;
    }

    async analyzeProject(projectPath: string): Promise<ProjectInsights> {
        const structure = await this.getProjectStructure(projectPath);
        const dependencies = await this.analyzeDependencies(projectPath);
        const { frameworks, testFrameworks, buildTools } = this.detectFrameworks(dependencies);
        const mainLanguages = this.detectMainLanguages(structure);

        return {
            structure,
            dependencies,
            mainLanguages,
            frameworksDetected: frameworks,
            testingFrameworks: testFrameworks,
            buildTools
        };
    }

    getTools(): Tool[] {
        return TOOLS;
    }

    async handleToolCall(toolName: string, args: any): Promise<{
        content: TextContent[];
        isError?: boolean;
    }> {
        try {
            switch (toolName) {
                case "analyze_project_structure": {
                    const insights = await this.analyzeProject(args.projectPath);
                    return {
                        content: [{
                            type: "text",
                            text: `# MCP Servers Analysis

## Server Overview
${insights.structure.mcpServers.map(server => `
### ${server.name}
- Language: ${server.language}
- Tests: ${server.hasTests ? '✅' : '❌'}
- Documentation: ${server.hasDocumentation ? '✅' : '❌'}
- Tools: ${server.tools.length > 0 ? '\n  ' + server.tools.map(t => `- ${t}`).join('\n  ') : 'None defined'}
- Dependencies: ${server.dependencies.length > 0 ? '\n  ' + server.dependencies.map(d => `- ${d}`).join('\n  ') : 'None found'}
- Config Files: ${server.configFiles.length > 0 ? '\n  ' + server.configFiles.map(f => `- ${f}`).join('\n  ') : 'None found'}
`).join('\n')}

## Development Recommendations

### Testing Coverage
${insights.structure.mcpServers.filter(s => !s.hasTests).map(s => `- Add tests for ${s.name}`).join('\n')}

### Documentation
${insights.structure.mcpServers.filter(s => !s.hasDocumentation).map(s => `- Add documentation for ${s.name}`).join('\n')}

### Tool Implementation
${insights.structure.mcpServers.filter(s => s.tools.length === 0).map(s => `- Define tools for ${s.name}`).join('\n')}

### Configuration
${insights.structure.mcpServers.map(s => `- ${s.name}: ${s.configFiles.length} config files`).join('\n')}

## Review Priorities
1. Implement missing tests for servers without coverage
2. Add documentation where missing
3. Define tools for servers that lack them
4. Standardize configuration across servers
5. Update dependencies to latest versions

## Development Guidelines
1. Maintain consistent structure across servers
2. Implement both tools and resources where applicable
3. Include comprehensive testing
4. Provide detailed documentation
5. Follow language-specific best practices (TypeScript/Python)`
                        }]
                    };
                }
                case "analyze_dependencies": {
                    const insights = await this.analyzeProject(args.projectPath);
                    return {
                        content: [{
                            type: "text",
                            text: `# Dependency Analysis

## Production Dependencies
${insights.dependencies.production.map(d => `- ${d.name}@${d.version}`).join('\n')}

## Development Dependencies
${insights.dependencies.development.map(d => `- ${d.name}@${d.version}`).join('\n')}

## Framework Detection
${insights.frameworksDetected.map(f => `- ${f}`).join('\n')}

## Testing Frameworks
${insights.testingFrameworks.map(f => `- ${f}`).join('\n')}

## Build Tools
${insights.buildTools.map(t => `- ${t}`).join('\n')}

## Recommendations
1. Review dependency versions for security updates
2. Check for deprecated packages
3. Consider consolidating similar dependencies
4. Verify peer dependency compatibility`
                        }]
                    };
                }
                case "suggest_review_strategy": {
                    const insights = await this.analyzeProject(args.projectPath);
                    const strategy = this.suggestReviewStrategy(insights, args.changedFiles);
                    return {
                        content: [{
                            type: "text",
                            text: strategy
                        }]
                    };
                }
                default:
                    throw new McpError(
                        ErrorCode.MethodNotFound,
                        `Unknown tool: ${toolName}`
                    );
            }
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Error: ${(error as Error).message}`
                }],
                isError: true
            };
        }
    }
}

// Initialize and start the server
const analyzer = new ProjectAnalyzer();
const server = new Server(
    {
        name: "project-analyzer",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: analyzer.getTools()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return analyzer.handleToolCall(request.params.name, request.params.arguments);
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
