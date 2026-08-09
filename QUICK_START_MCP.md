# 🚀 Quick Start: CodeOrbit MCP Server

Get CodeOrbit integrated with Claude (or any MCP client) in 5 minutes.

## What You Get

Connect CodeOrbit directly to AI assistants like Claude for:
- **Instant codebase analysis** - "Analyze /path/to/my/project"
- **Smart code search** - "Find all authentication functions"
- **Dependency tracking** - "What does UserService depend on?"
- **AI-powered context** - "Build context for the login flow"
- **Complexity analysis** - "Show me the complexity hotspots"

## Installation

### Step 1: Install the Core Library

```bash
cd core
pip install -e .
# or with uv:
uv pip install -e .
```

### Step 2: Install the MCP Server

```bash
cd ../mcp
pip install -e .
# or with uv:
uv pip install -e .
```

### Step 3: Configure Claude Desktop

**On macOS:**
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**On Windows:**
Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "codeorbit": {
      "command": "python",
      "args": [
        "-m",
        "codeorbit_mcp.server"
      ],
      "env": {}
    }
  }
}
```

### Step 4: Restart Claude Desktop

Close and reopen Claude Desktop to load the MCP server.

## Usage Examples

Once configured, ask Claude:

### Analyze a Codebase
```
Analyze the codebase at /Users/me/projects/myapp
```

### Search for Code
```
Search for "authentication" functions in that codebase
```

### Understand Dependencies
```
What does the UserController depend on?
Show me what uses the Database class
```

### Build Context for Changes
```
I need to understand the checkout flow. Build context focusing on:
- CheckoutController
- PaymentService  
- OrderManager
```

### Find Complexity
```
What are the complexity hotspots in this codebase?
```

### Trace Connections
```
How is the API router connected to the database layer?
Find the path between UserController and DatabaseService
```

## Verify Installation

Test that the server is working:

```bash
python -m codeorbit_mcp.server
```

You should see the MCP server start (it will wait for stdio communication).
Press Ctrl+C to stop.

## Troubleshooting

### "Module not found: codeorbit"
Make sure you installed the core library first:
```bash
cd core
pip install -e .
```

### "Module not found: codeorbit_mcp"
Install the MCP server:
```bash
cd mcp
pip install -e .
```

### Claude doesn't show CodeOrbit tools
1. Check that claude_desktop_config.json is valid JSON
2. Restart Claude Desktop completely
3. Check Claude's MCP logs (see logs in the app)

### "Repository not analyzed" error
Always run the analyze command first:
```
Analyze the codebase at /path/to/project
```

Each repository needs to be analyzed before you can search or query it.

## What's Next?

- Explore the [full MCP documentation](./mcp/README.md)
- Check out [available tools](./mcp/README.md#available-tools)
- Read the [core library docs](./core/README.md)

## Advanced Configuration

### Custom Python Path

If Claude can't find your Python installation:

```json
{
  "mcpServers": {
    "codeorbit": {
      "command": "/full/path/to/python",
      "args": ["-m", "codeorbit_mcp.server"],
      "env": {}
    }
  }
}
```

### Use with Virtual Environment

```json
{
  "mcpServers": {
    "codeorbit": {
      "command": "/path/to/venv/bin/python",
      "args": ["-m", "codeorbit_mcp.server"],
      "env": {}
    }
  }
}
```

---

**Need Help?** Open an issue in the repository or check the full documentation.

**CodeOrbit** - Navigate the orbit of your codebase 🌌
