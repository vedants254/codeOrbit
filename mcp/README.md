# CodeOrbit MCP Server

**Navigate the Orbit of Your Codebase with AI**

CodeOrbit MCP Server exposes powerful codebase analysis capabilities to AI assistants like Claude through the Model Context Protocol (MCP). Analyze code structure, understand dependencies, and navigate complex codebases with AI assistance.

## 🌌 Features

- **🔍 Code Analysis**: Automatically analyze any codebase and generate dependency graphs
- **🎯 Smart Search**: Fuzzy search for functions, classes, files, and more
- **🕸️ Dependency Tracking**: Understand what depends on what
- **🧠 LLM Context Building**: Automatically gather relevant code context for AI understanding
- **🔥 Complexity Detection**: Identify hotspots and complex areas in your codebase
- **🛤️ Path Finding**: Discover how different parts of your code connect

## 📦 Installation

### Using `uv` (Recommended)

```bash
cd codeorbit-mcp
uv pip install -e .
```

### Using pip

```bash
cd codeorbit-mcp
pip install -e .
```

## 🔧 Configuration

### For Claude Desktop

Add this to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "codeorbit": {
      "command": "python",
      "args": ["-m", "codeorbit_mcp.server"],
      "env": {}
    }
  }
}
```

### For Other MCP Clients

The server uses stdio for communication. You can run it with:

```bash
python -m codeorbit_mcp.server
```

## 🛠️ Available Tools

### 1. `analyze_codebase`

Analyze a repository and generate its dependency graph.

**Parameters:**
- `repo_path` (string, required): Path to the repository
- `include_patterns` (array, optional): File patterns to include
- `exclude_patterns` (array, optional): File patterns to exclude

**Example:**
```
Analyze the codebase at /path/to/project
```

### 2. `search_code`

Search for code elements using fuzzy matching.

**Parameters:**
- `repo_path` (string, required): Repository path
- `query` (string, required): Search query
- `element_types` (array, optional): Filter by types (function, class, method, file, import)

**Example:**
```
Search for "authentication" in /path/to/project
```

### 3. `get_dependencies`

Get what a code element depends on.

**Parameters:**
- `repo_path` (string, required)
- `element_name` (string, required)
- `depth` (integer, optional): Depth of dependency tree (default: 1)

**Example:**
```
Get dependencies of UserController in /path/to/project
```

### 4. `get_dependents`

Get what depends on a code element.

**Parameters:**
- `repo_path` (string, required)
- `element_name` (string, required)
- `depth` (integer, optional): Depth of dependent tree (default: 1)

**Example:**
```
Get dependents of User class in /path/to/project
```

### 5. `get_file_context`

Get comprehensive context for a specific file.

**Parameters:**
- `repo_path` (string, required)
- `file_path` (string, required): Relative path to file

**Example:**
```
Get context for src/auth/login.ts in /path/to/project
```

### 6. `build_llm_context`

Build comprehensive context for AI understanding of specific areas.

**Parameters:**
- `repo_path` (string, required)
- `focus_elements` (array, required): List of code elements to focus on
- `context_depth` (integer, optional): Dependency depth to include (default: 2)

**Example:**
```
Build LLM context for ["UserService", "AuthController"] in /path/to/project with depth 2
```

### 7. `get_complexity_hotspots`

Identify the most complex/connected areas in the codebase.

**Parameters:**
- `repo_path` (string, required)
- `limit` (integer, optional): Number of hotspots to return (default: 10)

**Example:**
```
Get complexity hotspots in /path/to/project
```

### 8. `find_path_between`

Find dependency paths between two code elements.

**Parameters:**
- `repo_path` (string, required)
- `from_element` (string, required)
- `to_element` (string, required)
- `max_paths` (integer, optional): Maximum paths to return (default: 3)

**Example:**
```
Find path between UserController and DatabaseService in /path/to/project
```

## 💡 Usage Examples with Claude

Once configured, you can ask Claude natural language questions:

- "Analyze the codebase at /Users/me/projects/myapp"
- "Search for authentication functions in that codebase"
- "What does the UserController depend on?"
- "Show me what uses the Database class"
- "Build context for me to understand the login flow - focus on LoginController and AuthService"
- "What are the complexity hotspots in this codebase?"
- "How is the API router connected to the database layer?"

## 🏗️ Architecture

```
┌─────────────────┐
│  Claude/AI      │
│  Assistant      │
└────────┬────────┘
         │ MCP Protocol
┌────────▼────────┐
│  CodeOrbit      │
│  MCP Server     │
└────────┬────────┘
         │
┌────────▼────────┐
│  CodeOrbit Core │
│  Library        │
└─────────────────┘
```

The MCP server acts as a bridge between AI assistants and the CodeOrbit core analysis engine.


## 🔄 Workflow Example

1. **Analyze a codebase:**
   - "Analyze /path/to/my/project"
   - Server generates dependency graph and caches it

2. **Explore the code:**
   - "Search for payment processing functions"
   - "What does PaymentService depend on?"
   - "Show me what uses the User model"

3. **Make informed changes:**
   - "Build context for the checkout flow"
   - AI assistant now understands relevant code structure
   - You can ask the AI to make changes with full context

4. **Understand impact:**
   - "What would be affected if I change the Database class?"
   - "Show me the path from the API endpoint to the database"

## 🚦 Supported Languages

- Python (`.py`)
- JavaScript (`.js`)
- TypeScript (`.ts`)
- React/JSX (`.jsx`, `.tsx`)
- Next.js applications

## 🔒 Security & Privacy

- All analysis happens **locally** on your machine
- No code is sent to external servers
- The MCP server only analyzes what you explicitly request
- Graph data is cached in memory for the session

## 🤝 Contributing

We welcome contributions! Areas for improvement:

- Additional language parsers
- Performance optimizations
- More analysis tools
- Better error handling

## 📝 License

Apache License 2.0 - See LICENSE file for details

## 🔗 Related Projects

- **CodeOrbit Platform**: Full-featured web platform at [Repository Root](..)
- **CodeOrbit Core Library**: Standalone analysis library at [../core](../core)

## 🐛 Troubleshooting

### Server doesn't start
- Ensure Python 3.10+ is installed
- Check that all dependencies are installed: `uv pip install -e .`
- Verify the path in your MCP configuration

### "Repository not analyzed" error
- Always run `analyze_codebase` before other operations
- Each repository path needs to be analyzed separately

### Performance issues with large codebases
- Use `exclude_patterns` to skip irrelevant directories
- Limit `include_patterns` to specific file types
- Consider analyzing specific subdirectories instead of entire monorepos

## 📚 Learn More

- [MCP Documentation](https://modelcontextprotocol.io/)
- [CodeOrbit Core Docs](../core/README.md)
- [Full Platform Docs](../README.md)

---

**CodeOrbit** - Navigate the orbit of your codebase 🌌
