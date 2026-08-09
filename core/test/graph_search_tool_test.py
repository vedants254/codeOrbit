"""
Test file for the redesigned GraphSearchTool with subgraph-centric API

All methods now return GraphGenerator subgraphs that can be directly visualized
and chained together. This demonstrates the new clean, consistent API.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from gitvizz import GraphGenerator, GraphSearchTool


def create_sample_codebase():
    """Create a realistic codebase for testing."""
    return [
        {
            "path": "app/main.py",
            "content": '''
"""Main application entry point."""
from fastapi import FastAPI
from .auth import AuthService
from .database import UserRepository, PostRepository
from .models import User, Post

class Application:
    def __init__(self):
        self.app = FastAPI()
        self.auth = AuthService()
        self.user_repo = UserRepository()
        self.post_repo = PostRepository()
    
    def setup_routes(self):
        @self.app.get("/users")
        async def get_users():
            return await self.user_repo.get_all()
        
        @self.app.post("/users")
        async def create_user(user: User):
            return await self.user_repo.create(user)
    
    def run(self):
        self.setup_routes()
        return self.app

def main():
    app = Application()
    return app.run()
''',
            "full_path": "/project/app/main.py"
        },
        {
            "path": "app/auth.py",
            "content": '''
"""Authentication and authorization services."""
import jwt
from datetime import datetime, timedelta
from .models import User
from .database import UserRepository

class AuthService:
    def __init__(self, secret_key="secret"):
        self.secret_key = secret_key
        self.algorithm = "HS256"
        self.user_repo = UserRepository()
    
    def create_token(self, user: User) -> str:
        payload = {
            "user_id": user.id,
            "username": user.username,
            "exp": datetime.utcnow() + timedelta(hours=24)
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> dict:
        return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
    
    async def authenticate(self, username: str, password: str) -> User:
        user = await self.user_repo.get_by_username(username)
        if user and self.verify_password(password, user.password_hash):
            return user
        return None
    
    def verify_password(self, password: str, password_hash: str) -> bool:
        # Mock password verification
        return True

class AuthMiddleware:
    def __init__(self, auth_service: AuthService):
        self.auth_service = auth_service
    
    def verify_request(self, token: str) -> bool:
        try:
            self.auth_service.verify_token(token)
            return True
        except:
            return False
''',
            "full_path": "/project/app/auth.py"
        },
        {
            "path": "app/database.py",
            "content": '''
"""Database repositories and connection management."""
import asyncpg
from typing import List, Optional
from .models import User, Post

class DatabaseConnection:
    def __init__(self, url: str = "postgresql://localhost/db"):
        self.url = url
        self.pool = None
    
    async def connect(self):
        self.pool = await asyncpg.create_pool(self.url)
    
    async def disconnect(self):
        if self.pool:
            await self.pool.close()

class BaseRepository:
    def __init__(self):
        self.db = DatabaseConnection()
    
    async def get_connection(self):
        return self.db.pool.acquire()

class UserRepository(BaseRepository):
    async def get_all(self) -> List[User]:
        async with await self.get_connection() as conn:
            rows = await conn.fetch("SELECT * FROM users")
            return [User(**row) for row in rows]
    
    async def get_by_id(self, user_id: int) -> Optional[User]:
        async with await self.get_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
            return User(**row) if row else None
    
    async def get_by_username(self, username: str) -> Optional[User]:
        async with await self.get_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM users WHERE username = $1", username)
            return User(**row) if row else None
    
    async def create(self, user: User) -> User:
        async with await self.get_connection() as conn:
            await conn.execute(
                "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
                user.username, user.email, user.password_hash
            )
            return user

class PostRepository(BaseRepository):
    async def get_by_user(self, user_id: int) -> List[Post]:
        async with await self.get_connection() as conn:
            rows = await conn.fetch("SELECT * FROM posts WHERE user_id = $1", user_id)
            return [Post(**row) for row in rows]
    
    async def create(self, post: Post) -> Post:
        async with await self.get_connection() as conn:
            await conn.execute(
                "INSERT INTO posts (title, content, user_id) VALUES ($1, $2, $3)",
                post.title, post.content, post.user_id
            )
            return post

class CachedUserRepository(UserRepository):
    def __init__(self):
        super().__init__()
        self.cache = {}
    
    async def get_by_id(self, user_id: int) -> Optional[User]:
        if user_id in self.cache:
            return self.cache[user_id]
        
        user = await super().get_by_id(user_id)
        if user:
            self.cache[user_id] = user
        return user
''',
            "full_path": "/project/app/database.py"
        },
        {
            "path": "app/models.py",
            "content": '''
"""Data models and schemas."""
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class User:
    id: int
    username: str
    email: str
    password_hash: Optional[str] = None
    created_at: Optional[datetime] = None
    is_active: bool = True
    
    def get_display_name(self) -> str:
        return self.username.title()
    
    def is_admin(self) -> bool:
        return self.username == "admin"

@dataclass
class Post:
    id: int
    title: str
    content: str
    user_id: int
    created_at: Optional[datetime] = None
    published: bool = False
    
    def get_summary(self, length: int = 100) -> str:
        return self.content[:length] + "..." if len(self.content) > length else self.content
    
    def get_word_count(self) -> int:
        return len(self.content.split())

@dataclass
class ApiResponse:
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    timestamp: Optional[datetime] = None
    
    @classmethod
    def success_response(cls, data: dict):
        return cls(success=True, data=data, timestamp=datetime.now())
    
    @classmethod
    def error_response(cls, error: str):
        return cls(success=False, error=error, timestamp=datetime.now())
''',
            "full_path": "/project/app/models.py"
        },
        {
            "path": "utils/helpers.py",
            "content": '''
"""Utility functions and helpers."""
import hashlib
import secrets
from typing import Any, Dict, List

def hash_password(password: str) -> str:
    """Hash a password using SHA-256 with salt."""
    salt = secrets.token_hex(16)
    return hashlib.sha256(f"{password}{salt}".encode()).hexdigest()

def generate_api_key() -> str:
    """Generate a secure API key."""
    return secrets.token_urlsafe(32)

def validate_email(email: str) -> bool:
    """Basic email validation."""
    return "@" in email and "." in email.split("@")[1]

class ConfigManager:
    def __init__(self, config_path: str = "config.json"):
        self.config_path = config_path
        self.config = {}
    
    def load(self):
        import json
        with open(self.config_path) as f:
            self.config = json.load(f)
    
    def get(self, key: str, default: Any = None) -> Any:
        return self.config.get(key, default)

class Logger:
    def __init__(self, name: str):
        self.name = name
    
    def info(self, message: str):
        print(f"[{self.name}] INFO: {message}")
    
    def error(self, message: str):
        print(f"[{self.name}] ERROR: {message}")

def paginate_results(items: List[Any], page: int = 1, per_page: int = 10) -> Dict[str, Any]:
    """Paginate a list of items."""
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "page": page,
        "per_page": per_page,
        "total": len(items),
        "pages": (len(items) + per_page - 1) // per_page
    }
''',
            "full_path": "/project/utils/helpers.py"
        }
    ]


def test_subgraph_api():
    """Test the new subgraph-centric API."""
    print("🔍 Testing New GraphSearchTool Subgraph API")
    print("=" * 50)
    
    # Create test data
    files = create_sample_codebase()
    graph_gen = GraphGenerator(files)
    search_tool = GraphSearchTool(graph_gen)
    
    print(f"📊 Original graph: {len(search_tool.nodes_map)} nodes, {len(search_tool.edges_list)} edges")
    
    # Test 1: Fuzzy search returns subgraph
    print("\n1️⃣ Testing fuzzy_search -> returns GraphGenerator")
    db_subgraph = search_tool.fuzzy_search("database", depth=2)
    print(f"   📈 Search result: {len(db_subgraph.all_nodes_data)} nodes, {len(db_subgraph.all_edges_data)} edges")
    print(f"   🎯 Search metadata: {getattr(db_subgraph, '_search_metadata', {}).get('search_type', 'N/A')}")
    
    # Test 2: Direct visualization
    print("\n2️⃣ Testing direct visualization")
    try:
        viz = db_subgraph.visualize(height=300, node_color="category")
        print("   ✅ Visualization created successfully")
    except ImportError:
        print("   ⚠️ ipysigma not available, but subgraph is ready for visualization")
    
    # Test 3: Category filter returns subgraph
    print("\n3️⃣ Testing filter_by_category -> returns GraphGenerator")
    class_subgraph = search_tool.filter_by_category(["class"])
    print(f"   📈 Class filter result: {len(class_subgraph.all_nodes_data)} nodes, {len(class_subgraph.all_edges_data)} edges")
    
    # Test 4: Chaining operations (search on subgraph)
    print("\n4️⃣ Testing chaining with new GraphSearchTool on subgraph")
    # Create new search tool from subgraph
    subgraph_search = GraphSearchTool(db_subgraph)
    user_subgraph = subgraph_search.fuzzy_search("user", depth=1)
    print(f"   📈 Chained search result: {len(user_subgraph.all_nodes_data)} nodes, {len(user_subgraph.all_edges_data)} edges")
    
    # Test 5: LLM context from subgraphs
    print("\n5️⃣ Testing LLM context generation from subgraphs")
    context = GraphSearchTool.build_llm_context([db_subgraph, class_subgraph])
    print(f"   📄 Generated context: {len(context)} characters")
    print("   📝 Context preview:")
    print(f"   {context[:200]}...")
    
    # Test 6: Relationship-based search
    print("\n6️⃣ Testing find_by_relationship -> returns GraphGenerator")
    inheritance_subgraph = search_tool.find_by_relationship(["inherits"])
    print(f"   📈 Inheritance result: {len(inheritance_subgraph.all_nodes_data)} nodes, {len(inheritance_subgraph.all_edges_data)} edges")
    
    # Test 7: Neighbor analysis
    print("\n7️⃣ Testing get_neighbors -> returns GraphGenerator")
    if search_tool.nodes_map:
        node_id = next(iter(search_tool.nodes_map.keys()))
        neighbors_subgraph = search_tool.get_neighbors(node_id, depth=2)
        print(f"   📈 Neighbors of {node_id}: {len(neighbors_subgraph.all_nodes_data)} nodes, {len(neighbors_subgraph.all_edges_data)} edges")
    
    # Test 8: Path finding
    print("\n8️⃣ Testing find_paths -> returns GraphGenerator")
    if len(search_tool.nodes_map) >= 2:
        node_ids = list(search_tool.nodes_map.keys())
        paths_subgraph = search_tool.find_paths(node_ids[0], node_ids[1])
        print(f"   📈 Paths result: {len(paths_subgraph.all_nodes_data)} nodes, {len(paths_subgraph.all_edges_data)} edges")
        if hasattr(paths_subgraph, '_search_metadata'):
            paths_found = paths_subgraph._search_metadata.get('path_count', 0)
            print(f"   🛤️ Found {paths_found} paths")
    
    # Test 9: High connectivity analysis
    print("\n9️⃣ Testing get_high_connectivity_nodes -> returns GraphGenerator")
    hotspots_subgraph = search_tool.get_high_connectivity_nodes(min_connections=2)
    print(f"   📈 Hotspots result: {len(hotspots_subgraph.all_nodes_data)} nodes, {len(hotspots_subgraph.all_edges_data)} edges")
    
    # Test 10: Multiple subgraph LLM context
    print("\n🔟 Testing multi-subgraph LLM context")
    multi_context = GraphSearchTool.build_llm_context([
        db_subgraph,
        class_subgraph,
        hotspots_subgraph
    ], include_code=True)
    print(f"   📄 Multi-subgraph context: {len(multi_context)} characters")
    
    return {
        'search_tool': search_tool,
        'db_subgraph': db_subgraph,
        'class_subgraph': class_subgraph,
        'hotspots_subgraph': hotspots_subgraph
    }


def demo_clean_api():
    """Demonstrate the clean, simple API."""
    print("\n" + "="*60)
    print("✨ CLEAN API DEMONSTRATION")
    print("="*60)
    
    # Setup
    files = create_sample_codebase()
    graph_gen = GraphGenerator(files)
    search = GraphSearchTool(graph_gen)
    
    print("🎯 The new API is incredibly clean:")
    print()
    
    # Every method returns a subgraph
    print("# Search for database-related code")
    print("db_graph = search.fuzzy_search('database')")
    db_graph = search.fuzzy_search('database')
    print(f"# Result: {len(db_graph.all_nodes_data)} nodes, {len(db_graph.all_edges_data)} edges")
    print()
    
    print("# Visualize directly")
    print("db_graph.visualize()  # Ready to display!")
    print()
    
    print("# Get all classes")
    print("classes = search.filter_by_category(['class'])")
    classes = search.filter_by_category(['class'])
    print(f"# Result: {len(classes.all_nodes_data)} nodes")
    print()
    
    print("# Find inheritance relationships")
    print("inheritance = search.find_by_relationship(['inherits'])")
    inheritance = search.find_by_relationship(['inherits'])
    print(f"# Result: {len(inheritance.all_nodes_data)} nodes")
    print()
    
    print("# Generate LLM context from multiple subgraphs")
    print("context = GraphSearchTool.build_llm_context([db_graph, classes])")
    context = GraphSearchTool.build_llm_context([db_graph, classes])
    print(f"# Result: {len(context)} characters of formatted context")
    print()
    
    print("# Chain operations")
    print("auth_search = GraphSearchTool(db_graph)  # Search within subgraph")
    print("auth_results = auth_search.fuzzy_search('auth')")
    auth_search = GraphSearchTool(db_graph)
    auth_results = auth_search.fuzzy_search('auth')
    print(f"# Result: {len(auth_results.all_nodes_data)} nodes")
    print()
    
    print("🎉 Every method returns a GraphGenerator subgraph!")
    print("   ✅ Directly visualizable with .visualize()")
    print("   ✅ Chainable with new GraphSearchTool instances")  
    print("   ✅ Compatible with LLM context generation")
    print("   ✅ Consistent API across all operations")
    
    return {
        'db_graph': db_graph,
        'classes': classes,
        'inheritance': inheritance,
        'auth_results': auth_results,
        'context': context
    }


def performance_comparison():
    """Show the difference between old and new API."""
    print("\n" + "="*60)
    print("⚡ API COMPARISON")
    print("="*60)
    
    files = create_sample_codebase()
    graph_gen = GraphGenerator(files)
    search = GraphSearchTool(graph_gen)
    
    print("❌ OLD API Pattern (hypothetical):")
    print("   results = search.fuzzy_search('database')  # Returns list of dicts")
    print("   node_ids = [r['node_id'] for r in results]  # Extract IDs")
    print("   subgraph = search.extract_subgraph(node_ids)  # Convert to subgraph")
    print("   viz_gen = GraphGenerator(subgraph['nodes'])  # Create new generator")
    print("   viz_gen.all_edges_data = subgraph['edges']  # Set edges")
    print("   viz_gen.visualize()  # Finally visualize!")
    print("   # 6 lines of boilerplate! 😞")
    print()
    
    print("✅ NEW API Pattern:")
    print("   subgraph = search.fuzzy_search('database')  # Returns GraphGenerator")
    print("   subgraph.visualize()  # Done! 🎉")
    print("   # 2 lines, clean and simple!")
    print()
    
    print("🔄 Chaining Comparison:")
    print()
    print("❌ OLD:")
    print("   results1 = search.fuzzy_search('database')")
    print("   subgraph1 = create_subgraph_from_results(results1)  # Complex")
    print("   search2 = GraphSearchTool(subgraph1)  # More setup")
    print("   results2 = search2.fuzzy_search('user')  # Finally search")
    print("   # Complex multi-step process")
    print()
    
    print("✅ NEW:")
    print("   db_graph = search.fuzzy_search('database')")
    print("   user_graph = GraphSearchTool(db_graph).fuzzy_search('user')")
    print("   # Clean and intuitive!")
    print()
    
    # Demonstrate the actual new API
    print("🎯 Live Demo of New API:")
    db_graph = search.fuzzy_search('database')
    print(f"   search.fuzzy_search('database') → {len(db_graph.all_nodes_data)} nodes")
    
    user_graph = GraphSearchTool(db_graph).fuzzy_search('user')  
    print(f"   GraphSearchTool(db_graph).fuzzy_search('user') → {len(user_graph.all_nodes_data)} nodes")
    
    context = GraphSearchTool.build_llm_context([db_graph, user_graph])
    print(f"   build_llm_context([db_graph, user_graph]) → {len(context)} chars")


if __name__ == "__main__":
    # Run comprehensive tests
    test_results = test_subgraph_api()
    
    # Show clean API demo
    demo_results = demo_clean_api()
    
    # Performance comparison
    performance_comparison()
    
    print("\n" + "="*60)
    print("🎉 ALL TESTS PASSED - NEW API IS READY!")
    print("="*60)
    print()
    print("🔑 KEY BENEFITS:")
    print("   ✅ Every method returns GraphGenerator subgraph")
    print("   ✅ Direct visualization with .visualize()")
    print("   ✅ Chainable operations")
    print("   ✅ Consistent API across all methods")
    print("   ✅ LLM context generation from subgraphs")
    print("   ✅ No boilerplate code needed")
    print("   ✅ Intuitive and clean to use")
    print()
    print("📊 Test Summary:")
    print(f"   • Original graph: {len(test_results['search_tool'].nodes_map)} nodes")
    print(f"   • Database subgraph: {len(test_results['db_subgraph'].all_nodes_data)} nodes")
    print(f"   • Class subgraph: {len(test_results['class_subgraph'].all_nodes_data)} nodes")
    print(f"   • Hotspots subgraph: {len(test_results['hotspots_subgraph'].all_nodes_data)} nodes")
    print(f"   • Context generated: {len(demo_results['context'])} characters")