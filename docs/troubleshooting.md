# Troubleshooting Guide

This guide covers common issues you might encounter when working with MCP servers and their solutions.

## General Issues

### Server Won't Start

**Symptoms:**
- Server crashes immediately
- No response when running server
- "Connection refused" errors

**Solutions:**

1. Check environment variables:
```bash
# List all environment variables
env | grep MCP_
```

2. Verify file permissions:
```bash
chmod +x dist/*/index.js
```

3. Check port conflicts:
```bash
# For servers using specific ports
lsof -i :<port-number>
```

### Build Failures

**Symptoms:**
- TypeScript compilation errors
- Missing dependencies
- `dist` directory not generating properly

**Solutions:**

1. Clean and rebuild:
```bash
rm -rf dist/
rm -rf node_modules/
npm install
npm run build
```

2. Check TypeScript version:
```bash
npm list typescript
```

3. Verify tsconfig.json settings:
```bash
npx tsc --showConfig
```

## Server-Specific Issues

### Google Drive Server

**Issue:** Authentication failures

**Solutions:**
1. Check credentials file exists:
```bash
ls ~/.gdrive-server/credentials.json
```

2. Verify token permissions:
```bash
node dist/gdrive/index.js auth --check
```

3. Reset authentication:
```bash
rm ~/.gdrive-server/token.json
node dist/gdrive/index.js auth
```

### GitHub Server

**Issue:** Rate limit exceeded

**Solutions:**
1. Check remaining rate limit:
```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit
```

2. Use authenticated requests:
```bash
export GITHUB_TOKEN="your-token"
```

### Brave Search Server

**Issue:** API key validation errors

**Solutions:**
1. Verify API key format:
```bash
echo $BRAVE_API_KEY | grep -E '^[A-Za-z0-9]{32}$'
```

2. Test API key:
```bash
curl -H "X-Subscription-Token: $BRAVE_API_KEY" \
  "https://api.search.brave.com/res/v1/web/search?q=test"
```

### SQLite Server

**Issue:** Database access errors

**Solutions:**
1. Check database file permissions:
```bash
ls -l ~/.claude/sqlite/
```

2. Verify database exists:
```bash
sqlite3 ~/.claude/sqlite/test.db ".tables"
```

3. Reset database:
```bash
rm ~/.claude/sqlite/test.db
node dist/sqlite/index.js init
```

## Python Server Issues

### Environment Setup

**Issue:** Missing dependencies

**Solutions:**
1. Rebuild Python environment:
```bash
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

2. Check Python version:
```bash
python --version
```

### Server Communication

**Issue:** STDIO communication errors

**Solutions:**
1. Check server process:
```bash
ps aux | grep mcp-server
```

2. Monitor server output:
```bash
node dist/<server>/index.js 2>server.log
```

## Development Environment Issues

### VSCode Integration

**Issue:** Intellisense not working

**Solutions:**
1. Reload TypeScript server:
   - Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
   - Type "TypeScript: Restart TS Server"

2. Check TypeScript version:
   - Open a `.ts` file
   - Click on TypeScript version in status bar
   - Select "Use Workspace Version"

### Testing Issues

**Issue:** Tests failing unexpectedly

**Solutions:**
1. Run specific test:
```bash
npm test -- -t "test name"
```

2. Debug test:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Performance Issues

### Memory Usage

**Issue:** High memory consumption

**Solutions:**
1. Check memory usage:
```bash
ps -o pid,rss,command | grep node
```

2. Monitor memory over time:
```bash
node --trace-gc dist/<server>/index.js
```

### Response Times

**Issue:** Slow server responses

**Solutions:**
1. Enable debug logging:
```bash
DEBUG=mcp:* node dist/<server>/index.js
```

2. Profile server:
```bash
node --prof dist/<server>/index.js
```

## Configuration Issues

### Environment Variables

**Issue:** Missing or invalid configuration

**Solutions:**
1. Verify environment:
```bash
node -e 'console.log(process.env)'
```

2. Check configuration file:
```bash
cat ~/.config/mcp/config.json
```

3. Reset configuration:
```bash
rm ~/.config/mcp/config.json
node dist/<server>/index.js init
```

## Getting Help

If you're still experiencing issues:

1. Check server logs:
```bash
tail -f ~/.mcp/logs/<server>.log
```

2. Enable debug mode:
```bash
DEBUG=* node dist/<server>/index.js
```

3. File an issue on GitHub with:
   - Server version
   - Error messages
   - Steps to reproduce
   - Environment details