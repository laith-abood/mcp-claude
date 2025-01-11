#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

interface ProjectAnalysisArgs {
  projectPath: string;
}

interface CodeAnalysisArgs {
  filePath: string;
}

interface DuplicationAnalysisArgs {
  projectPath: string;
  minLines?: number;
}

function isValidProjectAnalysisArgs(args: any): args is ProjectAnalysisArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.projectPath === "string"
  );
}

function isValidCodeAnalysisArgs(args: any): args is CodeAnalysisArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.filePath === "string"
  );
}

function isValidDuplicationAnalysisArgs(args: any): args is DuplicationAnalysisArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.projectPath === "string"
  );
}

class ProjectAnalyzerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "project-analyzer",
        version: "0.2.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async calculateComplexity(code: string): Promise<number> {
    // Basic cyclomatic complexity calculation
    const controlFlowKeywords = [
      'if', 'else', 'while', 'for', 'switch', 'case', '&&', '||', '?', 'catch', 'finally',
      'forEach', 'map', 'filter', 'reduce', 'every', 'some'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const keyword of controlFlowKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private async analyzeDependencies(code: string): Promise<string[]> {
    const dependencies: Set<string> = new Set();
    
    // Match import statements
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      dependencies.add(match[1]);
    }
    
    // Match require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
      dependencies.add(match[1]);
    }
    
    return Array.from(dependencies);
  }

  private async findDuplicateCode(files: string[], minLines: number = 5): Promise<any[]> {
    const duplicates: any[] = [];
    const codeBlocks: Map<string, { file: string; lineNumber: number }[]> = new Map();
    
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i <= lines.length - minLines; i++) {
        const block = lines.slice(i, i + minLines).join('\n').trim();
        if (block.length > 0) {
          const locations = codeBlocks.get(block) || [];
          locations.push({ file, lineNumber: i + 1 });
          codeBlocks.set(block, locations);
        }
      }
    }
    
    for (const [block, locations] of codeBlocks.entries()) {
      if (locations.length > 1) {
        duplicates.push({
          code: block,
          locations: locations
        });
      }
    }
    
    return duplicates;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [
          {
            name: "analyze_project_structure",
            description: "Analyzes the project structure including main directories, source code organization, and key files",
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
            name: "analyze_code_quality",
            description: "Analyzes code quality metrics including complexity and dependencies",
            inputSchema: {
              type: "object",
              properties: {
                filePath: {
                  type: "string",
                  description: "Path to the file to analyze"
                }
              },
              required: ["filePath"]
            }
          },
          {
            name: "find_duplicates",
            description: "Finds duplicate code blocks in the project",
            inputSchema: {
              type: "object",
              properties: {
                projectPath: {
                  type: "string",
                  description: "Path to the project root"
                },
                minLines: {
                  type: "number",
                  description: "Minimum number of lines to consider as duplicate (default: 5)"
                }
              },
              required: ["projectPath"]
            }
          }
        ]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        try {
          switch (request.params.name) {
            case "analyze_project_structure": {
              if (!isValidProjectAnalysisArgs(request.params.arguments)) {
                throw new McpError(ErrorCode.InvalidParams, "Invalid project analysis arguments");
              }

              const projectPath = request.params.arguments.projectPath;
              const files = await glob("**/*", { 
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/build/**", "**/.git/**"],
                nodir: true,
                withFileTypes: false
              });

              const analysis = {
                totalFiles: files.length,
                fileTypes: {} as Record<string, number>,
                directoryStructure: {} as Record<string, string[]>,
                keyFiles: [] as string[],
                sourceFiles: [] as string[],
                testFiles: [] as string[],
                configFiles: [] as string[]
              };

              for (const file of files) {
                // File type analysis
                const ext = extname(file) || 'no-extension';
                analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

                // Categorize files
                if (['package.json', 'tsconfig.json', '.gitignore', 'README.md'].includes(file)) {
                  analysis.keyFiles.push(file);
                }
                if (file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.includes('__tests__')) {
                  analysis.testFiles.push(file);
                }
                if (['.ts', '.js', '.tsx', '.jsx'].some(ext => file.endsWith(ext)) && !analysis.testFiles.includes(file)) {
                  analysis.sourceFiles.push(file);
                }
                if (file.endsWith('.json') || file.endsWith('.config.js') || file.endsWith('.rc')) {
                  analysis.configFiles.push(file);
                }

                // Directory structure
                const dir = file.split('/')[0];
                if (!analysis.directoryStructure[dir]) {
                  analysis.directoryStructure[dir] = [];
                }
                analysis.directoryStructure[dir].push(file);
              }

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(analysis, null, 2)
                  }
                ]
              };
            }

            case "analyze_code_quality": {
              if (!isValidCodeAnalysisArgs(request.params.arguments)) {
                throw new McpError(ErrorCode.InvalidParams, "Invalid code analysis arguments");
              }

              const filePath = request.params.arguments.filePath;
              const code = await readFile(filePath, 'utf-8');

              const analysis = {
                complexity: await this.calculateComplexity(code),
                dependencies: await this.analyzeDependencies(code),
                loc: code.split('\n').length,
                characters: code.length,
                functions: (code.match(/function\s+\w+\s*\(|const\s+\w+\s*=\s*(?:async\s*)?\(|=>/g) || []).length,
                classes: (code.match(/class\s+\w+/g) || []).length,
                comments: (code.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length
              };

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(analysis, null, 2)
                  }
                ]
              };
            }

            case "find_duplicates": {
              if (!isValidDuplicationAnalysisArgs(request.params.arguments)) {
                throw new McpError(ErrorCode.InvalidParams, "Invalid duplication analysis arguments");
              }

              const projectPath = request.params.arguments.projectPath;
              const minLines = request.params.arguments.minLines || 5;

              const files = await glob("**/*.{js,ts,jsx,tsx}", {
                cwd: projectPath,
                ignore: ["**/node_modules/**", "**/build/**", "**/.git/**"],
                absolute: true
              });

              const duplicates = await this.findDuplicateCode(files, minLines);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(duplicates, null, 2)
                  }
                ]
              };
            }

            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Analysis error: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Project Analyzer MCP server running on stdio");
  }
}

const server = new ProjectAnalyzerServer();
server.run().catch(console.error);
