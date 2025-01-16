#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Define the expected structure of the Ollama API response
interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  eval_count?: number;
}

// Add configuration options at the top after imports
const OLLAMA_CONFIG = {
  endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'phi4:latest'
};

// Initialize the MCP server with required capabilities
const server = new Server(
  {
    name: "phi4",
    version: "0.1.0",
  },
  {
    capabilities: {
  tools: {
        listChanged: false // We don't support dynamic tool list changes
      },
    },
  }
);

// Add this function to check Ollama availability
async function checkOllamaAvailability(): Promise<boolean> {
  try {
    const response = await fetch(OLLAMA_CONFIG.endpoint);
    return response.ok;
  } catch (error) {
    console.error('Ollama connection error:', error);
    return false;
  }
}

// Function to query the Phi-4 model with proper error handling
async function queryPhi4(prompt: string, options = {}): Promise<OllamaResponse> {
  try {
    // Check Ollama availability first
    const isOllamaAvailable = await checkOllamaAvailability();
    if (!isOllamaAvailable) {
      throw new Error('Ollama server is not available. Please make sure Ollama is running and the model is installed.');
    }

    const response = await fetch(`${OLLAMA_CONFIG.endpoint}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt,
        options: {
          num_ctx: 16384,
          temperature: 0.7,
          ...options
        }
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Model '${OLLAMA_CONFIG.model}' not found. Please run 'ollama pull ${OLLAMA_CONFIG.model}'`);
      }
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    // Read the response as text and handle streaming JSON
    const text = await response.text();
    const lines = text.trim().split('\n');
    let finalResponse = '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const chunk = JSON.parse(line);
          finalResponse += chunk.response;
        } catch (e) {
          console.error('Error parsing JSON chunk:', e);
        }
      }
    }
    
    // Return the accumulated response
    return {
      model: OLLAMA_CONFIG.model,
      created_at: new Date().toISOString(),
      response: finalResponse,
      done: true
    };
  } catch (error) {
    console.error('Error querying Phi-4:', error);
    throw error;
  }
}

// Define the tool for generating text with Phi-4
const phi4Tool: Tool = {
  name: "phi4_generate",
  description: "Generate text using the Phi-4 language model through Ollama",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to send to Phi-4"
      },
      temperature: {
        type: "number",
        description: "Temperature for generation (0.0 to 1.0)",
        default: 0.7,
        minimum: 0,
        maximum: 1
      },
      num_ctx: {
        type: "number",
        description: "Context window size",
        default: 16384,
        minimum: 1,
        maximum: 16384
      }
    },
    required: ["prompt"]
  }
};

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [phi4Tool]
}));

// Handle tool execution requests with proper error handling
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === phi4Tool.name) {
    try {
      const { prompt, temperature = 0.7, num_ctx = 16384 } = args as any;
      
      // Validate inputs
      if (temperature < 0 || temperature > 1) {
        throw new Error("Temperature must be between 0 and 1");
      }
      if (num_ctx < 1 || num_ctx > 16384) {
        throw new Error("Context window size must be between 1 and 16384");
      }

      const result = await queryPhi4(prompt, { temperature, num_ctx });

      return {
        content: [
          {
            type: "text",
            text: result.response
          }
        ]
      };
    } catch (error) {
      console.error('Tool execution error:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Phi-4 MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle server startup with proper error handling
runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

// Export for testing
export { queryPhi4, checkOllamaAvailability }; 