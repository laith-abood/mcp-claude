# Package Installation Guide

This guide details how to install all required packages and dependencies for each MCP server type.

## Global Dependencies

First, install the global prerequisites:

```bash
# Install Node.js (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc  # or source ~/.zshrc
nvm install 18
nvm use 18

# Install Python 3.10+
brew install python@3.10  # macOS
sudo apt-get install python3.10  # Ubuntu/Debian

# Install uvx
pip install uv
uv pip install -U uvx

# Install Prover9 (for logic server)
brew install prover9  # macOS
```

## Node.js Servers

Install Node.js dependencies for TypeScript-based servers:

```bash
# Install global dependencies
npm install -g typescript ts-node @types/node

# Core MCP packages
npm install -g @modelcontextprotocol/sdk
npm install -g @modelcontextprotocol/create-server

# Server-specific packages
npm install -g @modelcontextprotocol/server-brave-search
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-memory
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-sequential-thinking
npm install -g @modelcontextprotocol/server-everything
```

## Python Servers

Set up Python environments and install dependencies for Python-based servers:

```bash
# Create and activate virtual environment
python3.10 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Fetch server
cd src/fetch
python -m pip install -e .

# Git server
cd ../git
python -m pip install -e .

# SQLite server
cd ../sqlite
python -m pip install -e .

# Time server
cd ../time
python -m pip install -e .

# Logic server
cd ../logic
python -m pip install -e .
```

## Individual Server Dependencies

### Brave Search Server
```bash
npm install axios
```

### GitHub Server
```bash
npm install @octokit/rest @octokit/types
```

### Google Drive Server
```bash
npm install googleapis@105 google-auth-library
```

### Memory Server
```bash
npm install @modelcontextprotocol/server-memory
npm install sentence-transformers # for vector embeddings
```

### SQLite Server
```bash
pip install aiosqlite
```

### Filesystem Server
```bash
npm install chokidar mime-types
```

### Sequential Thinking Server
```bash
npm install @modelcontextprotocol/server-sequential-thinking
```

### Time Server
```bash
pip install pytz dateutil
```

### Logic Server
```bash
pip install mcp-logic prover9-mace4
```

## Development Tools

Install development and testing tools:

```bash
# Testing
npm install -g jest @types/jest ts-jest
npm install -g supertest @types/supertest

# Linting
npm install -g eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Documentation
npm install -g typedoc

# Build tools
npm install -g esbuild
```

## Verification

Verify installations:

```bash
# Node.js
node --version  # Should be 18.0.0+
npm --version   # Should be 9.0.0+

# Python
python --version  # Should be 3.10+
pip --version

# TypeScript
tsc --version

# Test MCP SDK
npx @modelcontextprotocol/sdk --version

# Test uvx
uvx --version
```

## Troubleshooting Package Installation

### Node.js Issues

1. Clear npm cache:
```bash
npm cache clean --force
```

2. Rebuild node_modules:
```bash
rm -rf node_modules/
rm package-lock.json
npm install
```

### Python Issues

1. Upgrade pip:
```bash
python -m pip install --upgrade pip
```

2. Install wheel:
```bash
pip install wheel
```

3. Rebuild virtual environment:
```bash
rm -rf venv/
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Permission Issues

1. Fix npm permissions:
```bash
sudo chown -R $USER:$GROUP ~/.npm
sudo chown -R $USER:$GROUP ~/.config
```

2. Fix Python permissions:
```bash
sudo chown -R $USER:$GROUP ~/venv
```

See the [Troubleshooting Guide](troubleshooting.md) for more detailed help with package-related issues.