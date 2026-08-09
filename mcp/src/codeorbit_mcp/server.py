"""
CodeOrbit MCP Server

Exposes codebase analysis through Model Context Protocol for AI assistants.
Navigate the orbit of your codebase with AI.
"""

import os
import json
from pathlib import Path
from typing import Any, Optional
import asyncio
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
from mcp import types

from codeorbit import GraphGenerator, GraphSearchTool
import git


class CodeOrbitServer:
    """MCP Server for codebase analysis and understanding."""
    
    def __init__(self):
        self.server = Server("codeorbit")
        self.graph_cache: dict[str, GraphGenerator] = {}
        self.repo_cache: dict[str, git.Repo] = {}
        
        # Register handlers
        self._register_handlers()
    
    def _register_handlers(self):
        """Register all MCP tool handlers."""
        
        @self.server.list_tools()
        async def handle_list_tools() -> list[types.Tool]:
            """List available codebase analysis tools."""
            return [
                types.Tool(
                    name="analyze_codebase",
                    description="Analyze a codebase and generate dependency graph. Returns structure overview.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {
                                "type": "string",
                                "description": "Path to the repository to analyze"
                            },
                            "include_patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "File patterns to include (e.g., ['**/*.py', '**/*.js'])"
                            },
                            "exclude_patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "File patterns to exclude (e.g., ['**/node_modules/**', '**/__pycache__/**'])"
                            }
                        },
                        "required": ["repo_path"]
                    }
                ),
                types.Tool(
                    name="search_code",
                    description="Search for code elements (functions, classes, files) in the analyzed codebase.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {
                                "type": "string",
                                "description": "Path to the repository (must be analyzed first)"
                            },
                            "query": {
                                "type": "string",
                                "description": "Search query (fuzzy search on code element names)"
                            },
                            "element_types": {
                                "type": "array",
                                "items": {"type": "string", "enum": ["function", "class", "method", "file", "import"]},
                                "description": "Filter by element types"
                            }
                        },
                        "required": ["repo_path", "query"]
                    }
                ),
                types.Tool(
                    name="get_dependencies",
                    description="Get dependencies for a specific code element (what it uses/imports).",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "element_name": {
                                "type": "string",
                                "description": "Name of the function/class/file to get dependencies for"
                            },
                            "depth": {
                                "type": "integer",
                                "description": "Depth of dependency tree (default: 1)",
                                "default": 1
                            }
                        },
                        "required": ["repo_path", "element_name"]
                    }
                ),
                types.Tool(
                    name="get_dependents",
                    description="Get dependents of a code element (what uses/imports it).",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "element_name": {
                                "type": "string",
                                "description": "Name of the function/class/file to get dependents for"
                            },
                            "depth": {
                                "type": "integer",
                                "description": "Depth of dependent tree (default: 1)",
                                "default": 1
                            }
                        },
                        "required": ["repo_path", "element_name"]
                    }
                ),
                types.Tool(
                    name="get_file_context",
                    description="Get the context of a specific file including its imports, exports, and relationships.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "file_path": {
                                "type": "string",
                                "description": "Relative path to the file"
                            }
                        },
                        "required": ["repo_path", "file_path"]
                    }
                ),
                types.Tool(
                    name="build_llm_context",
                    description="Build comprehensive context for LLM about specific code elements or areas.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "focus_elements": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of code elements to focus on"
                            },
                            "context_depth": {
                                "type": "integer",
                                "description": "How many levels of dependencies to include (default: 2)",
                                "default": 2
                            }
                        },
                        "required": ["repo_path", "focus_elements"]
                    }
                ),
                types.Tool(
                    name="get_complexity_hotspots",
                    description="Identify complex areas in the codebase based on dependencies and connections.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "limit": {
                                "type": "integer",
                                "description": "Number of hotspots to return (default: 10)",
                                "default": 10
                            }
                        },
                        "required": ["repo_path"]
                    }
                ),
                types.Tool(
                    name="find_path_between",
                    description="Find dependency paths between two code elements.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "repo_path": {"type": "string"},
                            "from_element": {"type": "string"},
                            "to_element": {"type": "string"},
                            "max_paths": {
                                "type": "integer",
                                "description": "Maximum number of paths to return (default: 3)",
                                "default": 3
                            }
                        },
                        "required": ["repo_path", "from_element", "to_element"]
                    }
                ),
            ]
        
        @self.server.call_tool()
        async def handle_call_tool(
            name: str, arguments: dict[str, Any]
        ) -> list[types.TextContent]:
            """Handle tool execution requests."""
            
            try:
                if name == "analyze_codebase":
                    result = await self._analyze_codebase(arguments)
                elif name == "search_code":
                    result = await self._search_code(arguments)
                elif name == "get_dependencies":
                    result = await self._get_dependencies(arguments)
                elif name == "get_dependents":
                    result = await self._get_dependents(arguments)
                elif name == "get_file_context":
                    result = await self._get_file_context(arguments)
                elif name == "build_llm_context":
                    result = await self._build_llm_context(arguments)
                elif name == "get_complexity_hotspots":
                    result = await self._get_complexity_hotspots(arguments)
                elif name == "find_path_between":
                    result = await self._find_path_between(arguments)
                else:
                    raise ValueError(f"Unknown tool: {name}")
                
                return [types.TextContent(
                    type="text",
                    text=json.dumps(result, indent=2)
                )]
            except Exception as e:
                return [types.TextContent(
                    type="text",
                    text=json.dumps({"error": str(e)}, indent=2)
                )]
    
    async def _analyze_codebase(self, args: dict) -> dict:
        """Analyze a codebase and generate dependency graph."""
        repo_path = Path(args["repo_path"]).resolve()
        
        if not repo_path.exists():
            raise ValueError(f"Repository path does not exist: {repo_path}")
        
        # Collect files
        files_data = []
        include_patterns = args.get("include_patterns", ["**/*.py", "**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx"])
        exclude_patterns = args.get("exclude_patterns", [
            "**/node_modules/**", "**/__pycache__/**", "**/venv/**", 
            "**/.venv/**", "**/dist/**", "**/build/**", "**/.git/**"
        ])
        
        for pattern in include_patterns:
            for file_path in repo_path.glob(pattern):
                # Check exclusions
                should_exclude = any(
                    file_path.match(exclude) for exclude in exclude_patterns
                )
                if should_exclude or not file_path.is_file():
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    files_data.append({
                        "path": str(file_path.relative_to(repo_path)),
                        "content": content
                    })
                except Exception as e:
                    continue
        
        # Generate graph
        graph_gen = GraphGenerator(files=files_data)
        result = graph_gen.generate()
        
        # Cache the generator
        cache_key = str(repo_path)
        self.graph_cache[cache_key] = graph_gen
        
        return {
            "status": "success",
            "repository": str(repo_path),
            "files_analyzed": len(files_data),
            "nodes": len(result["nodes"]),
            "edges": len(result["edges"]),
            "summary": {
                "functions": len([n for n in result["nodes"] if n.get("category") == "function"]),
                "classes": len([n for n in result["nodes"] if n.get("category") == "class"]),
                "files": len([n for n in result["nodes"] if n.get("category") == "file"]),
            }
        }
    
    async def _search_code(self, args: dict) -> dict:
        """Search for code elements."""
        repo_path = str(Path(args["repo_path"]).resolve())
        query = args["query"]
        element_types = args.get("element_types", [])
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Perform fuzzy search
        result_gen = search_tool.fuzzy_search(query, threshold=0.3)
        
        # Filter by element types if specified
        if element_types:
            result_gen = search_tool.filter_by_category(element_types, result_gen)
        
        results = []
        for node in result_gen.all_nodes_data[:20]:  # Limit to 20 results
            results.append({
                "id": node["id"],
                "label": node["label"],
                "category": node.get("category", "unknown"),
                "file": node.get("file_path", ""),
                "line": node.get("line_number", 0),
            })
        
        return {
            "status": "success",
            "query": query,
            "results_count": len(results),
            "results": results
        }
    
    async def _get_dependencies(self, args: dict) -> dict:
        """Get dependencies of a code element."""
        repo_path = str(Path(args["repo_path"]).resolve())
        element_name = args["element_name"]
        depth = args.get("depth", 1)
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Find the element
        result_gen = search_tool.fuzzy_search(element_name, threshold=0.8)
        if not result_gen.all_nodes_data:
            return {"status": "error", "message": f"Element '{element_name}' not found"}
        
        target_node = result_gen.all_nodes_data[0]
        
        # Get dependencies (outgoing edges)
        deps_gen = search_tool.get_neighbors(
            node_ids=[target_node["id"]],
            depth=depth,
            direction="outgoing"
        )
        
        dependencies = []
        for node in deps_gen.all_nodes_data:
            if node["id"] != target_node["id"]:
                dependencies.append({
                    "id": node["id"],
                    "label": node["label"],
                    "category": node.get("category", "unknown"),
                    "file": node.get("file_path", "")
                })
        
        return {
            "status": "success",
            "element": target_node["label"],
            "dependencies_count": len(dependencies),
            "dependencies": dependencies
        }
    
    async def _get_dependents(self, args: dict) -> dict:
        """Get dependents of a code element."""
        repo_path = str(Path(args["repo_path"]).resolve())
        element_name = args["element_name"]
        depth = args.get("depth", 1)
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Find the element
        result_gen = search_tool.fuzzy_search(element_name, threshold=0.8)
        if not result_gen.all_nodes_data:
            return {"status": "error", "message": f"Element '{element_name}' not found"}
        
        target_node = result_gen.all_nodes_data[0]
        
        # Get dependents (incoming edges)
        deps_gen = search_tool.get_neighbors(
            node_ids=[target_node["id"]],
            depth=depth,
            direction="incoming"
        )
        
        dependents = []
        for node in deps_gen.all_nodes_data:
            if node["id"] != target_node["id"]:
                dependents.append({
                    "id": node["id"],
                    "label": node["label"],
                    "category": node.get("category", "unknown"),
                    "file": node.get("file_path", "")
                })
        
        return {
            "status": "success",
            "element": target_node["label"],
            "dependents_count": len(dependents),
            "dependents": dependents
        }
    
    async def _get_file_context(self, args: dict) -> dict:
        """Get context for a specific file."""
        repo_path = str(Path(args["repo_path"]).resolve())
        file_path = args["file_path"]
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Find file node
        result_gen = search_tool.fuzzy_search(file_path, threshold=0.7)
        file_nodes = [n for n in result_gen.all_nodes_data if n.get("category") == "file"]
        
        if not file_nodes:
            return {"status": "error", "message": f"File '{file_path}' not found"}
        
        file_node = file_nodes[0]
        
        # Get all elements in this file
        file_elements = [
            n for n in graph_gen.all_nodes_data 
            if n.get("file_path") == file_node.get("file_path") and n["id"] != file_node["id"]
        ]
        
        # Get file dependencies
        deps_gen = search_tool.get_neighbors(
            node_ids=[file_node["id"]],
            depth=1,
            direction="outgoing"
        )
        
        dependencies = [
            {"label": n["label"], "category": n.get("category")}
            for n in deps_gen.all_nodes_data 
            if n["id"] != file_node["id"]
        ]
        
        return {
            "status": "success",
            "file": file_node["label"],
            "elements": [{"label": e["label"], "category": e.get("category")} for e in file_elements],
            "dependencies": dependencies
        }
    
    async def _build_llm_context(self, args: dict) -> dict:
        """Build comprehensive LLM context."""
        repo_path = str(Path(args["repo_path"]).resolve())
        focus_elements = args["focus_elements"]
        context_depth = args.get("context_depth", 2)
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Find all focus elements
        focus_node_ids = []
        for element in focus_elements:
            result_gen = search_tool.fuzzy_search(element, threshold=0.7)
            if result_gen.all_nodes_data:
                focus_node_ids.append(result_gen.all_nodes_data[0]["id"])
        
        if not focus_node_ids:
            return {"status": "error", "message": "No focus elements found"}
        
        # Build context subgraph
        context_gen = search_tool.get_neighbors(
            node_ids=focus_node_ids,
            depth=context_depth,
            direction="both"
        )
        
        # Organize by files
        context_by_file = {}
        for node in context_gen.all_nodes_data:
            file_path = node.get("file_path", "unknown")
            if file_path not in context_by_file:
                context_by_file[file_path] = []
            context_by_file[file_path].append({
                "label": node["label"],
                "category": node.get("category"),
                "line": node.get("line_number", 0)
            })
        
        return {
            "status": "success",
            "focus_elements": focus_elements,
            "context_nodes": len(context_gen.all_nodes_data),
            "files_involved": len(context_by_file),
            "context": context_by_file
        }
    
    async def _get_complexity_hotspots(self, args: dict) -> dict:
        """Identify complexity hotspots."""
        repo_path = str(Path(args["repo_path"]).resolve())
        limit = args.get("limit", 10)
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Use the complexity_hotspots method
        hotspots_gen = search_tool.complexity_hotspots(top_n=limit)
        
        hotspots = []
        for node in hotspots_gen.all_nodes_data:
            hotspots.append({
                "label": node["label"],
                "category": node.get("category"),
                "file": node.get("file_path"),
                "connections": node.get("_degree", 0)
            })
        
        return {
            "status": "success",
            "hotspots_count": len(hotspots),
            "hotspots": hotspots
        }
    
    async def _find_path_between(self, args: dict) -> dict:
        """Find paths between two code elements."""
        repo_path = str(Path(args["repo_path"]).resolve())
        from_element = args["from_element"]
        to_element = args["to_element"]
        max_paths = args.get("max_paths", 3)
        
        graph_gen = self._get_cached_graph(repo_path)
        search_tool = GraphSearchTool(graph_gen)
        
        # Find both elements
        from_gen = search_tool.fuzzy_search(from_element, threshold=0.7)
        to_gen = search_tool.fuzzy_search(to_element, threshold=0.7)
        
        if not from_gen.all_nodes_data or not to_gen.all_nodes_data:
            return {"status": "error", "message": "One or both elements not found"}
        
        from_node = from_gen.all_nodes_data[0]
        to_node = to_gen.all_nodes_data[0]
        
        # Find paths using the search tool
        paths_gen = search_tool.find_paths_between(
            from_node["id"],
            to_node["id"],
            max_paths=max_paths
        )
        
        paths = []
        if hasattr(paths_gen, '_search_metadata') and 'paths' in paths_gen._search_metadata:
            for path in paths_gen._search_metadata['paths']:
                path_labels = [
                    graph_gen.node_details_map[node_id]["label"]
                    for node_id in path
                ]
                paths.append(path_labels)
        
        return {
            "status": "success",
            "from": from_node["label"],
            "to": to_node["label"],
            "paths_found": len(paths),
            "paths": paths
        }
    
    def _get_cached_graph(self, repo_path: str) -> GraphGenerator:
        """Get cached graph or raise error."""
        if repo_path not in self.graph_cache:
            raise ValueError(f"Repository not analyzed. Run 'analyze_codebase' first for: {repo_path}")
        return self.graph_cache[repo_path]
    
    async def run(self):
        """Run the MCP server."""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name="codeorbit",
                    server_version="0.1.0",
                    capabilities=self.server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    )
                )
            )


async def main():
    """Main entry point."""
    server = CodeOrbitServer()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
