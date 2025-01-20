# MCP Server Configuration Guide

This document explains how to configure MCP servers using the configuration file. The configuration file is typically located at:

- VSCode: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Configuration Structure

The configuration file uses this structure:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["array", "of", "arguments"],
      "cwd": "optional-working-directory",
      "env": {
        "ENV_VARIABLES": "for-the-server"
      }
    }
  }
}
```

## Example Configuration

Here's a comprehensive example showing how to configure various MCP servers:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "node",
      "args": [
        "/Users/username/mcp/servers/src/gdrive/dist/index.js"
      ],
      "cwd": "/Users/username/mcp/servers/src/gdrive",
      "env": {
        "GDRIVE_OAUTH_PATH": "/Users/username/mcp/servers/src/gdrive/gcp-oauth.keys.json",
        "GDRIVE_CREDENTIALS_PATH": "/Users/username/mcp/servers/src/gdrive/.gdrive-server-credentials.json",
        "SHEETS_EXPORT_FORMAT": "markdown",
        "ENABLE_SHEETS_API": "true",
        "SHEETS_INCLUDE_FORMULAS": "true",
        "SHEETS_INCLUDE_METADATA": "true",
        "GOOGLE_SCOPES": "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
        "DEBUG": "true"
      }
    },
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-brave-search"
      ],
      "env": {
        "BRAVE_API_KEY": "your-brave-api-key"
      }
    },
    "fetch": {
      "command": "uvx",
      "args": [
        "mcp-server-fetch",
        "--ignore-robots-txt"
      ]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ],
      "env": {
        "DEBUG_SEQUENTIAL_THINKING": "true",
        "THOUGHT_HISTORY_PATH": "/Users/username/.claude/sequential-thinking-history.json",
        "THOUGHT_EXPORT_DIR": "/Users/username/.claude/exports"
      }
    },
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory",
        "--vector-store",
        "true",
        "--embedding-model",
        "all-MiniLM-L6-v2",
        "--max-context-length",
        "2048",
        "--cleanup-interval",
        "86400",
        "--retention-days",
        "30",
        "--structured-data",
        "true"
      ],
      "env": {
        "STORAGE_DIR": "/Users/username/.claude/memory",
        "ENABLE_PERSISTENT_CACHE": "true",
        "CACHE_TTL": "86400",
        "NODE_TYPES": "concept,reference,relationship",
        "ENABLE_METADATA": "true",
        "ENABLE_RELATIONSHIPS": "true",
        "MAX_RELATIONSHIP_DEPTH": "3",
        "PRIORITY_LEVELS": "1,2,3,4,5"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir1",
        "/path/to/allowed/dir2"
      ],
      "env": {
        "ALLOW_WRITE": "true"
      }
    },
    "git": {
      "command": "python3.10",
      "args": [
        "-m",
        "mcp_server_git",
        "--repository",
        "/path/to/repo"
      ],
      "env": {
        "GIT_PYTHON_TRACE": "full",
        "GIT_TRACE": "1"
      }
    },
    "everything": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-everything",
        "--enable-code-analysis",
        "--enable-dependency-tracking",
        "--enable-type-inference"
      ],
      "env": {
        "ANALYSIS_DEPTH": "deep",
        "ENABLE_METRICS": "true"
      }
    },
    "time": {
      "command": "uvx",
      "args": [
        "mcp-server-time",
        "--local-timezone=America/Los_Angeles"
      ]
    },
    "sqlite": {
      "command": "uvx",
      "args": [
        "mcp-server-sqlite",
        "--db-path",
        "/Users/username/.claude/sqlite/test.db"
      ]
    },
    "logic": {
      "command": "/path/to/venv/bin/python",
      "args": [
        "-m",
        "mcp_logic",
        "--prover-path",
        "/opt/homebrew/Cellar/prover9/2009-11A/bin"
      ],
      "env": {
        "PYTHONPATH": "/path/to/mcp-logic",
        "MCP_DEBUG": "true",
        "MCP_LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

## Server-Specific Configuration

### Google Drive Server
- Requires OAuth credentials and token files
- Configurable API scopes and features
- Optional debugging mode

### GitHub Server
- Requires personal access token
- Token needs appropriate repository permissions

### Memory Server
- Configurable storage location
- Vector store settings
- Caching and retention policies
- Relationship management settings

### Filesystem Server
- List of allowed directories
- Write permissions toggle

### Git Server
- Repository path configuration
- Debug logging options

### SQLite Server
- Database file location
- Optional initialization settings

### Time Server
- Local timezone configuration
- Optional format settings

## Environment Variables

Common environment variables across servers:

- `DEBUG`: Enable debug logging
- `NODE_ENV`: Set runtime environment
- `LOG_LEVEL`: Configure logging verbosity

## Security Considerations

1. Store sensitive credentials securely
2. Use appropriate file permissions
3. Limit filesystem access to necessary directories
4. Regularly rotate API keys and tokens
5. Enable only required features and capabilities

## Troubleshooting

1. Verify file paths are absolute
2. Check environment variable values
3. Ensure proper file permissions
4. Review server logs for errors
5. Validate API credentials

See the [Troubleshooting Guide](troubleshooting.md) for more detailed help.