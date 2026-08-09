# 🎯 GitVizz - AI-Powered Code Analysis & Graph Search Library

<div align="center">

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The most comprehensive Python library for code analysis, dependency graphing, and intelligent search**

[📚 Documentation](./README.md) • [🔍 Examples](./examples/) • [🛠️ API Reference](./TOOLS_REFERENCE.md)

</div>

---

## ✨ What is GitVizz?

GitVizz is a **powerful Python library** that transforms how you analyze and understand codebases. It combines **advanced AST parsing**, **intelligent graph analysis**, and **20+ specialized search tools** to provide unprecedented insights into your code.

### 🎯 **Core Capabilities**

- **🔍 Intelligent Code Search** - Fuzzy search, pattern matching, and semantic analysis
- **📊 Visual Dependency Graphs** - Interactive visualizations with deep insights
- **🤖 LLM-Ready Analysis** - Generate formatted contexts for AI-powered code understanding
- **🔧 Advanced Tooling** - 20+ specialized tools for quality, security, and architecture analysis
- **🌐 Multi-Language Support** - Python, JavaScript, TypeScript, React, Next.js, and more
- **⚡ Chain-able Operations** - Compose complex analyses with simple, intuitive APIs

---

## 🚀 Quick Start

### Installation

```bash
# Install from GitHub (recommended)
pip install git+https://github.com/YOUR_USERNAME/GitVizz.git#subdirectory=gitvizz

# Or for development
git clone https://github.com/YOUR_USERNAME/GitVizz.git
cd GitVizz/gitvizz
pip install -e .[dev]
```

### 30-Second Demo

```python
from gitvizz import GraphGenerator, GraphSearchTool

# 🎯 Load any codebase instantly
graph = GraphGenerator.from_source("path/to/your/project")
search = GraphSearchTool(graph)

# 🔍 Intelligent search
auth_code = search.fuzzy_search("authentication")
auth_code.visualize()  # 🎨 Instant visualization!

# 🤖 Generate LLM-ready analysis
context = GraphSearchTool.build_llm_context(auth_code)
print(context)  # Perfect for ChatGPT/Claude/etc.
```

---

## 🎨 **Visual Code Analysis**

GitVizz creates **beautiful, interactive visualizations** that make complex codebases easy to understand:

### 🖼️ Interactive Dependency Graphs

```python
# Create stunning visualizations in seconds
generator = GraphGenerator.from_source("react-project.zip")
generator.visualize(height=800, node_color="category")
```

### 📊 Focus on What Matters

```python
# Search and visualize specific components
search = GraphSearchTool(generator)
api_components = search.fuzzy_search("api", depth=2)
api_components.visualize()  # See only API-related code
```

---

## 🔍 **Intelligent Search & Analysis**

### **Core Search Tools**

```python
# 🎯 Smart fuzzy search
results = search.fuzzy_search("database", similarity_threshold=0.7)

# 🏗️ Filter by code categories
classes = search.filter_by_category(["class", "interface"])

# 🔗 Relationship-based search
inheritance = search.find_by_relationship(["inherits", "implements"])

# 🎯 Local neighborhood analysis
neighbors = search.get_neighbors("UserService", depth=2)
```

### **Advanced Analysis Tools**

```python
# 🔥 Find complexity hotspots
hotspots = search.get_high_connectivity_nodes(min_connections=5)

# 🚨 Detect code quality issues
god_classes = search.find_anti_patterns("god_class")
cycles = search.find_circular_dependencies()

# 🗑️ Find unused code
unused = search.find_unused_code()

# 🔒 Security analysis
security_issues = search.find_security_hotspots()
```

---

## 🤖 **AI-Powered Code Understanding**

### Generate Perfect LLM Context

```python
# 🎯 Create comprehensive analysis reports
quality_issues = GraphSearchTool.combine_subgraphs(
    search.find_anti_patterns("god_class"),
    search.find_circular_dependencies(),
    search.find_unused_code()
)

# 🤖 Generate AI-ready context
report = GraphSearchTool.build_llm_context(
    quality_issues,
    context_type="review"
)

# Perfect for ChatGPT, Claude, etc.!
```

### LLM Context Output Format

````markdown
# Code Review Analysis

This analysis identifies potential issues and improvement opportunities.

## Search Result 1: anti_patterns

⚠️ Found 3 instances of god_class anti-pattern

Module {app.services.EmailService}
File: app/services.py
Defines:

EmailService (class) — lines 45–120
Relationship: app.services → app.services.EmailService (defines_class)

Code:

```python
class EmailService:
    # 75+ lines of code with multiple responsibilities
    def send_welcome_email(self, user): ...
    def render_template(self, template, context): ...
    def validate_email(self, email): ...
```
````

\

````

---

## 🛠️ **Complete Toolkit - 20+ Specialized Tools**

### 🔍 **Search & Discovery**
- `fuzzy_search()` - Smart text matching with similarity scoring
- `filter_by_category()` - Filter by node types (class, function, etc.)
- `find_by_relationship()` - Search by dependency relationships
- `get_neighbors()` - Analyze local neighborhoods

### 🔗 **Graph Traversal**
- `find_paths()` - Discover paths between components
- `get_connected_component()` - Find connected code clusters
- `find_data_flow()` - Trace data movement through code
- `get_dependency_layers()` - Analyze architectural layers

### 🚨 **Quality Analysis**
- `find_anti_patterns()` - Detect god classes, long methods, etc.
- `find_circular_dependencies()` - Identify problematic cycles
- `find_unused_code()` - Locate dead code
- `find_interface_violations()` - Spot architecture issues
- `find_similar_structures()` - Pattern matching across codebase

### 🔒 **Security & Testing**
- `find_security_hotspots()` - Identify security-sensitive code
- `find_test_coverage_gaps()` - Discover untested code
- `find_external_dependencies()` - Analyze third-party usage
- `find_entry_points()` - Locate application entry points

### 🎯 **Composition & Utilities**
- `combine_subgraphs()` - Merge multiple analyses
- `build_llm_context()` - Generate AI-ready reports
- `get_statistics()` - Comprehensive metrics

---

## 🎨 **Beautiful Visualizations**

### Jupyter Notebook Integration

```python
# Perfect for exploratory analysis
from gitvizz import GraphGenerator, GraphSearchTool

# Load your project
graph = GraphGenerator.from_source("../my-project")
search = GraphSearchTool(graph)

# Interactive visualizations
search.fuzzy_search("authentication").visualize(height=600)
search.find_anti_patterns("god_class").visualize(node_color="category")
search.get_high_connectivity_nodes().visualize()
````

### Customizable Visualizations

```python
# Highly customizable graphs
generator.visualize(
    height=800,
    width=1200,
    node_color="category",        # Color by node type
    node_size="connectivity",     # Size by connections
    layout="spring",              # Force-directed layout
    physics=True,                 # Interactive physics
    filter_nodes=["class", "function"]  # Show only specific types
)
```

---

## 🔄 **Chain-able Operations**

GitVizz's **subgraph-centric API** makes complex analysis incredibly simple:

```python
# 🎯 Every method returns a visualizable subgraph
db_subgraph = search.fuzzy_search("database")

# 🔄 Chain operations naturally
db_search = GraphSearchTool(db_subgraph)
security_issues = db_search.find_security_hotspots()

# 🎨 Visualize any result instantly
security_issues.visualize()

# 🤖 Generate targeted reports
security_report = GraphSearchTool.build_llm_context(
    security_issues,
    context_type="security"
)
```

### Real-World Workflow Examples

```python
# 📋 Code Review Preparation
review_issues = GraphSearchTool.combine_subgraphs(
    search.find_anti_patterns("god_class"),
    search.find_circular_dependencies(),
    search.find_unused_code(),
    search.find_security_hotspots()
)
review_report = GraphSearchTool.build_llm_context(review_issues, context_type="review")

# 🏗️ Architecture Analysis
arch_analysis = GraphSearchTool.combine_subgraphs(
    search.get_dependency_layers(),
    search.get_high_connectivity_nodes(),
    search.find_entry_points()
)
arch_report = GraphSearchTool.build_llm_context(arch_analysis)

# 🧪 Test Strategy Planning
test_analysis = GraphSearchTool.combine_subgraphs(
    search.find_test_coverage_gaps(),
    search.get_high_connectivity_nodes(),
    search.find_anti_patterns("long_method")
)
```

---

## 🌐 **Multi-Language Support**

| Language/Framework | Extensions      | Features                                 |
| ------------------ | --------------- | ---------------------------------------- |
| **Python**         | `.py`, `.ipynb` | Classes, functions, imports, inheritance |
| **JavaScript**     | `.js`           | Functions, classes, ES6 modules          |
| **React**          | `.jsx`          | Components, hooks, props                 |
| **TypeScript**     | `.ts`           | Interfaces, types, generics              |
| **Next.js**        | `.tsx`          | Pages, API routes, components            |

### Automatic Project Detection

```python
# GitVizz automatically detects project types
generator = GraphGenerator.from_source("nextjs-app/")
# Detected: Next.js → Uses specialized parsing

generator = GraphGenerator.from_source("django-project/")
# Detected: Python → Includes Django patterns

generator = GraphGenerator.from_source("react-native-app/")
# Detected: React → Mobile-specific analysis
```

---

## 📊 **Data Sources & Formats**

### **Flexible Input Sources**

```python
# 📁 From directories
GraphGenerator.from_source("/path/to/project")

# 📦 From ZIP files
GraphGenerator.from_source("repository.zip")

# 🌐 From GitHub downloads
GraphGenerator.from_source("project-main.zip")

# 📓 From Jupyter notebooks
GraphGenerator.from_source("notebooks/", file_extensions=[".ipynb"])
```

### **Smart Filtering & Configuration**

```python
# 🎯 Focused analysis
generator = GraphGenerator.from_source(
    "large-project/",
    file_extensions=[".py", ".js"],     # Only these types
    max_files=100,                      # Limit for performance
    ignore_patterns=[                   # Skip these patterns
        "**/test_*",
        "**/node_modules/**",
        "**/__pycache__/**"
    ]
)
```

### **Export Formats**

```python
# 💾 Multiple export options
generator.save_json("analysis.json")           # Detailed JSON
generator.save_graphml("graph.graphml")       # NetworkX format
generator.save_csv("nodes.csv", "edges.csv")  # Spreadsheet analysis
nx_graph = generator.to_networkx()            # NetworkX for analysis
```

---

## 🎯 **Real-World Use Cases**

### **🔍 Code Reviews**

```python
# Automated code quality analysis
issues = GraphSearchTool.combine_subgraphs(
    search.find_anti_patterns("god_class"),
    search.find_circular_dependencies(),
    search.find_security_hotspots()
)
review_checklist = GraphSearchTool.build_llm_context(issues, context_type="review")
```

### **🏗️ Architecture Assessment**

```python
# Understand system architecture
layers = search.get_dependency_layers()
hotspots = search.get_high_connectivity_nodes()
entry_points = search.find_entry_points()

arch_overview = GraphSearchTool.combine_subgraphs(layers, hotspots, entry_points)
```

### **🔒 Security Audits**

```python
# Security-focused analysis
security_code = search.find_security_hotspots()
external_deps = search.find_external_dependencies()
auth_flows = search.fuzzy_search("auth", depth=3)

security_report = GraphSearchTool.combine_subgraphs(security_code, external_deps, auth_flows)
```

### **🧪 Test Planning**

```python
# Identify testing priorities
untested = search.find_test_coverage_gaps()
complex_code = search.get_high_connectivity_nodes()
critical_paths = search.find_paths("main", "database")

test_strategy = GraphSearchTool.combine_subgraphs(untested, complex_code, critical_paths)
```

### **♻️ Refactoring Planning**

```python
# Find refactoring opportunities
god_classes = search.find_anti_patterns("god_class")
long_methods = search.find_anti_patterns("long_method")
unused_code = search.find_unused_code()

refactoring_plan = GraphSearchTool.combine_subgraphs(god_classes, long_methods, unused_code)
```

---

## 🔧 **Advanced Features**

### **Custom Analysis Pipelines**

```python
class MyAnalysisPipeline:
    def __init__(self, source_path):
        self.graph = GraphGenerator.from_source(source_path)
        self.search = GraphSearchTool(self.graph)

    def full_quality_analysis(self):
        """Comprehensive code quality analysis."""
        return GraphSearchTool.combine_subgraphs(
            self.search.find_anti_patterns("god_class"),
            self.search.find_anti_patterns("long_method"),
            self.search.find_circular_dependencies(),
            self.search.find_unused_code(),
            self.search.find_interface_violations()
        )

    def security_audit(self):
        """Security-focused analysis."""
        return GraphSearchTool.combine_subgraphs(
            self.search.find_security_hotspots(),
            self.search.find_external_dependencies(),
            self.search.fuzzy_search("password|token|secret", depth=2)
        )

    def generate_report(self):
        """Generate comprehensive analysis report."""
        quality = self.full_quality_analysis()
        security = self.security_audit()

        return {
            "quality_report": GraphSearchTool.build_llm_context(quality, context_type="review"),
            "security_report": GraphSearchTool.build_llm_context(security, context_type="security")
        }
```

### **Integration with Analysis Tools**

```python
# NetworkX integration for advanced graph analysis
nx_graph = generator.to_networkx()

# Centrality analysis
centrality = nx.betweenness_centrality(nx_graph)
most_central = max(centrality.items(), key=lambda x: x[1])

# Community detection
communities = nx.community.greedy_modularity_communities(nx_graph.to_undirected())

# Path analysis
shortest_paths = dict(nx.all_pairs_shortest_path_length(nx_graph))
```

### **Modal Serverless Integration**

```python
from gitvizz import generate_graph, MODAL_AVAILABLE

if MODAL_AVAILABLE:
    # Scale analysis to the cloud
    result = generate_graph.remote(files_data, output_html_path="graph.html")

    # Batch processing
    batch_results = generate_graphs_batch.remote([
        {"files_data": project1_files},
        {"files_data": project2_files}
    ])
```

---

## 📚 **Examples & Tutorials**

### **📓 Jupyter Notebooks**

Explore our comprehensive examples:

- [`examples/graph_search_demo.ipynb`](./examples/graph_search_demo.ipynb) - **Complete GraphSearchTool demo**
- [`examples/graph_visualization_demo.ipynb`](./examples/graph_visualization_demo.ipynb) - **Visualization techniques**

### **🧪 Test Files**

See real usage in our test suite:

- [`test/graph_generator_test.py`](./test/graph_generator_test.py) - **Complete test suite**
- [`test/graph_search_tool_test.py`](./test/graph_search_tool_test.py) - **API examples**
- [`test/advanced_tools_test.py`](./test/advanced_tools_test.py) - **Advanced analysis scenarios**

---

## 🔗 **GitVizz Ecosystem**

This library is part of the larger **GitVizz ecosystem**:

### **🌐 [GitVizz Platform](https://gitvizz.com)**

- Web-based repository analysis
- AI-powered code chat
- Visual dashboard
- Team collaboration features

### **📚 Full GitVizz Repository**

- Complete platform source code
- Web interface
- Backend API
- Docker deployment

### **🛠️ This Library**

- Core analysis engine
- Python API
- Jupyter integration
- Command-line tools

---

## 🤝 **Contributing**

We love contributions! Here's how to get started:

```bash
# 🚀 Quick setup
git clone https://github.com/YOUR_USERNAME/GitVizz.git
cd GitVizz/gitvizz
pip install -e .[dev]

# 🧪 Run tests
pytest

# ✨ Format code
black gitvizz/
isort gitvizz/

# 🎯 Type checking
mypy gitvizz/
```

### **Areas where we need help:**

- 🌐 **New language parsers** (Go, Rust, Java, C++)
- 🎨 **Visualization improvements**
- 🔍 **Additional analysis tools**
- 📚 **Documentation & examples**
- 🐛 **Bug reports & fixes**

---

## 📈 **Performance & Scalability**

GitVizz is designed for **real-world codebases**:

- ⚡ **Fast parsing** with Tree-sitter
- 🎯 **Smart filtering** to focus on relevant code
- 💾 **Memory efficient** graph operations
- 🔄 **Incremental analysis** for large projects
- ☁️ **Cloud scaling** with Modal integration

### **Benchmarks**

| Project Size                | Files  | Analysis Time     | Memory Usage  |
| --------------------------- | ------ | ----------------- | ------------- |
| **Small** (< 100 files)     | ~50    | < 5 seconds       | < 100MB       |
| **Medium** (< 1000 files)   | ~500   | < 30 seconds      | < 500MB       |
| **Large** (< 10k files)     | ~5000  | < 5 minutes       | < 2GB         |
| **Enterprise** (10k+ files) | 50000+ | Modal recommended | Cloud scaling |

---

## 📄 **License & Support**

**MIT License** - Use GitVizz in any project, commercial or open-source!

### **Get Help**

- 📖 **Documentation** - Comprehensive guides
- 🐛 **Issues** - Bug reports & feature requests
- 💬 **Discussions** - Community support

---

## 🎉 **What's New**

### **v0.2.0** - The GraphSearchTool Revolution

- ✨ **20+ Advanced Analysis Tools** - From security audits to refactoring planning
- 🎯 **Subgraph-Centric API** - Every method returns visualizable results
- 🔄 **Chainable Operations** - Compose complex analyses easily
- 🤖 **Enhanced LLM Integration** - Perfect context generation for AI tools
- 🎨 **Improved Visualizations** - More beautiful, more interactive
- ⚡ **Performance Optimizations** - Faster analysis for large codebases

### **v0.1.x** - Foundation

- 🌐 **Multi-language support** (Python, JS, TS, React, Next.js)
- 📊 **Dependency graph generation** with Tree-sitter
- 🎨 **Interactive visualizations**
- ☁️ **Modal integration** for serverless processing
- 📦 **`from_source()` method** for easy loading

---

<div align="center">

**🚀 Ready to revolutionize your code analysis?**

```bash
pip install git+https://github.com/YOUR_USERNAME/GitVizz.git#subdirectory=gitvizz
```

**📚 Read the Docs** • **🔍 Explore Examples** • **🛠️ API Reference**

</div>

---

_Built with ❤️ by the GitVizz team. Empowering developers to understand code like never before._
