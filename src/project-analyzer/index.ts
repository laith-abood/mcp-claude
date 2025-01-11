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
import { join } from 'path';

interface ProjectAnalysisArgs {
  projectPath: string;
}

function isValidProjectAnalysisArgs(args: any): args is ProjectAnalysisArgs {
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
        version: "0.1.0"
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

  private setupHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [{
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
        }]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name !== "analyze_project_structure") {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }

        if (!isValidProjectAnalysisArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid project analysis arguments"
          );
        }

        try {
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
            keyFiles: [] as string[]
          };

          // Analyze file types
          for (const file of files) {
            const ext = file.split('.').pop() || 'no-extension';
            analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

            // Track key files
            if (['package.json', 'tsconfig.json', '.gitignore', 'README.md'].includes(file)) {
              analysis.keyFiles.push(file);
            }

            // Build directory structure
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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Project analysis error: ${error instanceof Error ? error.message : String(error)}`
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
