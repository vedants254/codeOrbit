# 🌌 CodeOrbit

**Navigate the Orbit of Your Codebase with AI**

CodeOrbit is an AI-powered code analysis platform that understands your codebase and connects directly to AI assistants like Claude. Ask questions, understand dependencies, and make changes with full context.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## 🎯 What Makes CodeOrbit Different?

Most code analysis tools just show you graphs. CodeOrbit goes further:

### 🔌 Direct AI Integration (MCP)
Talk to your codebase through Claude or any MCP-compatible AI assistant:
- "Analyze my project at /path/to/code"
- "What does UserController depend on?"
- "Show me complexity hotspots"
- "Build context for the checkout flow"

### 🧠 Three Ways to Use

1. **🤖 MCP Server** - Connect to Claude, Cline, or any MCP client
2. **📦 Python Library** - Integrate into your own tools
3. **🌐 Web Platform** - Beautiful UI for visualization

### 🎨 Smart Analysis
- Understands Python, JavaScript, TypeScript, React, Next.js
- Generates dependency graphs automatically
- Tracks what depends on what
- Finds complexity hotspots
- Builds AI-ready context

---

## 🚀 Quick Start

### Option 1: MCP with Claude (Recommended)

**Perfect for: Using AI to understand and work with code**

```bash
# 1. Install core library
cd core
pip install -e .

# 2. Install MCP server
cd ../mcp
pip install -e .

# 3. Configure Claude Desktop
# Add to ~/.config/Claude/claude_desktop_config.json:
{
  "mcpServers": {
    "codeorbit": {
      "command": "python",
      "args": ["-m", "codeorbit_mcp.server"]
    }
  }
}

# 4. Restart Claude and start analyzing!
```

**Then in Claude:**
```
Analyze my project at /Users/me/code/myapp
Search for authentication functions
What does PaymentService depend on?
```

📖 **Full MCP Guide:** [`QUICK_START_MCP.md`](./QUICK_START_MCP.md)

---

### Option 2: Python Library

**Perfect for: Building your own code analysis tools**

```bash
cd core
pip install -e .
```

```python
from codeorbit import GraphGenerator

# Analyze code
files = [{"path": "main.py", "content": "..."}]
gen = GraphGenerator(files=files)
result = gen.generate()

# Search and query
from codeorbit import GraphSearchTool
search = GraphSearchTool(gen)
results = search.fuzzy_search("authentication")
```

📖 **Core Library Docs:** [`core/README.md`](./core/README.md)

---

### Option 3: Full Web Platform

**Perfect for: Team visualization and documentation**

```bash
# Quick start with Docker
docker-compose up --build

# Access at http://localhost:3000
```

**Or manual setup:**
```bash
# Backend
cd backend
pip install -e .
uvicorn server:app --reload

# Frontend  
cd frontend
pnpm install
pnpm dev
```

---

## 🛠️ What Can You Do?

### With MCP (AI Integration)
- ✅ Analyze any codebase instantly
- ✅ Search for functions, classes, files
- ✅ Understand dependencies and relationships
- ✅ Find what depends on what (impact analysis)
- ✅ Get file context with imports/exports
- ✅ Build comprehensive AI context for changes
- ✅ Identify complexity hotspots
- ✅ Trace paths between code elements

### With Python Library
- ✅ Generate dependency graphs
- ✅ Parse Python, JS, TS, React, Next.js
- ✅ Export to JSON, GraphML, HTML
- ✅ Query and filter nodes
- ✅ Build custom analysis tools
- ✅ Integrate into CI/CD pipelines

### With Web Platform
- ✅ Visual dependency graphs
- ✅ Interactive code exploration
- ✅ AI chat with your codebase
- ✅ Auto-generate documentation
- ✅ Team collaboration features

---

## 📁 Project Structure

```
codeorbit/
├── core/           # 📦 Python library for code analysis
├── mcp/            # 🔌 MCP server for AI assistants
├── backend/        # 🚀 FastAPI web backend
├── frontend/       # 💻 Next.js web interface
└── docs/           # 📚 Documentation
```

**Each component works independently or together.**

---

## 🎨 Architecture

```
┌─────────────┐
│   Claude    │  "Analyze my code"
│  (or any    │
│ MCP client) │
└──────┬──────┘
       │ MCP Protocol
┌──────▼──────┐
│     mcp/    │  8 powerful tools
└──────┬──────┘
       │
┌──────▼──────┐
│    core/    │  Graph generation
│             │  AST parsing
└─────────────┘  Dependency analysis
```

---

## 🔧 Tech Stack

**Core Library:**
- Tree-sitter for AST parsing
- NetworkX for graph operations
- Supports Python, JS, TS, React, Next.js

**MCP Server:**
- Built on Model Context Protocol
- 8 analysis tools for AI assistants
- Compatible with Claude, Cline, and more

**Web Platform:**
- Backend: FastAPI + Python 3.10+
- Frontend: Next.js 14 + TypeScript
- UI: Tailwind CSS + ShadCN
- Viz: Interactive dependency graphs

---

## 📖 Documentation

- **[MCP Quick Start](./QUICK_START_MCP.md)** - Set up AI integration in 5 minutes
- **[MCP Tools Reference](./MCP_TOOLS_REFERENCE.md)** - All 8 tools explained
- **[Node Structure](./NODE_STRUCTURE.md)** - Understanding the graph data
- **[Folder Structure](./FOLDER_STRUCTURE.md)** - Project organization
- **[Core Library](./core/README.md)** - Python API documentation
- **[MCP Server](./mcp/README.md)** - MCP server details

---

## 🌟 Use Cases

### For Developers
- Understand new codebases quickly
- Find all usages before refactoring
- Identify dependencies before changes
- Map out complex relationships

### For AI-Assisted Development
- Let AI understand your codebase
- Build comprehensive context automatically
- Make changes with full awareness
- Analyze impact before modifications

### For Teams
- Onboard new developers faster
- Document architecture automatically
- Visualize system complexity
- Share codebase knowledge

### For Research & Analysis
- Study code structure patterns
- Analyze architectural decisions
- Track technical debt
- Measure code complexity

---

## 🎯 Example Workflows

### Understanding a New Codebase
```
1. "Analyze /path/to/project"
2. "What are the complexity hotspots?"
3. "Search for main entry points"
4. "Show me the authentication flow"
```

### Before Making Changes
```
1. "Search for UserService"
2. "What depends on UserService?"
3. "Build context for authentication with depth 2"
4. Make changes with full understanding
```

### Code Review
```
1. "Analyze the changes"
2. "What would break if we modify Database class?"
3. "Find the path from API to database"
4. Review with complete context
```

---

## 🔜 Roadmap

**Q1 2026:**
- [ ] VS Code extension
- [ ] More language support (Go, Rust, Java)
- [ ] Enhanced MCP tools (refactoring suggestions)
- [ ] Performance optimizations

**Q2 2026:**
- [ ] Real-time collaboration
- [ ] Security vulnerability detection
- [ ] Code quality metrics
- [ ] Team analytics

**Future:**
- [ ] Mobile apps
- [ ] JetBrains plugins
- [ ] Enterprise features
- [ ] Multi-repo analysis

---

## 🤝 Contributing

We welcome contributions!

**Ways to help:**
- 🐛 Report bugs
- 💡 Suggest features
- 📖 Improve docs
- 🔧 Submit PRs
- ⭐ Star the repo

**Quick start:**
```bash
git clone https://github.com/YOUR_USERNAME/codeorbit.git
cd codeorbit
# Make your changes
git checkout -b feature/your-feature
git commit -m "feat: your feature"
git push origin feature/your-feature
```

---

## 📄 License

- **Core Library & MCP Server**: Apache 2.0
- **Backend & Frontend**: AGPL 3.0

See individual LICENSE files for details.

---

## 🙏 Acknowledgments

Built with modern tools:
- **Tree-sitter** for parsing
- **Model Context Protocol** for AI integration
- **FastAPI** & **Next.js** for the platform
- All our amazing contributors

---

## 💬 Support

- 📖 Check the [documentation](./docs)
- 🐛 [Report issues](https://github.com/YOUR_USERNAME/codeorbit/issues)
- 💡 [Request features](https://github.com/YOUR_USERNAME/codeorbit/issues)
- ⭐ Star us on GitHub!

---

<div align="center">

**CodeOrbit** - Navigate the orbit of your codebase 🌌

Made with ❤️ by developers, for developers

[Get Started](#-quick-start) • [Documentation](./docs) • [MCP Guide](./QUICK_START_MCP.md)

</div>
