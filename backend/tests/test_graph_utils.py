"""
Test file for graph_utils.py
Tests all graph operations including loading, searching, traversal, and context generation
"""

import sys
import os
import time
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from utils.graph_utils import GraphUtils, SearchResult, ContextResult
from schemas.graph_schemas import GraphNode, GraphEdge, GraphData


def test_graph_loading():
    """Test loading graph data from JSON file"""
    print("=" * 60)
    print("🔍 TESTING GRAPH LOADING")
    print("=" * 60)
    
    # Path to the test data file
    # TODO: Update this path to your test data file location
    data_file = "backend/storage/users/test_user/test_repo/data.json"
    
    graph_utils = GraphUtils()
    
    print(f"📂 Loading graph from: {data_file}")
    start_time = time.time()
    success = graph_utils.load_graph_from_file(data_file)
    load_time = (time.time() - start_time) * 1000
    
    if success:
        print(f"✅ Graph loaded successfully in {load_time:.2f}ms")
        
        # Get and display stats
        stats = graph_utils.get_graph_stats()
        print(f"\n📊 Graph Statistics:")
        print(f"   Total nodes: {stats['total_nodes']}")
        print(f"   Total edges: {stats['total_edges']}")
        print(f"   Files covered: {stats['files_covered']}")
        print(f"   Nodes with code: {stats['nodes_with_code']}")
        print(f"   Average connections per node: {stats['average_connections_per_node']:.2f}")
        
        print(f"\n🏷️ Node Categories:")
        for category, count in stats['node_categories'].items():
            print(f"   {category}: {count}")
        
        print(f"\n🔗 Edge Relationships:")
        for relationship, count in stats['edge_relationships'].items():
            print(f"   {relationship}: {count}")
        
        return graph_utils
    else:
        print("❌ Failed to load graph")
        return None


def test_search_operations(graph_utils: GraphUtils):
    """Test all search operations"""
    print("\n" + "=" * 60)
    print("🔍 TESTING SEARCH OPERATIONS")
    print("=" * 60)
    
    # Test different search terms
    search_terms = [
        "main",
        "parse",
        "server",
        "omniparse",
        "download"
    ]
    
    for term in search_terms:
        print(f"\n🎯 Testing searches for term: '{term}'")
        
        # Name search
        result = graph_utils.search_by_name(term, limit=5)
        print(f"   📝 Name search: {len(result.nodes)} results in {result.execution_time_ms}ms")
        for i, node in enumerate(result.nodes[:3], 1):
            print(f"      {i}. {node.category}: {node.name} ({node.file})")
        
        # Pattern search (with wildcards)
        pattern_result = graph_utils.search_by_pattern(f"*{term}*", limit=5)
        print(f"   🔍 Pattern search: {len(pattern_result.nodes)} results in {pattern_result.execution_time_ms}ms")
        
        # Code search
        code_result = graph_utils.search_by_code_content(term, limit=3)
        print(f"   💻 Code search: {len(code_result.nodes)} results in {code_result.execution_time_ms}ms")
        for i, node in enumerate(code_result.nodes[:2], 1):
            code_snippet = (node.code[:100] + "...") if node.code and len(node.code) > 100 else (node.code or "No code")
            print(f"      {i}. {node.name}: {code_snippet}")
        
        # Fuzzy search
        fuzzy_result = graph_utils.fuzzy_search(term, limit=3, threshold=0.5)
        print(f"   🔀 Fuzzy search: {len(fuzzy_result.nodes)} results in {fuzzy_result.execution_time_ms}ms")


def test_category_and_file_searches(graph_utils: GraphUtils):
    """Test category and file-based searches"""
    print("\n" + "=" * 60)
    print("🏷️ TESTING CATEGORY & FILE SEARCHES")
    print("=" * 60)
    
    # Test category searches
    categories = ["function", "class", "module", "directory"]
    
    for category in categories:
        result = graph_utils.search_by_category(category, limit=10)
        print(f"\n📂 {category.title()} nodes: {len(result.nodes)} found in {result.execution_time_ms}ms")
        
        # Show sample results
        for i, node in enumerate(result.nodes[:3], 1):
            print(f"   {i}. {node.name} ({node.file})")
    
    # Test file searches
    print(f"\n📁 Testing file searches:")
    file_patterns = ["server.py", "omniparse", "download.py"]
    
    for pattern in file_patterns:
        result = graph_utils.search_by_file(pattern, limit=10)
        print(f"   Files matching '{pattern}': {len(result.nodes)} nodes in {result.execution_time_ms}ms")


def test_multi_term_search(graph_utils: GraphUtils):
    """Test multi-term search functionality"""
    print("\n" + "=" * 60)
    print("🔍 TESTING MULTI-TERM SEARCH")
    print("=" * 60)
    
    test_cases = [
        ["parse", "document"],
        ["server", "main", "app"],
        ["download", "models"],
        ["omniparse", "client"]
    ]
    
    for terms in test_cases:
        result = graph_utils.multi_term_search(terms, limit=5)
        print(f"\n🎯 Multi-term search {terms}: {len(result.nodes)} results in {result.execution_time_ms}ms")
        
        for i, node in enumerate(result.nodes[:3], 1):
            print(f"   {i}. {node.category}: {node.name} ({node.file})")


def test_graph_traversal(graph_utils: GraphUtils):
    """Test graph traversal operations (BFS, DFS, shortest path)"""
    print("\n" + "=" * 60)
    print("🌐 TESTING GRAPH TRAVERSAL")
    print("=" * 60)
    
    # Find a good starting node (preferably with connections)
    function_nodes = graph_utils.search_by_category("function", limit=10).nodes
    if not function_nodes:
        print("❌ No function nodes found for traversal testing")
        return
    
    start_node = function_nodes[0]
    print(f"🚀 Starting traversal from: {start_node.name} ({start_node.id})")
    
    # Test connected nodes
    connected = graph_utils.get_connected_nodes(start_node.id, limit=5)
    print(f"\n🔗 Connected nodes: {len(connected)} found")
    for i, node in enumerate(connected[:3], 1):
        print(f"   {i}. {node.category}: {node.name}")
    
    # Test BFS traversal
    print(f"\n🔄 BFS Traversal (max depth 2):")
    bfs_result = graph_utils.bfs_traversal(start_node.id, max_depth=2)
    for depth, nodes in bfs_result.items():
        print(f"   Depth {depth}: {len(nodes)} nodes")
        for i, node in enumerate(nodes[:3], 1):
            print(f"      {i}. {node.name}")
    
    # Test DFS traversal
    print(f"\n🔄 DFS Traversal (max depth 2):")
    dfs_result = graph_utils.dfs_traversal(start_node.id, max_depth=2)
    for depth, nodes in dfs_result.items():
        print(f"   Depth {depth}: {len(nodes)} nodes")
    
    # Test shortest path (if we have multiple nodes)
    if len(function_nodes) > 1:
        target_node = function_nodes[1]
        print(f"\n🛤️ Finding shortest path from {start_node.name} to {target_node.name}")
        path = graph_utils.find_shortest_path(start_node.id, target_node.id)
        if path:
            print(f"   Path found with {len(path)} nodes:")
            for i, node in enumerate(path, 1):
                print(f"      {i}. {node.name}")
        else:
            print("   No path found between these nodes")


def test_context_generation(graph_utils: GraphUtils):
    """Test context generation for LLM"""
    print("\n" + "=" * 60)
    print("📝 TESTING CONTEXT GENERATION")
    print("=" * 60)
    
    # Test with different node sets
    test_queries = [
        "server main",
        "parse document", 
        "omniparse client",
        "download models"
    ]
    
    for query in test_queries:
        print(f"\n🎯 Generating context for query: '{query}'")
        
        # Use combined search and context building
        context_result = graph_utils.search_and_build_context(
            query, 
            search_types=["name", "code", "fuzzy"],
            max_nodes=8,
            include_code=True,
            include_relationships=True,
            max_code_length=300
        )
        
        print(f"   📊 Context stats:")
        print(f"      Nodes included: {len(context_result.nodes_included)}")
        print(f"      Total characters: {context_result.total_characters}")
        print(f"      Estimated tokens: {context_result.estimated_tokens}")
        
        # Show a sample of the context
        context_lines = context_result.context_text.split('\n')
        print(f"   📋 Context preview (first 10 lines):")
        for i, line in enumerate(context_lines[:10], 1):
            print(f"      {i:2d}. {line}")
        
        if len(context_lines) > 10:
            print(f"      ... ({len(context_lines) - 10} more lines)")
        
        # Save full context to file for inspection
        output_file = f"context_output_{query.replace(' ', '_')}.md"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(context_result.context_text)
        print(f"   💾 Full context saved to: {output_file}")


def test_performance_benchmarks(graph_utils: GraphUtils):
    """Test performance of various operations"""
    print("\n" + "=" * 60)
    print("⚡ PERFORMANCE BENCHMARKS")
    print("=" * 60)
    
    # Benchmark different operations
    operations = [
        ("Name search", lambda: graph_utils.search_by_name("parse", limit=20)),
        ("Pattern search", lambda: graph_utils.search_by_pattern("*main*", limit=20)),
        ("Code search", lambda: graph_utils.search_by_code_content("def", limit=10)),
        ("Fuzzy search", lambda: graph_utils.fuzzy_search("server", limit=15)),
        ("Category search", lambda: graph_utils.search_by_category("function", limit=50)),
        ("Multi-term search", lambda: graph_utils.multi_term_search(["parse", "document"], limit=10)),
    ]
    
    for name, operation in operations:
        # Run multiple times to get average
        times = []
        for _ in range(5):
            start_time = time.time()
            result = operation()
            end_time = time.time()
            times.append((end_time - start_time) * 1000)
        
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print(f"   {name:20s}: avg={avg_time:6.2f}ms, min={min_time:6.2f}ms, max={max_time:6.2f}ms, results={len(result.nodes) if hasattr(result, 'nodes') else 'N/A'}")


def main():
    """Run all tests"""
    print("🚀 Starting Graph Utils Tests")
    print("=" * 80)
    
    # Test 1: Load graph
    graph_utils = test_graph_loading()
    if not graph_utils:
        print("❌ Cannot continue without loaded graph")
        return
    
    # Test 2: Search operations
    test_search_operations(graph_utils)
    
    # Test 3: Category and file searches
    test_category_and_file_searches(graph_utils)
    
    # Test 4: Multi-term search
    test_multi_term_search(graph_utils)
    
    # Test 5: Graph traversal
    test_graph_traversal(graph_utils)
    
    # Test 6: Context generation
    test_context_generation(graph_utils)
    
    # Test 7: Performance benchmarks
    test_performance_benchmarks(graph_utils)
    
    print("\n" + "=" * 80)
    print("🏁 All tests completed!")
    print("=" * 80)


if __name__ == "__main__":
    main()
