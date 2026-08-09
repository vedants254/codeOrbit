# GraphSearchTool Complete Reference

**All methods return GraphGenerator subgraphs that can be directly visualized and chained**

## 🔍 Core Search Tools

### `fuzzy_search(query, categories=None, similarity_threshold=0.3, max_results=20, depth=1)`
- **Purpose**: Fuzzy string matching across node names, IDs, and code content
- **Returns**: Subgraph with matching nodes and their context
- **Use Cases**: Finding specific functions, classes, or patterns
- **Example**: `search.fuzzy_search("database", depth=2)`

### `filter_by_category(categories, depth=1)`
- **Purpose**: Filter nodes by their categories (class, function, method, etc.)
- **Returns**: Subgraph containing only specified node types
- **Use Cases**: Analyzing all classes, finding all functions
- **Example**: `search.filter_by_category(["class", "interface"])`

### `find_by_relationship(relationship_types, depth=1)`
- **Purpose**: Find nodes connected by specific relationship types
- **Returns**: Subgraph of nodes with specified relationships
- **Use Cases**: Analyzing inheritance, dependencies, calls
- **Example**: `search.find_by_relationship(["inherits", "implements"])`

## 🔗 Graph Traversal Tools

### `get_neighbors(node_id, direction="both", relationship_types=None, depth=1)`
- **Purpose**: Get neighboring nodes of a specific node
- **Returns**: Subgraph containing the node and its neighbors
- **Use Cases**: Understanding local dependencies, impact analysis
- **Example**: `search.get_neighbors("api.UserService", direction="out")`

### `find_paths(source_id, target_id, max_paths=5, max_length=6)`
- **Purpose**: Find paths between two nodes
- **Returns**: Subgraph containing all nodes and edges in found paths
- **Use Cases**: Tracing dependencies, understanding data flow
- **Example**: `search.find_paths("main", "DatabaseConnection")`

### `get_connected_component(node_id)`
- **Purpose**: Get the entire connected component containing a node
- **Returns**: Subgraph of the connected component
- **Use Cases**: Finding isolated modules, understanding connectivity
- **Example**: `search.get_connected_component("auth.AuthService")`

### `find_data_flow(start_node, end_node=None)`
- **Purpose**: Trace data flow from a starting node
- **Returns**: Subgraph showing data flow paths
- **Use Cases**: Understanding how data moves through the system
- **Example**: `search.find_data_flow("user_input", "database_save")`

## 🔥 Analysis Tools

### `get_high_connectivity_nodes(min_connections=3, depth=1)`
- **Purpose**: Find nodes with high connectivity (complexity hotspots)
- **Returns**: Subgraph containing high-connectivity nodes and context
- **Use Cases**: Identifying complex areas, refactoring candidates
- **Example**: `search.get_high_connectivity_nodes(min_connections=5)`

### `get_dependency_layers()`
- **Purpose**: Analyze architectural layers and dependencies
- **Returns**: Subgraph showing layered architecture
- **Use Cases**: Understanding system architecture, layer violations
- **Example**: `search.get_dependency_layers()`

### `find_entry_points()`
- **Purpose**: Find application entry points (main functions, modules)
- **Returns**: Subgraph containing entry points and immediate dependencies
- **Use Cases**: Understanding application structure, tracing execution flow
- **Example**: `search.find_entry_points()`

### `find_external_dependencies()`
- **Purpose**: Find external dependencies and third-party imports
- **Returns**: Subgraph containing external dependencies
- **Use Cases**: Dependency analysis, security auditing
- **Example**: `search.find_external_dependencies()`

## 🚨 Quality Analysis Tools

### `find_unused_code(min_depth=2)`
- **Purpose**: Find potentially unused code (unreachable from entry points)
- **Returns**: Subgraph containing potentially unused code
- **Use Cases**: Dead code elimination, cleanup
- **Example**: `search.find_unused_code()`

### `find_circular_dependencies()`
- **Purpose**: Find circular dependencies in the code
- **Returns**: Subgraph containing nodes involved in cycles
- **Use Cases**: Architecture validation, dependency cleanup
- **Example**: `search.find_circular_dependencies()`

### `find_anti_patterns(pattern_type="god_class")`
- **Purpose**: Find common anti-patterns in code
- **Options**: `"god_class"`, `"long_method"`, `"deep_nesting"`
- **Returns**: Subgraph containing anti-pattern instances
- **Use Cases**: Code quality analysis, refactoring planning
- **Example**: `search.find_anti_patterns("god_class")`

### `find_interface_violations()`
- **Purpose**: Find potential interface/abstraction violations
- **Returns**: Subgraph containing violation instances
- **Use Cases**: Architecture review, design pattern compliance
- **Example**: `search.find_interface_violations()`

### `find_similar_structures(pattern_subgraph, similarity_threshold=0.7)`
- **Purpose**: Find code structures similar to a given pattern
- **Returns**: Subgraph containing similar structures
- **Use Cases**: Pattern detection, consistency analysis
- **Example**: `search.find_similar_structures(service_pattern)`

## 🧪 Testing Tools

### `find_test_coverage_gaps()`
- **Purpose**: Find code that appears to lack test coverage
- **Returns**: Subgraph containing untested code
- **Use Cases**: Test planning, coverage improvement
- **Example**: `search.find_test_coverage_gaps()`

## 🔒 Security Tools

### `find_security_hotspots()`
- **Purpose**: Find potential security hotspots in code
- **Returns**: Subgraph containing security-sensitive code
- **Use Cases**: Security auditing, vulnerability assessment
- **Example**: `search.find_security_hotspots()`

## 🛠️ Utility Tools

### `combine_subgraphs(*subgraphs)`
- **Purpose**: Combine multiple subgraphs into one
- **Returns**: Combined GraphGenerator subgraph
- **Use Cases**: Merging analysis results, comprehensive views
- **Example**: `GraphSearchTool.combine_subgraphs(db_graph, auth_graph)`

### `get_statistics()`
- **Purpose**: Get comprehensive statistics about the graph
- **Returns**: Dictionary with various metrics
- **Use Cases**: Understanding codebase size, complexity metrics
- **Example**: `search.get_statistics()`

## 🤖 LLM Context Generation

### `build_llm_context(subgraphs, include_code=True, max_code_length=500, include_relationships=True, context_type="analysis")`
- **Purpose**: Generate formatted context for LLM consumption
- **Context Types**: `"analysis"`, `"review"`, `"security"`, `"refactoring"`
- **Returns**: Formatted string ready for LLM input
- **Use Cases**: AI-powered code analysis, automated reviews
- **Example**: `GraphSearchTool.build_llm_context([issues_graph], context_type="review")`

## 💡 Usage Patterns

### 🔍 **Basic Search & Visualize**
```python
# Search and immediately visualize
subgraph = search.fuzzy_search("authentication")
subgraph.visualize()
```

### 🔄 **Chain Operations**
```python
# Search within search results
db_code = search.fuzzy_search("database")
db_security = GraphSearchTool(db_code).find_security_hotspots()
```

### 🎯 **Combine Multiple Analyses**
```python
# Comprehensive code quality analysis
god_classes = search.find_anti_patterns("god_class")
cycles = search.find_circular_dependencies()
unused = search.find_unused_code()

# Combine and generate report
issues = GraphSearchTool.combine_subgraphs(god_classes, cycles, unused)
report = GraphSearchTool.build_llm_context(issues, context_type="review")
```

### 🏗️ **Architecture Analysis**
```python
# Understand system architecture
layers = search.get_dependency_layers()
hotspots = search.get_high_connectivity_nodes()
entry_points = search.find_entry_points()

# Generate architecture report
arch_analysis = GraphSearchTool.combine_subgraphs(layers, hotspots, entry_points)
arch_report = GraphSearchTool.build_llm_context(arch_analysis)
```

### 🧪 **Test Coverage Analysis**
```python
# Find testing opportunities
untested = search.find_test_coverage_gaps()
complex_code = search.get_high_connectivity_nodes()

# Focus testing efforts
test_priorities = GraphSearchTool.combine_subgraphs(untested, complex_code)
test_plan = GraphSearchTool.build_llm_context(test_priorities, context_type="analysis")
```

### 🔒 **Security Review**
```python
# Security-focused analysis
security_hotspots = search.find_security_hotspots()
external_deps = search.find_external_dependencies()
auth_code = search.fuzzy_search("auth", depth=2)

# Generate security report
security_analysis = GraphSearchTool.combine_subgraphs(security_hotspots, external_deps, auth_code)
security_report = GraphSearchTool.build_llm_context(security_analysis, context_type="security")
```

## ✨ Key Benefits

- **🎯 Consistent API**: Every method returns a GraphGenerator subgraph
- **🎨 Direct Visualization**: Call `.visualize()` on any result
- **🔄 Chainable**: Use subgraphs as input to new searches
- **🤖 LLM Ready**: Generate formatted context for AI analysis
- **📊 Rich Metadata**: Each subgraph includes search metadata
- **🛠️ Composable**: Combine multiple analyses easily
- **🚀 Performance**: Efficient graph operations with NetworkX
- **📈 Scalable**: Handles large codebases effectively

## 🎉 Real-World Scenarios

1. **Code Review Preparation**: Combine anti-patterns, cycles, and unused code analysis
2. **Architecture Assessment**: Layer analysis + hotspots + entry points
3. **Security Audit**: Security hotspots + external dependencies + authentication flows
4. **Refactoring Planning**: God classes + long methods + high connectivity nodes
5. **Test Strategy**: Coverage gaps + complex code + untested components
6. **Dependency Analysis**: External deps + circular deps + dependency layers
7. **Performance Optimization**: High connectivity + data flow + critical paths

Every tool is designed to be intuitive, powerful, and immediately useful for real-world code analysis tasks! 🚀