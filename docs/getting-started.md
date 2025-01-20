# Getting Started with MCP Servers

## Prerequisites

- Node.js 18.0.0+ 
- Python 3.10+
- Git
- Operating System: macOS, Linux, or Windows with WSL
- Docker (optional, for containerized development)
- Visual Studio Code (recommended)

## Initial Setup

1. Clone the repository:
```bash
git clone https://github.com/modelcontextprotocol/mcp-servers.git
cd mcp-servers
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up Python environment and dependencies:
```bash
# Install Python dependencies for servers that use Python
cd src/fetch && python -m pip install -e .
cd ../git && python -m pip install -e .
cd ../sqlite && python -m pip install -e .
cd ../time && python -m pip install -e .
```

4. Configure environment:
   - Create a `.env` file in the root directory
   - Populate with necessary API keys and configuration (see Configuration section)

5. Build all servers:
```bash
npm run build
```

## Configuration

Each server may require specific environment variables and configuration. Here are the key variables needed:

### Brave Search
```bash
BRAVE_API_KEY="your-api-key"
```

### Google Drive
```bash
GDRIVE_CREDENTIALS_PATH="path/to/credentials.json"
GDRIVE_TOKEN_PATH="path/to/token.json"
```

### GitHub
```bash
GITHUB_TOKEN="your-github-token"
```

### Time Server
```bash
DEFAULT_TIMEZONE="America/Los_Angeles" # Optional, defaults to system timezone
```

## Development Workflow

1. Start development mode:
```bash
npm run watch
```

2. Run a specific server:
```bash
# TypeScript servers
node dist/<server-name>/index.js

# Python servers
python -m mcp_server_<server_name>
```

3. Test your changes:
```bash
npm test
```

4. Build for production:
```bash
npm run build
```

## Project Structure

```
mcp-servers/
├── docs/              # Documentation
├── src/               # Source code for all servers
│   ├── brave-search/  # Brave Search API integration
│   ├── gdrive/       # Google Drive integration
│   ├── github/       # GitHub API integration
│   └── ...           # Other server implementations
├── scripts/          # Build and development scripts
└── package.json      # Project configuration
```

## Common Issues and Troubleshooting

### Build Errors

1. Clean the build and node modules:
```bash
rm -rf dist/
rm -rf node_modules/
npm install
npm run build
```

2. TypeScript errors:
   - Ensure you're using the correct Node.js version
   - Check `tsconfig.json` settings
   - Run `npm run type-check` for detailed errors

### Server Connection Issues

1. Check environment variables are properly set
2. Verify API keys and tokens are valid
3. Check server logs for detailed error messages
4. Ensure required ports are not in use

### Python Server Issues

1. Verify Python version matches requirements
2. Rebuild Python environment:
```bash
rm -rf venv/
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -e .
```

## Contributing

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following project conventions
3. Run tests and linting:
```bash
npm test
npm run lint
```

4. Submit a pull request

For detailed contribution guidelines, see CONTRIBUTING.md in the root directory.