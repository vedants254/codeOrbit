"""
Graph Utilities - Core graph operations and search functionality
Handles loading, searching, and context generation from repository graph data
"""

import json
import re
import logging
from typing import Dict, List, Optional, Set, Tuple, Any, Union
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
import time
from difflib import SequenceMatcher

from schemas.graph_schemas import GraphNode, GraphEdge, GraphData

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Result from graph search operations"""
    nodes: List[GraphNode]
    search_type: str
    query: str
    execution_time_ms: int
    total_matches: int


@dataclass
class ContextResult:
    """Result from context generation"""
    context_text: str
    nodes_included: List[GraphNode]
    total_characters: int
    estimated_tokens: int


class GraphUtils:
    """Core graph utilities for loading, searching, and context generation"""
    
    def __init__(self, graph_data: Optional[GraphData] = None):
        self.graph_data = graph_data
        self.nodes_by_id: Dict[str, GraphNode] = {}
        self.edges_by_source: Dict[str, List[GraphEdge]] = defaultdict(list)
        self.edges_by_target: Dict[str, List[GraphEdge]] = defaultdict(list)
        self.nodes_by_category: Dict[str, List[GraphNode]] = defaultdict(list)
        self.nodes_by_file: Dict[str, List[GraphNode]] = defaultdict(list)
        self.nodes_by_name: Dict[str, List[GraphNode]] = defaultdict(list)  # New index for faster name lookups
        
        if graph_data:
            self._build_indices()
    
    def load_graph_from_file(self, file_path: str) -> bool:
        """Load graph data from JSON file"""
        try:
            logger.info(f"Loading graph data from: {file_path}")
            start_time = time.time()
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Handle nested structure: {"graph": {"nodes": [...], "edges": [...]}} 
            # or flat structure: {"nodes": [...], "edges": [...]}
            if "graph" in data:
                graph_content = data["graph"]
            else:
                graph_content = data
            
            # Parse nodes and edges
            raw_nodes = graph_content.get("nodes", [])
            raw_edges = graph_content.get("edges", [])
            
            logger.info(f"Raw data: {len(raw_nodes)} nodes, {len(raw_edges)} edges")
            
            # Convert to GraphNode objects
            nodes = []
            for i, node_data in enumerate(raw_nodes):
                try:
                    # Ensure all required fields exist with defaults
                    node_dict = {
                        "id": node_data.get("id", f"node_{i}"),
                        "name": node_data.get("name", "unknown"),
                        "category": node_data.get("category", "unknown"),
                        "file": node_data.get("file", ""),
                        "start_line": node_data.get("start_line", 0),
                        "end_line": node_data.get("end_line", 0),
                        "code": node_data.get("code"),
                        "parent_id": node_data.get("parent_id"),
                        "imports": node_data.get("imports", [])
                    }
                    nodes.append(GraphNode(**node_dict))
                except Exception as e:
                    logger.warning(f"Failed to parse node {i}: {e}")
                    continue
            
            # Convert to GraphEdge objects
            edges = []
            for i, edge_data in enumerate(raw_edges):
                try:
                    edge_dict = {
                        "source": edge_data.get("source", ""),
                        "target": edge_data.get("target", ""),
                        "relationship": edge_data.get("relationship", "unknown")
                    }
                    edges.append(GraphEdge(**edge_dict))
                except Exception as e:
                    logger.warning(f"Failed to parse edge {i}: {e}")
                    continue
            
            self.graph_data = GraphData(nodes=nodes, edges=edges)
            self._build_indices()
            
            load_time = (time.time() - start_time) * 1000
            logger.info(f"Successfully loaded graph: {len(nodes)} nodes, {len(edges)} edges in {load_time:.2f}ms")
            return True
            
        except Exception as e:
            logger.error(f"Error loading graph from {file_path}: {e}")
            return False
    
    def _build_indices(self):
        """Build internal indices for fast lookups"""
        logger.info("Building graph indices...")
        start_time = time.time()
        
        # Clear existing indices
        self.nodes_by_id.clear()
        self.edges_by_source.clear()
        self.edges_by_target.clear()
        self.nodes_by_category.clear()
        self.nodes_by_file.clear()
        self.nodes_by_name.clear()
        
        # Build node indices
        for node in self.graph_data.nodes:
            self.nodes_by_id[node.id] = node
            self.nodes_by_category[node.category].append(node)
            self.nodes_by_name[node.name.lower()].append(node)  # Lowercase for case-insensitive search
            if node.file:
                self.nodes_by_file[node.file].append(node)
        
        # Build edge indices
        for edge in self.graph_data.edges:
            self.edges_by_source[edge.source].append(edge)
            self.edges_by_target[edge.target].append(edge)
        
        build_time = (time.time() - start_time) * 1000
        logger.info(f"Built indices in {build_time:.2f}ms")
    
    def get_graph_stats(self) -> Dict[str, Any]:
        """Get comprehensive graph statistics"""
        if not self.graph_data:
            return {}
        
        stats = {
            "total_nodes": len(self.graph_data.nodes),
            "total_edges": len(self.graph_data.edges),
            "node_categories": {cat: len(nodes) for cat, nodes in self.nodes_by_category.items()},
            "edge_relationships": {},
            "files_covered": len(self.nodes_by_file),
            "nodes_with_code": sum(1 for node in self.graph_data.nodes if node.code),
            "average_connections_per_node": 0
        }
        
        # Count edge relationships
        for edge in self.graph_data.edges:
            rel = edge.relationship
            stats["edge_relationships"][rel] = stats["edge_relationships"].get(rel, 0) + 1
        
        # Calculate average connections
        if stats["total_nodes"] > 0:
            stats["average_connections_per_node"] = stats["total_edges"] / stats["total_nodes"]
        
        return stats
    
    # ==================== SEARCH OPERATIONS ====================
    
    def search_by_name(self, query: str, limit: int = 20) -> SearchResult:
        """Search nodes by name (exact and partial matches) - optimized with index"""
        start_time = time.time()
        
        if not self.graph_data:
            return SearchResult([], "name_search", query, 0, 0)
        
        query_lower = query.lower()
        matches = []
        
        # First check for exact matches in index
        if query_lower in self.nodes_by_name:
            for node in self.nodes_by_name[query_lower]:
                matches.append((node, 1.0))
        
        # Then check for partial matches
        for name, nodes in self.nodes_by_name.items():
            if query_lower != name:  # Skip exact matches we already found
                if name.startswith(query_lower):
                    for node in nodes:
                        matches.append((node, 0.8))
                elif query_lower in name:
                    for node in nodes:
                        matches.append((node, 0.6))
        
        # Sort by score (highest first) and remove duplicates
        seen_ids = set()
        unique_matches = []
        for node, score in sorted(matches, key=lambda x: x[1], reverse=True):
            if node.id not in seen_ids:
                seen_ids.add(node.id)
                unique_matches.append(node)
                if len(unique_matches) >= limit:
                    break
        
        execution_time = int((time.time() - start_time) * 1000)
        return SearchResult(unique_matches, "name_search", query, execution_time, len(matches))
    
    def search_by_pattern(self, pattern: str, limit: int = 20) -> SearchResult:
        """Search nodes by regex pattern"""
        start_time = time.time()
        
        if not self.graph_data:
            return SearchResult([], "pattern_search", pattern, 0, 0)
        
        try:
            # Convert wildcards to regex if needed
            if '*' in pattern or '?' in pattern:
                regex_pattern = pattern.replace('*', '.*').replace('?', '.')
            else:
                regex_pattern = pattern
            
            compiled_pattern = re.compile(regex_pattern, re.IGNORECASE)
            matches = []
            
            for node in self.graph_data.nodes:
                if compiled_pattern.search(node.name) or compiled_pattern.search(node.id):
                    matches.append(node)
                    if len(matches) >= limit:
                        break
            
            execution_time = int((time.time() - start_time) * 1000)
            return SearchResult(matches, "pattern_search", pattern, execution_time, len(matches))
            
        except re.error as e:
            logger.error(f"Invalid regex pattern '{pattern}': {e}")
            execution_time = int((time.time() - start_time) * 1000)
            return SearchResult([], "pattern_search", pattern, execution_time, 0)
    
    def search_by_code_content(self, query: str, limit: int = 10) -> SearchResult:
        """Search nodes by code content"""
        start_time = time.time()
        
        if not self.graph_data:
            return SearchResult([], "code_search", query, 0, 0)
        
        query_lower = query.lower()
        matches = []
        
        for node in self.graph_data.nodes:
            if node.code:
                code_lower = node.code.lower()
                if query_lower in code_lower:
                    # Calculate relevance based on query frequency
                    count = code_lower.count(query_lower)
                    code_length = len(code_lower.split())
                    relevance = count / max(code_length, 1)
                    matches.append((node, relevance))
        
        # Sort by relevance (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        result_nodes = [match[0] for match in matches[:limit]]
        
        execution_time = int((time.time() - start_time) * 1000)
        return SearchResult(result_nodes, "code_search", query, execution_time, len(matches))
    
    def search_by_category(self, category: str, limit: int = 50) -> SearchResult:
        """Search nodes by category - optimized with index"""
        start_time = time.time()
        
        nodes = self.nodes_by_category.get(category, [])[:limit]
        execution_time = int((time.time() - start_time) * 1000)
        
        return SearchResult(nodes, "category_search", category, execution_time, len(nodes))
    
    def search_by_file(self, file_path: str, limit: int = 100) -> SearchResult:
        """Search nodes by file path - optimized with index"""
        start_time = time.time()
        
        matches = []
        # Direct lookup first
        if file_path in self.nodes_by_file:
            matches.extend(self.nodes_by_file[file_path])
        
        # Then partial matches
        if len(matches) < limit:
            for file, nodes in self.nodes_by_file.items():
                if file != file_path and (file_path in file or file in file_path):
                    matches.extend(nodes)
                    if len(matches) >= limit:
                        break
        
        result_nodes = matches[:limit]
        execution_time = int((time.time() - start_time) * 1000)
        
        return SearchResult(result_nodes, "file_search", file_path, execution_time, len(matches))
    
    def fuzzy_search(self, query: str, limit: int = 15, threshold: float = 0.6) -> SearchResult:
        """Fuzzy search using sequence matching"""
        start_time = time.time()
        
        if not self.graph_data:
            return SearchResult([], "fuzzy_search", query, 0, 0)
        
        query_lower = query.lower()
        matches = []
        
        for node in self.graph_data.nodes:
            name_lower = node.name.lower()
            
            # Calculate fuzzy similarity
            similarity = SequenceMatcher(None, query_lower, name_lower).ratio()
            
            if similarity >= threshold:
                matches.append((node, similarity))
        
        # Sort by similarity (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        result_nodes = [match[0] for match in matches[:limit]]
        
        execution_time = int((time.time() - start_time) * 1000)
        return SearchResult(result_nodes, "fuzzy_search", query, execution_time, len(matches))
    
    def multi_term_search(self, terms: List[str], limit: int = 20) -> SearchResult:
        """Search for nodes matching multiple terms"""
        start_time = time.time()
        
        if not self.graph_data or not terms:
            return SearchResult([], "multi_term_search", str(terms), 0, 0)
        
        term_lower = [term.lower() for term in terms]
        matches = []
        
        for node in self.graph_data.nodes:
            name_lower = node.name.lower()
            code_lower = (node.code or "").lower()
            combined_text = f"{name_lower} {code_lower}"
            
            # Count how many terms match
            match_count = sum(1 for term in term_lower if term in combined_text)
            
            if match_count > 0:
                # Score based on percentage of terms matched
                score = match_count / len(terms)
                matches.append((node, score))
        
        # Sort by score (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        result_nodes = [match[0] for match in matches[:limit]]
        
        execution_time = int((time.time() - start_time) * 1000)
        return SearchResult(result_nodes, "multi_term_search", str(terms), execution_time, len(matches))
    
    def smart_search(self, query: str, limit: int = 20) -> SearchResult:
        """Smart search that combines multiple search strategies"""
        start_time = time.time()
        
        all_nodes = []
        seen_ids = set()
        
        # Strategy 1: Exact name match (highest priority)
        name_results = self.search_by_name(query, limit=5)
        for node in name_results.nodes:
            if node.id not in seen_ids:
                seen_ids.add(node.id)
                all_nodes.append(node)
        
        # Strategy 2: Code content match
        if len(all_nodes) < limit:
            code_results = self.search_by_code_content(query, limit=5)
            for node in code_results.nodes:
                if node.id not in seen_ids:
                    seen_ids.add(node.id)
                    all_nodes.append(node)
                    if len(all_nodes) >= limit:
                        break
        
        # Strategy 3: Fuzzy match
        if len(all_nodes) < limit:
            fuzzy_results = self.fuzzy_search(query, limit=limit-len(all_nodes), threshold=0.7)
            for node in fuzzy_results.nodes:
                if node.id not in seen_ids:
                    seen_ids.add(node.id)
                    all_nodes.append(node)
                    if len(all_nodes) >= limit:
                        break
        
        execution_time = int((time.time() - start_time) * 1000)
        return SearchResult(all_nodes, "smart_search", query, execution_time, len(all_nodes))
    
    # ==================== GRAPH TRAVERSAL ====================
    
    def get_connected_nodes(self, node_id: str, relationship: Optional[str] = None, 
                          direction: str = "both", limit: int = 20) -> List[GraphNode]:
        """Get nodes connected to a specific node"""
        connected = []
        
        # Get outgoing connections
        if direction in ["outgoing", "both"]:
            for edge in self.edges_by_source.get(node_id, []):
                if relationship is None or edge.relationship == relationship:
                    target_node = self.nodes_by_id.get(edge.target)
                    if target_node:
                        connected.append(target_node)
        
        # Get incoming connections
        if direction in ["incoming", "both"]:
            for edge in self.edges_by_target.get(node_id, []):
                if relationship is None or edge.relationship == relationship:
                    source_node = self.nodes_by_id.get(edge.source)
                    if source_node:
                        connected.append(source_node)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_connected = []
        for node in connected:
            if node.id not in seen:
                seen.add(node.id)
                unique_connected.append(node)
                if len(unique_connected) >= limit:
                    break
        
        return unique_connected
    
    def bfs_traversal(self, start_node_id: str, max_depth: int = 3, 
                     relationships: Optional[List[str]] = None) -> Dict[int, List[GraphNode]]:
        """Breadth-first search traversal from a starting node"""
        if start_node_id not in self.nodes_by_id:
            return {}
        
        visited = set()
        result = defaultdict(list)
        queue = deque([(start_node_id, 0)])  # (node_id, depth)
        
        while queue:
            current_id, depth = queue.popleft()
            
            if depth > max_depth or current_id in visited:
                continue
            
            visited.add(current_id)
            current_node = self.nodes_by_id[current_id]
            result[depth].append(current_node)
            
            # Add connected nodes to queue
            for edge in self.edges_by_source.get(current_id, []):
                if relationships is None or edge.relationship in relationships:
                    if edge.target not in visited and depth < max_depth:
                        queue.append((edge.target, depth + 1))
        
        return dict(result)
    
    def dfs_traversal(self, start_node_id: str, max_depth: int = 3,
                     relationships: Optional[List[str]] = None) -> Dict[int, List[GraphNode]]:
        """Depth-first search traversal from a starting node"""
        if start_node_id not in self.nodes_by_id:
            return {}
        
        visited = set()
        result = defaultdict(list)
        
        def dfs_helper(node_id: str, depth: int):
            if depth > max_depth or node_id in visited:
                return
            
            visited.add(node_id)
            node = self.nodes_by_id[node_id]
            result[depth].append(node)
            
            # Recursively visit connected nodes
            for edge in self.edges_by_source.get(node_id, []):
                if relationships is None or edge.relationship in relationships:
                    dfs_helper(edge.target, depth + 1)
        
        dfs_helper(start_node_id, 0)
        return dict(result)
    
    def find_shortest_path(self, start_id: str, end_id: str) -> Optional[List[GraphNode]]:
        """Find shortest path between two nodes using BFS"""
        if start_id not in self.nodes_by_id or end_id not in self.nodes_by_id:
            return None
        
        if start_id == end_id:
            return [self.nodes_by_id[start_id]]
        
        visited = set()
        queue = deque([(start_id, [start_id])])
        
        while queue:
            current_id, path = queue.popleft()
            
            if current_id in visited:
                continue
            
            visited.add(current_id)
            
            # Check all outgoing edges
            for edge in self.edges_by_source.get(current_id, []):
                if edge.target == end_id:
                    # Found the target
                    full_path = path + [edge.target]
                    return [self.nodes_by_id[node_id] for node_id in full_path]
                
                if edge.target not in visited:
                    queue.append((edge.target, path + [edge.target]))
        
        return None  # No path found
    
    def get_node_neighbors(self, node_id: str, max_neighbors: int = 10) -> Dict[str, List[GraphNode]]:
        """Get categorized neighbors of a node"""
        if node_id not in self.nodes_by_id:
            return {}
        
        neighbors = {
            "parents": [],
            "children": [],
            "siblings": [],
            "dependencies": [],
            "dependents": []
        }
        
        current_node = self.nodes_by_id[node_id]
        
        # Get parent nodes
        if current_node.parent_id and current_node.parent_id in self.nodes_by_id:
            neighbors["parents"].append(self.nodes_by_id[current_node.parent_id])
        
        # Get children (nodes that have this as parent)
        for node in self.graph_data.nodes:
            if node.parent_id == node_id:
                neighbors["children"].append(node)
                if len(neighbors["children"]) >= max_neighbors:
                    break
        
        # Get siblings (nodes with same parent)
        if current_node.parent_id:
            for node in self.graph_data.nodes:
                if node.parent_id == current_node.parent_id and node.id != node_id:
                    neighbors["siblings"].append(node)
                    if len(neighbors["siblings"]) >= max_neighbors:
                        break
        
        # Get dependencies and dependents through edges
        for edge in self.edges_by_source.get(node_id, []):
            if edge.relationship in ["calls", "imports_module", "imports_symbol"]:
                target_node = self.nodes_by_id.get(edge.target)
                if target_node:
                    neighbors["dependencies"].append(target_node)
                    if len(neighbors["dependencies"]) >= max_neighbors:
                        break
        
        for edge in self.edges_by_target.get(node_id, []):
            if edge.relationship in ["calls", "imports_module", "imports_symbol"]:
                source_node = self.nodes_by_id.get(edge.source)
                if source_node:
                    neighbors["dependents"].append(source_node)
                    if len(neighbors["dependents"]) >= max_neighbors:
                        break
        
        return neighbors
    
    # ==================== CONTEXT GENERATION ====================
    
    def nodes_to_context(self, nodes: List[GraphNode], 
                        include_code: bool = True,
                        include_relationships: bool = True,
                        max_code_length: int = 500) -> ContextResult:
        """Convert nodes to LLM-friendly context text"""
        if not nodes:
            return ContextResult("# No nodes provided", [], 0, 0)
        
        context_parts = []
        context_parts.append("# Repository Code Context")
        context_parts.append(f"Found {len(nodes)} relevant code components:\n")
        
        # Group nodes by file for better organization
        nodes_by_file = defaultdict(list)
        category_counts = defaultdict(int)
        
        for node in nodes:
            file_path = node.file or "unknown"
            nodes_by_file[file_path].append(node)
            category_counts[node.category] += 1
        
        # Add summary
        context_parts.append("## Summary")
        category_summary = ", ".join([f"{count} {cat}{'s' if count > 1 else ''}" 
                                    for cat, count in category_counts.items()])
        context_parts.append(f"Components: {category_summary}")
        context_parts.append("")
        
        # Process each file
        for file_path, file_nodes in sorted(nodes_by_file.items()):
            if file_path != "unknown":
                context_parts.append(f"## 📁 {file_path}")
            else:
                context_parts.append("## 📁 Unknown File Location")
            
            # Sort nodes by line number within file
            sorted_nodes = sorted(file_nodes, key=lambda x: (x.start_line, x.name))
            
            for i, node in enumerate(sorted_nodes, 1):
                context_parts.append(f"### {i}. {node.category.title()}: `{node.name}`")
                
                # Add basic info
                details = []
                if node.start_line > 0:
                    line_range = f"{node.start_line}-{node.end_line}" if node.end_line > node.start_line else str(node.start_line)
                    details.append(f"Lines {line_range}")
                
                # Add relationship info if requested
                if include_relationships:
                    connections = len(self.edges_by_source.get(node.id, [])) + len(self.edges_by_target.get(node.id, []))
                    if connections > 0:
                        details.append(f"{connections} connections")
                
                if details:
                    context_parts.append(f"**Details**: {' | '.join(details)}")
                
                # Add code if available and requested
                if include_code and node.code:
                    context_parts.append("**Code:**")
                    context_parts.append("```python")
                    
                    # Truncate code if too long
                    code = node.code.strip()
                    if len(code) > max_code_length:
                        code = code[:max_code_length] + "\n# ... (truncated)"
                    
                    context_parts.append(code)
                    context_parts.append("```")
                
                context_parts.append("")  # Empty line between nodes
        
        # Generate final context
        context_text = "\n".join(context_parts)
        total_chars = len(context_text)
        estimated_tokens = total_chars // 4  # Rough estimate: 4 chars per token
        
        return ContextResult(context_text, nodes, total_chars, estimated_tokens)
    
    def search_and_build_context(self, query: str, search_types: List[str] = None, 
                                max_nodes: int = 20, **kwargs) -> ContextResult:
        """Combined search and context building"""
        if search_types is None:
            search_types = ["smart"]  # Use smart search by default
        
        all_nodes = []
        seen_ids = set()
        
        # Perform different types of searches
        for search_type in search_types:
            if search_type == "smart":
                result = self.smart_search(query, limit=max_nodes)
            elif search_type == "name":
                result = self.search_by_name(query, limit=max_nodes//len(search_types))
            elif search_type == "pattern":
                result = self.search_by_pattern(query, limit=max_nodes//len(search_types))
            elif search_type == "code":
                result = self.search_by_code_content(query, limit=max_nodes//len(search_types))
            elif search_type == "fuzzy":
                result = self.fuzzy_search(query, limit=max_nodes//len(search_types))
            else:
                continue
            
            # Add unique nodes
            for node in result.nodes:
                if node.id not in seen_ids:
                    seen_ids.add(node.id)
                    all_nodes.append(node)
                    if len(all_nodes) >= max_nodes:
                        break
            
            if len(all_nodes) >= max_nodes:
                break
        
        return self.nodes_to_context(all_nodes[:max_nodes], **kwargs)
    
    def build_focused_context(self, node_ids: List[str], include_neighbors: bool = True,
                             neighbor_depth: int = 1, **kwargs) -> ContextResult:
        """Build context focused on specific nodes and their neighbors"""
        nodes = []
        seen_ids = set()
        
        # Add the specified nodes
        for node_id in node_ids:
            if node_id in self.nodes_by_id and node_id not in seen_ids:
                nodes.append(self.nodes_by_id[node_id])
                seen_ids.add(node_id)
        
        # Add neighbors if requested
        if include_neighbors:
            for node_id in node_ids:
                if neighbor_depth >= 1:
                    connected = self.get_connected_nodes(node_id, limit=5)
                    for neighbor in connected:
                        if neighbor.id not in seen_ids:
                            nodes.append(neighbor)
                            seen_ids.add(neighbor.id)
        
        return self.nodes_to_context(nodes, **kwargs)


# Global instance for easy access
graph_utils = GraphUtils()
