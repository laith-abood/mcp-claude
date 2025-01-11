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

  constructor() {
    this.server = new Server(
      {
        name: "openai-server",
        version: "0.6.2",
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

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
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
                description: "The prompt to send to the model",
              },
              model: {
                type: "string",
                description: "The model to use (default: gpt-4o-2024-11-20)",
                default: "gpt-4o-2024-11-20",
              },
              temperature: {
                type: "number",
                description: "Sampling temperature (default: 0)",
                default: 0,
              },
              max_tokens: {
                type: "number",
                description: "Maximum tokens in response (default: 16383)",
                default: 16383,
              },
              top_p: {
                type: "number",
                description: "Nucleus sampling parameter (default: 1)",
                default: 1,
              },
              frequency_penalty: {
                type: "number",
                description: "Frequency penalty (default: 0)",
                default: 0,
              },
              presence_penalty: {
                type: "number",
                description: "Presence penalty (default: 0)",
                default: 0,
              },
              system_message: {
                type: "string",
                description: "Optional system message to guide the model's behavior",
              },
            },
            required: ["prompt"],
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
        const messages = [];

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

        const completion = await this.openai.chat.completions.create({
          model: args.model || "gpt-4o-2024-11-20",
          messages,
          response_format: { type: "text" },
          temperature: args.temperature ?? 0,
          max_tokens: args.max_tokens ?? 16383,
          top_p: args.top_p ?? 1,
          frequency_penalty: args.frequency_penalty ?? 0,
          presence_penalty: args.presence_penalty ?? 0,
        });

        return {
          content: [
            {
              type: "text",
              text: completion.choices[0].message.content || "No response generated",
            },
          ],
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
