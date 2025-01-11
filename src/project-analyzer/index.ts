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
import { join, extname, dirname } from 'path';
import { ErrorHandler } from "../shared/error-handler.js";
import { Logger } from "../shared/logger.js";

const logger = Logger.getInstance();

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

interface APIAnalysisArgs {
  projectPath: string;
}

interface DependencyGraphArgs {
  projectPath: string;
  maxDepth?: number;
}

interface CodeSmellsArgs {
  filePath: string;
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

function isValidAPIAnalysisArgs(args: any): args is APIAnalysisArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.projectPath === "string"
  );
}

function isValidDependencyGraphArgs(args: any): args is DependencyGraphArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.projectPath === "string"
  );
}

function isValidCodeSmellsArgs(args: any): args is CodeSmellsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.filePath === "string"
  );
}

class ProjectAnalyzerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "project-analyzer",
        version: "0.3.0"
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

  private async calculateComplexity(code: string): Promise<{
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    halsteadMetrics: {
      vocabulary: number;
      length: number;
      volume: number;
      difficulty: number;
      effort: number;
      estimatedBugs: number;
    };
  }> {
    const controlFlowKeywords = [
      'if', 'else', 'while', 'for', 'switch', 'case', '&&', '||', '?', 'catch', 'finally',
      'forEach', 'map', 'filter', 'reduce', 'every', 'some'
    ];
    
    let cyclomaticComplexity = 1;
    let cognitiveComplexity = 0;
    let nestingLevel = 0;
    
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Calculate cyclomatic complexity
      for (const keyword of controlFlowKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          cyclomaticComplexity += matches.length;
        }
      }
      
      // Calculate cognitive complexity
      const indentation = line.search(/\S/);
      const newNestingLevel = Math.floor(indentation / 2);
      
      if (newNestingLevel > nestingLevel) {
        cognitiveComplexity += newNestingLevel - nestingLevel;
      }
      nestingLevel = newNestingLevel;
      
      if (line.match(/\b(if|while|for|forEach|switch)\b/)) {
        cognitiveComplexity += nestingLevel + 1;
      }
    }
    
    // Calculate Halstead metrics
    const operators = new Set<string>();
    const operands = new Set<string>();
    const operatorRegex = /[+\-*/%=<>!&|^~?:]+|\b(new|delete|typeof|instanceof|in|of|await|yield)\b/g;
    const operandRegex = /\b([a-zA-Z_]\w*|\d+(\.\d+)?)\b/g;
    
    const operatorMatches = code.match(operatorRegex) || [];
    const operandMatches = code.match(operandRegex) || [];
    
    operatorMatches.forEach(op => operators.add(op));
    operandMatches.forEach(op => operands.add(op));
    
    const n1 = operators.size;
    const n2 = operands.size;
    const N1 = operatorMatches.length;
    const N2 = operandMatches.length;
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(Math.max(vocabulary, 2));
    const difficulty = (n1 / 2) * (N2 / Math.max(n2, 1));
    const effort = volume * difficulty;
    
    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      halsteadMetrics: {
        vocabulary,
        length,
        volume,
        difficulty,
        effort,
        estimatedBugs: volume / 3000
      }
    };
  }

  private async findDuplicateCode(files: string[], minLines: number = 5): Promise<{
    duplicates: Array<{
      code: string;
      locations: Array<{ file: string; lineNumber: number }>;
      lineCount: number;
    }>;
    statistics: {
      totalDuplicates: number;
      totalDuplicateLines: number;
      filesAffected: string[];
      duplicatesByFile: Record<string, number>;
    };
  }> {
    const duplicates: Array<{
      code: string;
      locations: Array<{ file: string; lineNumber: number }>;
      lineCount: number;
    }> = [];
    const codeBlocks = new Map<string, Array<{ file: string; lineNumber: number }>>();
    const statistics = {
      totalDuplicates: 0,
      totalDuplicateLines: 0,
      filesAffected: new Set<string>(),
      duplicatesByFile: {} as Record<string, number>
    };
    
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
          locations,
          lineCount: block.split('\n').length
        });
        
        statistics.totalDuplicates++;
        statistics.totalDuplicateLines += block.split('\n').length;
        
        locations.forEach(loc => {
          statistics.filesAffected.add(loc.file);
          statistics.duplicatesByFile[loc.file] = (statistics.duplicatesByFile[loc.file] || 0) + 1;
        });
      }
    }
    
    return {
      duplicates,
      statistics: {
        ...statistics,
        filesAffected: Array.from(statistics.filesAffected)
      }
    };
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: Error) => {
      ErrorHandler.handleError(error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async analyzeAPI(projectPath: string): Promise<{
    endpoints: Array<{
      method: string;
      path: string;
      file: string;
      line: number;
    }>;
    models: Array<{
      name: string;
      file: string;
      line: number;
    }>;
    middleware: Array<{
      file: string;
      line: number;
    }>;
    authentication: Array<{
      file: string;
      type: string;
    }>;
    validation: Array<{
      file: string;
      line: number;
    }>;
  }> {
    const apiFiles = await glob("**/{controllers,routes,api}/**/*.{ts,js}", {
      cwd: projectPath,
      ignore: ["**/node_modules/**", "**/build/**", "**/.git/**", "**/*.test.*", "**/*.spec.*"]
    });

    const apiAnalysis = {
      endpoints: [] as Array<{
        method: string;
        path: string;
        file: string;
        line: number;
      }>,
      models: [] as Array<{
        name: string;
        file: string;
        line: number;
      }>,
      middleware: [] as Array<{
        file: string;
        line: number;
      }>,
      authentication: [] as Array<{
        file: string;
        type: string;
      }>,
      validation: [] as Array<{
        file: string;
        line: number;
      }>
    };

    for (const file of apiFiles) {
      const content = await readFile(join(projectPath, file), 'utf-8');

      // Detect endpoints
      const routeRegex = /(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        apiAnalysis.endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file,
          line: content.substring(0, match.index).split('\n').length
        });
      }

      // Detect models/schemas
      const modelRegex = /(?:interface|type|class|schema)\s+(\w+)\s*{/g;
      while ((match = modelRegex.exec(content)) !== null) {
        apiAnalysis.models.push({
          name: match[1],
          file,
          line: content.substring(0, match.index).split('\n').length
        });
      }

      // Detect middleware
      const middlewareRegex = /(?:middleware|use)\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>/g;
      while ((match = middlewareRegex.exec(content)) !== null) {
        apiAnalysis.middleware.push({
          file,
          line: content.substring(0, match.index).split('\n').length
        });
      }

      // Detect authentication
      if (content.includes('authenticate') || content.includes('authorize')) {
        apiAnalysis.authentication.push({
          file,
          type: content.includes('JWT') ? 'JWT' : 
                content.includes('OAuth') ? 'OAuth' : 
                content.includes('Basic') ? 'Basic' : 'Unknown'
        });
      }

      // Detect validation
      const validationRegex = /validate|schema|check|assert/g;
      while ((match = validationRegex.exec(content)) !== null) {
        apiAnalysis.validation.push({
          file,
          line: content.substring(0, match.index).split('\n').length
        });
      }
    }

    return apiAnalysis;
  }

  private async buildDependencyGraph(projectPath: string, maxDepth: number = 5): Promise<{
    graph: Record<string, {
      dependencies: string[];
      dependents: string[];
      depth: number;
      isExternal: boolean;
    }>;
    metrics: {
      totalFiles: number;
      totalExternalDeps: number;
      maxDepth: number;
      mostDependedOn: Array<{
        file: string;
        dependents: number;
      }>;
    };
  }> {
    const graph: Record<string, {
      dependencies: string[];
      dependents: string[];
      depth: number;
      isExternal: boolean;
    }> = {};

    const processFile = async (file: string, currentDepth: number = 0): Promise<void> => {
      if (currentDepth >= maxDepth) return;

      const content = await readFile(join(projectPath, file), 'utf-8');
      const deps = await this.analyzeDependencies(content);

      if (!graph[file]) {
        graph[file] = {
          dependencies: [],
          dependents: [],
          depth: currentDepth,
          isExternal: false
        };
      }

      for (const dep of [...deps.dependencies.internal, ...deps.dependencies.external]) {
        if (!graph[dep]) {
          graph[dep] = {
            dependencies: [],
            dependents: [],
            depth: currentDepth + 1,
            isExternal: !deps.dependencies.internal.includes(dep)
          };
        }

        graph[file].dependencies.push(dep);
        graph[dep].dependents.push(file);

        if (!graph[dep].isExternal) {
          const resolvedPath = join(dirname(file), dep);
          await processFile(resolvedPath, currentDepth + 1);
        }
      }
    };

    const entryPoints = await glob("**/*.{ts,js}", {
      cwd: projectPath,
      ignore: ["**/node_modules/**", "**/build/**", "**/.git/**", "**/*.test.*", "**/*.spec.*"]
    });

    for (const entry of entryPoints) {
      await processFile(entry);
    }

    return {
      graph,
      metrics: {
        totalFiles: Object.keys(graph).filter(k => !graph[k].isExternal).length,
        totalExternalDeps: Object.keys(graph).filter(k => graph[k].isExternal).length,
        maxDepth: Math.max(...Object.values(graph).map(v => v.depth)),
        mostDependedOn: Object.entries(graph)
          .sort((a, b) => b[1].dependents.length - a[1].dependents.length)
          .slice(0, 5)
          .map(([file, data]) => ({
            file,
            dependents: data.dependents.length
          }))
      }
    };
  }

  private async detectCodeSmells(code: string): Promise<{
    smells: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      line: number;
      suggestion?: string;
    }>;
    metrics: {
      totalSmells: number;
      severityBreakdown: Record<string, number>;
      mostCommonSmells: Array<{ type: string; count: number }>;
    };
  }> {
    const smells: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      line: number;
      suggestion?: string;
    }> = [];
    const lines = code.split('\n');
    
    // Long method detection
    const functionRegex = /function\s+(\w+)|(\w+)\s*=\s*function|(\w+)\s*:\s*function/g;
    let match;
    let currentFunction = '';
    let functionStart = 0;
    let functionLines = 0;
    
    lines.forEach((line, index) => {
      // Long lines
      if (line.length > 100) {
        smells.push({
          type: 'long_line',
          description: 'Line exceeds 100 characters',
          severity: 'low',
          line: index + 1,
          suggestion: 'Consider breaking this line into multiple lines'
        });
      }
      
      // Complex conditions
      if ((line.match(/&&|\|\|/g) || []).length >= 3) {
        smells.push({
          type: 'complex_condition',
          description: 'Complex conditional expression',
          severity: 'medium',
          line: index + 1,
          suggestion: 'Break down the condition into smaller, more readable parts'
        });
      }
      
      // Magic numbers
      const magicNumberRegex = /(?<![\w\d.])[0-9]+(?![\w\d.])/g;
      const magicNumbers = line.match(magicNumberRegex);
      if (magicNumbers && !line.includes('const') && !line.includes('enum')) {
        smells.push({
          type: 'magic_number',
          description: 'Usage of magic number',
          severity: 'low',
          line: index + 1,
          suggestion: 'Define this number as a named constant'
        });
      }
      
      // Commented out code
      if (line.trim().startsWith('//') && 
          (line.includes('{') || line.includes('}') || 
           line.includes('function') || line.includes('=>'))) {
        smells.push({
          type: 'commented_code',
          description: 'Commented out code',
          severity: 'low',
          line: index + 1,
          suggestion: 'Remove commented out code or document why it\'s kept'
        });
      }
      
      // Empty catch blocks
      if (line.includes('catch') && 
          lines[index + 1] && 
          lines[index + 1].trim() === '}') {
        smells.push({
          type: 'empty_catch',
          description: 'Empty catch block',
          severity: 'high',
          line: index + 1,
          suggestion: 'Handle the error or document why it\'s ignored'
        });
      }
      
      // Function length tracking
      if ((match = functionRegex.exec(line)) !== null) {
        currentFunction = match[1] || match[2] || match[3];
        functionStart = index;
        functionLines = 0;
      }
      if (currentFunction) {
        functionLines++;
        if (functionLines > 30) {
          smells.push({
            type: 'long_function',
            description: `Function ${currentFunction} is too long (${functionLines} lines)`,
            severity: 'medium',
            line: functionStart + 1,
            suggestion: 'Break down the function into smaller, more focused functions'
          });
          currentFunction = '';
        }
      }
    });
    
    // Calculate metrics
    const severityBreakdown = smells.reduce<Record<string, number>>((acc, smell) => {
      acc[smell.severity] = (acc[smell.severity] || 0) + 1;
      return acc;
    }, {});
    
    const smellTypes = smells.reduce<Record<string, number>>((acc, smell) => {
      acc[smell.type] = (acc[smell.type] || 0) + 1;
      return acc;
    }, {});
    
    const mostCommonSmells = Object.entries(smellTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    
    return {
      smells,
      metrics: {
        totalSmells: smells.length,
        severityBreakdown,
        mostCommonSmells
      }
    };
  }

  private async analyzeDependencies(code: string): Promise<{
    imports: string[];
    exports: string[];
    dependencies: {
      internal: string[];
      external: string[];
      types: string[];
    };
  }> {
    const analysis = {
      imports: [] as string[],
      exports: [] as string[],
      dependencies: {
        internal: [] as string[],
        external: [] as string[],
        types: [] as string[]
      }
    };
    
    // Match import statements
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      analysis.imports.push(match[1]);
      if (match[1].startsWith('.')) {
        analysis.dependencies.internal.push(match[1]);
      } else if (match[1].startsWith('@types/')) {
        analysis.dependencies.types.push(match[1]);
      } else {
        analysis.dependencies.external.push(match[1]);
      }
    }
    
    // Match require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
      analysis.imports.push(match[1]);
      if (match[1].startsWith('.')) {
        analysis.dependencies.internal.push(match[1]);
      } else if (match[1].startsWith('@types/')) {
        analysis.dependencies.types.push(match[1]);
      } else {
        analysis.dependencies.external.push(match[1]);
      }
    }
    
    // Match export statements
    const exportRegex = /export\s+(?:{[^}]+}|(?:default\s+)?(?:class|function|const|let|var)\s+(\w+))/g;
    while ((match = exportRegex.exec(code)) !== null) {
      if (match[1]) {
        analysis.exports.push(match[1]);
      }
    }
    
    return analysis;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
          description: "Analyzes code quality metrics including complexity, dependencies, and maintainability",
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
          description: "Finds duplicate code blocks in the project with detailed statistics",
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
        },
        {
          name: "analyze_api",
          description: "Analyzes API endpoints, models, middleware, and authentication in the project",
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
          name: "build_dependency_graph",
          description: "Builds a detailed dependency graph of the project with metrics",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "Path to the project root"
              },
              maxDepth: {
                type: "number",
                description: "Maximum depth for dependency analysis (default: 5)"
              }
            },
            required: ["projectPath"]
          }
        },
        {
          name: "detect_code_smells",
          description: "Detects potential code smells and suggests improvements",
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
              configFiles: [] as string[],
              metrics: {
                sourceToTestRatio: 0,
                avgFilesPerDirectory: 0,
                maxDirectoryDepth: 0
              }
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

              // Calculate max directory depth
              const depth = file.split('/').length;
              analysis.metrics.maxDirectoryDepth = Math.max(analysis.metrics.maxDirectoryDepth, depth);
            }

            // Calculate metrics
            analysis.metrics.sourceToTestRatio = analysis.sourceFiles.length / (analysis.testFiles.length || 1);
            analysis.metrics.avgFilesPerDirectory = files.length / Object.keys(analysis.directoryStructure).length;

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

            const complexityAnalysis = await this.calculateComplexity(code);
            const dependencyAnalysis = await this.analyzeDependencies(code);
            
            const analysis = {
              complexity: complexityAnalysis,
              dependencies: dependencyAnalysis,
              metrics: {
                loc: code.split('\n').length,
                characters: code.length,
                functions: (code.match(/function\s+\w+\s*\(|const\s+\w+\s*=\s*(?:async\s*)?\(|=>/g) || []).length,
                classes: (code.match(/class\s+\w+/g) || []).length,
                comments: (code.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length,
                commentDensity: (code.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length / code.split('\n').length
              },
              suggestions: [] as string[]
            };

            // Generate suggestions
            if (complexityAnalysis.cyclomaticComplexity > 10) {
              analysis.suggestions.push("Consider breaking down complex functions into smaller, more manageable pieces");
            }
            if (complexityAnalysis.cognitiveComplexity > 15) {
              analysis.suggestions.push("High cognitive complexity detected. Consider simplifying nested logic");
            }
            if (analysis.metrics.commentDensity < 0.1) {
              analysis.suggestions.push("Consider adding more documentation to improve code maintainability");
            }
            if (dependencyAnalysis.dependencies.external.length > 10) {
              analysis.suggestions.push("High number of external dependencies. Consider consolidating or reducing dependencies");
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

          case "find_duplicates": {
            if (!isValidDuplicationAnalysisArgs(request.params.arguments)) {
              throw new McpError(ErrorCode.InvalidParams, "Invalid duplication analysis arguments");
            }

            const projectPath = request.params.arguments.projectPath;
            const minLines = request.params.arguments.minLines || 5;

            const files = await glob("**/*.{js,ts,jsx,tsx}", {
              cwd: projectPath,
              ignore: ["**/node_modules/**", "**/build/**", "**/.git/**", "**/*.test.*", "**/*.spec.*"],
              absolute: true
            });

            const analysis = await this.findDuplicateCode(files, minLines);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(analysis, null, 2)
                }
              ]
            };
          }

          case "analyze_api": {
            if (!isValidAPIAnalysisArgs(request.params.arguments)) {
              throw new McpError(ErrorCode.InvalidParams, "Invalid API analysis arguments");
            }

            const projectPath = request.params.arguments.projectPath;
            const analysis = await this.analyzeAPI(projectPath);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(analysis, null, 2)
                }
              ]
            };
          }

          case "build_dependency_graph": {
            if (!isValidDependencyGraphArgs(request.params.arguments)) {
              throw new McpError(ErrorCode.InvalidParams, "Invalid dependency graph arguments");
            }

            const projectPath = request.params.arguments.projectPath;
            const maxDepth = request.params.arguments.maxDepth || 5;

            const analysis = await this.buildDependencyGraph(projectPath, maxDepth);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(analysis, null, 2)
                }
              ]
            };
          }

          case "detect_code_smells": {
            if (!isValidCodeSmellsArgs(request.params.arguments)) {
              throw new McpError(ErrorCode.InvalidParams, "Invalid code smells arguments");
            }

            const filePath = request.params.arguments.filePath;
            const code = await readFile(filePath, 'utf-8');

            const analysis = await this.detectCodeSmells(code);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(analysis, null, 2)
                }
              ]
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        ErrorHandler.handleError(error);
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
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Enhanced Project Analyzer MCP server running on stdio");
  }
}

const server = new ProjectAnalyzerServer();
server.run().catch((error) => {
  ErrorHandler.handleError(error);
  process.exit(1);
});
