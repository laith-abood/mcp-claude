#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

interface ChatArgs {
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  system_message?: string;
  stream?: boolean;
  format?: 'text' | 'markdown' | 'json';
  cache?: boolean;
}

const AVAILABLE_MODELS = {
  'gpt-4': {
    maxTokens: 8192,
    features: ['function-calling', 'json-mode']
  },
  'gpt-4-turbo': {
    maxTokens: 16384,
    features: ['function-calling', 'json-mode', 'streaming']
  },
  'gpt-3.5-turbo': {
    maxTokens: 4096,
    features: ['function-calling', 'json-mode']
  }
} as const;

interface CacheEntry {
  response: string;
  timestamp: number;
  model: string;
  temperature: number;
}

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly MAX_ENTRIES = 1000;
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  private createKey(prompt: string, model: string, temperature: number): string {
    return `${prompt}|${model}|${temperature}`;
  }

  get(prompt: string, model: string, temperature: number): string | null {
    const key = this.createKey(prompt, model, temperature);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.response;
  }

  set(prompt: string, model: string, temperature: number, response: string): void {
    if (this.cache.size >= this.MAX_ENTRIES) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, Math.floor(this.MAX_ENTRIES * 0.2)); // Remove 20%
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
    
    const key = this.createKey(prompt, model, temperature);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      model,
      temperature
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

function isValidChatArgs(args: unknown): args is ChatArgs {
  if (!args || typeof args !== "object") return false;

  const chatArgs = args as ChatArgs;
  return (
    typeof chatArgs.prompt === "string" &&
    (chatArgs.model === undefined || typeof chatArgs.model === "string") &&
    (chatArgs.temperature === undefined || typeof chatArgs.temperature === "number") &&
    (chatArgs.max_tokens === undefined || typeof chatArgs.max_tokens === "number") &&
    (chatArgs.top_p === undefined || typeof chatArgs.top_p === "number") &&
    (chatArgs.frequency_penalty === undefined || typeof chatArgs.frequency_penalty === "number") &&
    (chatArgs.presence_penalty === undefined || typeof chatArgs.presence_penalty === "number") &&
    (chatArgs.system_message === undefined || typeof chatArgs.system_message === "string")
  );
}

class OpenAIServer {
  private server: Server;
  private openai: OpenAI;
  private cache: ResponseCache;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  constructor() {
    this.server = new Server(
      {
        name: "openai-server",
        version: "0.7.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.openai = new OpenAI({
      apiKey: API_KEY,
    });

    this.cache = new ResponseCache();

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private validateModel(model: string): string {
    if (!model) return 'gpt-4-turbo';
    if (model in AVAILABLE_MODELS) return model;
    throw new Error(`Invalid model: ${model}. Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
  }

  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    retries = this.MAX_RETRIES
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries - 1) throw error;
        
        const delay = this.RETRY_DELAY * Math.pow(2, i);
        console.error(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('All retry attempts failed');
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "chat_completion",
          description: "Generate text using OpenAI's chat completion API",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The prompt to send to the model"
              },
              model: {
                type: "string",
                description: "The model to use",
                enum: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
                default: "gpt-4-turbo"
              },
              temperature: {
                type: "number",
                description: "Sampling temperature (default: 0)",
                minimum: 0,
                maximum: 2,
                default: 0
              },
              max_tokens: {
                type: "number",
                description: "Maximum tokens in response (varies by model)",
                minimum: 1,
                default: 16384
              },
              top_p: {
                type: "number",
                description: "Nucleus sampling parameter (default: 1)",
                minimum: 0,
                maximum: 1,
                default: 1
              },
              frequency_penalty: {
                type: "number",
                description: "Frequency penalty (default: 0)",
                minimum: -2,
                maximum: 2,
                default: 0
              },
              presence_penalty: {
                type: "number",
                description: "Presence penalty (default: 0)",
                minimum: -2,
                maximum: 2,
                default: 0
              },
              system_message: {
                type: "string",
                description: "Optional system message to guide the model's behavior"
              },
              stream: {
                type: "boolean",
                description: "Whether to stream the response (not currently supported)",
                default: false
              },
              format: {
                type: "string",
                description: "Response format",
                enum: ["text", "markdown", "json"],
                default: "text"
              },
              cache: {
                type: "boolean",
                description: "Whether to cache the response (default: true)",
                default: true
              }
            },
            required: ["prompt"]
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "chat_completion") {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      if (!request.params.arguments || !isValidChatArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid chat completion arguments"
        );
      }

      const args = request.params.arguments;

      try {
        const messages: Array<{
          role: 'system' | 'user';
          content: string;
        }> = [];

        if (args.system_message) {
          messages.push({
            role: "system" as const,
            content: args.system_message,
          });
        } else {
          messages.push({
            role: "system" as const,
            content: "Respond in a well-structured and organized manner with full detail about any topic.\n\n# Details\n\nWhen asked about a topic, ensure your response is informative, comprehensive, and logically organized. Break down complex topics into clear, digestible sections or bullet points. Address various aspects of the subject to provide an in-depth understanding.\n\n# Steps\n\n1. **Understand the Topic**: Clearly identify what the topic or question is asking for. Consider different perspectives or subtopics that could be relevant.\n2. **Research and Compile Information**: Gather accurate and relevant information. Verify the details from credible sources if applicable.\n3. **Organize the Content**: Arrange the information in a coherent order. Use sections or bullet points to separate different points or aspects of the topic.\n4. **Detail Explanation**: Elaborate on each point or section thoroughly. Provide examples, data, or anecdotes if applicable.\n5. **Conclude and Summarize**: Summarize the main points and provide a clear conclusion that encapsulates the essence of the topic.",
          });
        }

        messages.push({
          role: "user" as const,
          content: args.prompt,
        });

        // Check cache if enabled
        if (args.cache !== false) {
          const cachedResponse = this.cache.get(
            args.prompt,
            args.model || 'gpt-4-turbo',
            args.temperature ?? 0
          );
          if (cachedResponse) {
            return {
              content: [{ type: "text", text: cachedResponse }],
              metadata: { cached: true }
            };
          }
        }

        const model = this.validateModel(args.model || 'gpt-4-turbo');
        const modelConfig = AVAILABLE_MODELS[model as keyof typeof AVAILABLE_MODELS];

        const completion = await this.retryWithExponentialBackoff(async () => {
          const baseParams = {
            model,
            messages,
            response_format: { 
              type: args.format === 'json' ? 'json_object' as const : 'text' as const
            },
            temperature: args.temperature ?? 0,
            max_tokens: Math.min(args.max_tokens ?? modelConfig.maxTokens, modelConfig.maxTokens),
            top_p: args.top_p ?? 1,
            frequency_penalty: args.frequency_penalty ?? 0,
            presence_penalty: args.presence_penalty ?? 0,
          };

          if (args.stream) {
            const stream = await this.openai.chat.completions.create({
              ...baseParams,
              stream: true
            });

            let fullResponse = '';
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || '';
              // Accumulate response without streaming
              // The MCP SDK doesn't currently support true streaming
              // So we'll collect the full response and return it at once
              fullResponse += content;
            }
            return fullResponse;
          } else {
            const response = await this.openai.chat.completions.create({
              ...baseParams,
              stream: false
            });
            return response.choices[0].message.content || "No response generated";
          }
        });

        // Format and cache response
        const formattedResponse = args.format === 'markdown' 
          ? `\`\`\`markdown\n${completion}\n\`\`\``
          : completion;

        if (args.cache !== false) {
          this.cache.set(
            args.prompt,
            model,
            args.temperature ?? 0,
            formattedResponse
          );
        }

        return {
          content: [{ type: "text", text: formattedResponse }],
          metadata: { 
            model,
            cached: false,
            streamed: false // Since we're not actually streaming yet
          }
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenAI MCP server running on stdio");
  }
}

const server = new OpenAIServer();
server.run().catch(console.error);
