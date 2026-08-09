"""
Test file for advanced GraphSearchTool methods

Tests all the new tools that enhance code analysis capabilities.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from gitvizz import GraphGenerator, GraphSearchTool


def create_comprehensive_codebase():
    """Create a more comprehensive codebase for testing advanced features."""
    return [
        {
            "path": "app/main.py",
            "content": '''
"""Main application entry point."""
from .services import UserService, EmailService, PaymentService
from .models import User, Order
from .database import UserRepository

def main():
    """Application entry point."""
    user_service = UserService()
    users = user_service.get_all_users()
    return users

class Application:
    def __init__(self):
        self.user_service = UserService()
        self.email_service = EmailService()
        self.payment_service = PaymentService()
        self.user_repo = UserRepository()
    
    def process_user_registration(self, user_data):
        # Create user
        user = self.user_service.create_user(user_data)
        
        # Send welcome email
        self.email_service.send_welcome_email(user)
        
        # Setup payment account
        self.payment_service.create_account(user)
        
        # Log user creation
        self.user_repo.log_creation(user.id)
        
        return user
    
    def process_order(self, order_data):
        order = Order(**order_data)
        user = self.user_service.get_user(order.user_id)
        
        # Process payment
        payment_result = self.payment_service.process_payment(order)
        
        # Send confirmation
        self.email_service.send_order_confirmation(user, order)
        
        # Update inventory
        self.inventory_service.update_stock(order.items)
        
        return order
''',
            "full_path": "/project/app/main.py"
        },
        {
            "path": "app/services.py",
            "content": '''
"""Business logic services."""
from .models import User, Order
from .database import UserRepository, OrderRepository
from .external import EmailAPI, PaymentAPI

class BaseService:
    """Base service class."""
    def __init__(self):
        self.logger = self.setup_logger()
    
    def setup_logger(self):
        import logging
        return logging.getLogger(self.__class__.__name__)

class UserService(BaseService):
    """User management service."""
    def __init__(self):
        super().__init__()
        self.user_repo = UserRepository()
        self.email_service = None  # Circular dependency!
    
    def get_all_users(self):
        """Get all users."""
        users = self.user_repo.get_all()
        self.logger.info(f"Retrieved {len(users)} users")
        return users
    
    def create_user(self, user_data):
        """Create a new user."""
        # Validation
        if not user_data.get("email"):
            raise ValueError("Email required")
        
        # Create user
        user = User(**user_data)
        saved_user = self.user_repo.save(user)
        
        # Send notification
        if self.email_service:
            self.email_service.send_welcome_email(saved_user)
        
        self.logger.info(f"Created user: {saved_user.id}")
        return saved_user
    
    def get_user(self, user_id):
        """Get user by ID."""
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        return user
    
    def update_user(self, user_id, update_data):
        """Update user data."""
        user = self.get_user(user_id)
        for key, value in update_data.items():
            setattr(user, key, value)
        return self.user_repo.save(user)
    
    def delete_user(self, user_id):
        """Delete a user."""
        user = self.get_user(user_id)
        self.user_repo.delete(user_id)
        self.logger.info(f"Deleted user: {user_id}")
        return True

class EmailService(BaseService):
    """Email service with many responsibilities (God class anti-pattern)."""
    def __init__(self):
        super().__init__()
        self.email_api = EmailAPI()
        self.user_service = UserService()  # Circular dependency!
        self.template_cache = {}
        self.send_queue = []
        self.analytics_data = {}
        self.bounce_handler = BounceHandler()
        self.spam_filter = SpamFilter()
        self.rate_limiter = RateLimiter()
    
    def send_welcome_email(self, user):
        """Send welcome email."""
        template = self.get_template("welcome")
        content = self.render_template(template, {"user": user})
        self.validate_content(content)
        self.check_spam_score(content)
        self.apply_rate_limiting(user.email)
        self.queue_email(user.email, "Welcome!", content)
        self.update_analytics("welcome_sent")
        self.log_email_event("welcome", user.id)
    
    def send_order_confirmation(self, user, order):
        """Send order confirmation."""
        template = self.get_template("order_confirmation")
        content = self.render_template(template, {"user": user, "order": order})
        self.validate_content(content)
        self.queue_email(user.email, "Order Confirmation", content)
        self.update_analytics("order_confirmation_sent")
    
    def send_password_reset(self, user):
        """Send password reset email."""
        template = self.get_template("password_reset")
        token = self.generate_reset_token(user)
        content = self.render_template(template, {"user": user, "token": token})
        self.validate_content(content)
        self.queue_email(user.email, "Password Reset", content)
    
    def get_template(self, template_name):
        """Get email template."""
        if template_name in self.template_cache:
            return self.template_cache[template_name]
        
        # Load template from file
        template = self.load_template_from_file(template_name)
        self.template_cache[template_name] = template
        return template
    
    def render_template(self, template, context):
        """Render email template."""
        # Complex template rendering logic (50+ lines - long method anti-pattern)
        rendered = template
        for key, value in context.items():
            rendered = rendered.replace(f"{{{key}}}", str(value))
        
        # Add header
        rendered = self.add_email_header(rendered)
        
        # Add footer
        rendered = self.add_email_footer(rendered)
        
        # Apply styles
        rendered = self.apply_email_styles(rendered)
        
        # Minify HTML
        rendered = self.minify_html(rendered)
        
        # Add tracking pixels
        rendered = self.add_tracking_pixels(rendered)
        
        # Validate HTML
        if not self.validate_html(rendered):
            raise ValueError("Invalid HTML generated")
        
        return rendered

class PaymentService(BaseService):
    """Payment processing service."""
    def __init__(self):
        super().__init__()
        self.payment_api = PaymentAPI()
        self.user_service = UserService()
    
    def process_payment(self, order):
        """Process payment for order."""
        user = self.user_service.get_user(order.user_id)
        
        # Validate payment data
        if not order.payment_method:
            raise ValueError("Payment method required")
        
        # Process payment
        result = self.payment_api.charge(
            amount=order.total,
            payment_method=order.payment_method,
            customer_id=user.id
        )
        
        self.logger.info(f"Payment processed: {result.transaction_id}")
        return result
    
    def create_account(self, user):
        """Create payment account for user."""
        account = self.payment_api.create_customer(user)
        self.logger.info(f"Payment account created: {account.id}")
        return account
''',
            "full_path": "/project/app/services.py"
        },
        {
            "path": "test/test_services.py",
            "content": '''
"""Tests for services."""
import pytest
from app.services import UserService, EmailService

class TestUserService:
    def test_create_user(self):
        """Test user creation."""
        service = UserService()
        user_data = {"email": "test@example.com", "name": "Test User"}
        user = service.create_user(user_data)
        assert user.email == "test@example.com"
    
    def test_get_user(self):
        """Test getting user by ID."""
        service = UserService()
        user = service.get_user(1)
        assert user is not None

class TestEmailService:
    def test_send_welcome_email(self):
        """Test welcome email sending."""
        service = EmailService()
        user = User(id=1, email="test@example.com")
        result = service.send_welcome_email(user)
        assert result is True
''',
            "full_path": "/project/test/test_services.py"
        },
        {
            "path": "app/models.py",
            "content": '''
"""Data models."""
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime

@dataclass
class User:
    id: int
    email: str
    name: str
    created_at: Optional[datetime] = None
    is_active: bool = True

@dataclass  
class Order:
    id: int
    user_id: int
    items: List[dict]
    total: float
    payment_method: str
    created_at: Optional[datetime] = None
''',
            "full_path": "/project/app/models.py"
        },
        {
            "path": "app/database.py",
            "content": '''
"""Database repositories."""
from .models import User, Order

class UserRepository:
    def get_all(self):
        return []
    
    def get_by_id(self, user_id):
        return User(id=user_id, email="test@example.com", name="Test")
    
    def save(self, user):
        return user
    
    def delete(self, user_id):
        pass
    
    def log_creation(self, user_id):
        pass

class OrderRepository:
    def get_by_user(self, user_id):
        return []
    
    def save(self, order):
        return order
''',
            "full_path": "/project/app/database.py"
        },
        {
            "path": "unused_module.py",
            "content": '''
"""This module is never imported or used."""

class UnusedClass:
    def unused_method(self):
        """This method is never called."""
        return "unused"

def unused_function():
    """This function is never called."""
    return 42
''',
            "full_path": "/project/unused_module.py"
        }
    ]


def test_advanced_tools():
    """Test all advanced GraphSearchTool methods."""
    print("🔧 Testing Advanced GraphSearchTool Features")
    print("="*60)
    
    # Setup
    files = create_comprehensive_codebase()
    graph = GraphGenerator(files)
    search = GraphSearchTool(graph)
    
    print(f"📊 Graph: {len(search.nodes_map)} nodes, {len(search.edges_list)} edges")
    
    # Test 1: Find similar structures
    print("\n1️⃣ Testing find_similar_structures")
    # Get a service class as pattern
    service_pattern = search.filter_by_category(["class"])
    if service_pattern.all_nodes_data:
        similar_structures = search.find_similar_structures(service_pattern)
        print(f"   🔍 Similar structures: {len(similar_structures.all_nodes_data)} nodes")
        if hasattr(similar_structures, '_search_metadata'):
            matches = similar_structures._search_metadata.get('matches_found', 0)
            print(f"   📋 Pattern matches found: {matches}")
    
    # Test 2: Find unused code
    print("\n2️⃣ Testing find_unused_code")
    unused_subgraph = search.find_unused_code()
    print(f"   🗑️ Unused code: {len(unused_subgraph.all_nodes_data)} nodes")
    if hasattr(unused_subgraph, '_search_metadata'):
        unused_count = unused_subgraph._search_metadata.get('unused_count', 0)
        print(f"   📋 Potentially unused items: {unused_count}")
    
    # Test 3: Find circular dependencies
    print("\n3️⃣ Testing find_circular_dependencies")
    cycles_subgraph = search.find_circular_dependencies()
    print(f"   🔄 Circular dependencies: {len(cycles_subgraph.all_nodes_data)} nodes")
    if hasattr(cycles_subgraph, '_search_metadata'):
        cycle_count = cycles_subgraph._search_metadata.get('cycle_count', 0)
        print(f"   📋 Cycles found: {cycle_count}")
    
    # Test 4: Find anti-patterns (God classes)
    print("\n4️⃣ Testing find_anti_patterns (god_class)")
    god_classes = search.find_anti_patterns("god_class")
    print(f"   😈 God classes: {len(god_classes.all_nodes_data)} nodes")
    if hasattr(god_classes, '_search_metadata'):
        instances = god_classes._search_metadata.get('instances_found', 0)
        print(f"   📋 God class instances: {instances}")
    
    # Test 5: Find anti-patterns (Long methods)
    print("\n5️⃣ Testing find_anti_patterns (long_method)")
    long_methods = search.find_anti_patterns("long_method")
    print(f"   📏 Long methods: {len(long_methods.all_nodes_data)} nodes")
    if hasattr(long_methods, '_search_metadata'):
        instances = long_methods._search_metadata.get('instances_found', 0)
        print(f"   📋 Long method instances: {instances}")
    
    # Test 6: Find interface violations
    print("\n6️⃣ Testing find_interface_violations")
    violations = search.find_interface_violations()
    print(f"   ⚠️ Interface violations: {len(violations.all_nodes_data)} nodes")
    if hasattr(violations, '_search_metadata'):
        violation_count = violations._search_metadata.get('violations_found', 0)
        print(f"   📋 Violations found: {violation_count}")
    
    # Test 7: Get dependency layers
    print("\n7️⃣ Testing get_dependency_layers")
    layers = search.get_dependency_layers()
    print(f"   🏗️ Dependency layers: {len(layers.all_nodes_data)} nodes")
    if hasattr(layers, '_search_metadata'):
        layer_count = layers._search_metadata.get('total_layers', 0)
        print(f"   📋 Architecture layers: {layer_count}")
    
    # Test 8: Find test coverage gaps
    print("\n8️⃣ Testing find_test_coverage_gaps")
    coverage_gaps = search.find_test_coverage_gaps()
    print(f"   🧪 Test coverage gaps: {len(coverage_gaps.all_nodes_data)} nodes")
    if hasattr(coverage_gaps, '_search_metadata'):
        untested = coverage_gaps._search_metadata.get('untested_nodes', 0)
        coverage_ratio = coverage_gaps._search_metadata.get('coverage_ratio', 0)
        print(f"   📋 Untested nodes: {untested}")
        print(f"   📊 Coverage ratio: {coverage_ratio:.2%}")
    
    # Test 9: Demonstrate visualization of results
    print("\n9️⃣ Testing visualization capabilities")
    visualizable_results = [
        ("God Classes", god_classes),
        ("Circular Dependencies", cycles_subgraph),
        ("Unused Code", unused_subgraph),
        ("Coverage Gaps", coverage_gaps)
    ]
    
    for name, subgraph in visualizable_results:
        try:
            viz = subgraph.visualize(height=200, node_color="category")
            print(f"   ✅ {name} visualization ready")
        except ImportError:
            print(f"   ⚠️ {name} ready for visualization (ipysigma needed)")
    
    # Test 10: LLM context generation for code quality analysis
    print("\n🔟 Testing LLM context for code quality analysis")
    quality_context = GraphSearchTool.build_llm_context([
        god_classes,
        long_methods,
        violations,
        cycles_subgraph
    ], include_code=False)  # Don't include code for brevity
    
    print(f"   🤖 Quality analysis context: {len(quality_context)} characters")
    print("   📝 Context preview (code quality issues):")
    print(f"   {quality_context[:300]}...")
    
    return {
        'search': search,
        'similar_structures': similar_structures if 'similar_structures' in locals() else None,
        'unused_code': unused_subgraph,
        'cycles': cycles_subgraph,
        'god_classes': god_classes,
        'long_methods': long_methods,
        'violations': violations,
        'layers': layers,
        'coverage_gaps': coverage_gaps,
        'quality_context': quality_context
    }


def demonstrate_real_world_scenarios():
    """Demonstrate real-world usage scenarios for the advanced tools."""
    print("\n" + "="*60)
    print("🌟 REAL-WORLD SCENARIOS")
    print("="*60)
    
    files = create_comprehensive_codebase()
    graph = GraphGenerator(files)
    search = GraphSearchTool(graph)
    
    # Scenario 1: Code Review Preparation
    print("\n📋 Scenario 1: Preparing for Code Review")
    print("-" * 40)
    
    # Find potential issues
    god_classes = search.find_anti_patterns("god_class")
    cycles = search.find_circular_dependencies()
    unused = search.find_unused_code()
    
    print("Code review checklist:")
    god_count = len(god_classes.all_nodes_data)
    cycle_count = len(cycles.all_nodes_data) 
    unused_count = len(unused.all_nodes_data)
    
    print(f"  • God classes to refactor: {god_count}")
    print(f"  • Circular dependencies to resolve: {cycle_count}")
    print(f"  • Unused code to remove: {unused_count}")
    
    # Generate comprehensive report
    review_context = GraphSearchTool.build_llm_context([god_classes, cycles, unused])
    print(f"  • Generated review report: {len(review_context)} characters")
    
    # Scenario 2: Architecture Analysis
    print("\n🏗️ Scenario 2: Architecture Health Check")
    print("-" * 40)
    
    layers = search.get_dependency_layers()
    violations = search.find_interface_violations()
    
    if hasattr(layers, '_search_metadata'):
        layer_count = layers._search_metadata.get('total_layers', 0)
        print(f"  • Architecture layers identified: {layer_count}")
    
    if hasattr(violations, '_search_metadata'):
        violation_count = violations._search_metadata.get('violations_found', 0)
        print(f"  • Interface violations found: {violation_count}")
    
    # Scenario 3: Test Strategy Planning
    print("\n🧪 Scenario 3: Test Coverage Analysis")
    print("-" * 40)
    
    coverage_gaps = search.find_test_coverage_gaps()
    if hasattr(coverage_gaps, '_search_metadata'):
        metadata = coverage_gaps._search_metadata
        print(f"  • Test files found: {metadata.get('test_nodes', 0)}")
        print(f"  • Tested components: {metadata.get('tested_nodes', 0)}")
        print(f"  • Untested components: {metadata.get('untested_nodes', 0)}")
        print(f"  • Coverage ratio: {metadata.get('coverage_ratio', 0):.1%}")
    
    # Scenario 4: Refactoring Opportunities
    print("\n🔄 Scenario 4: Refactoring Prioritization")
    print("-" * 40)
    
    # Find high-complexity areas
    hotspots = search.get_high_connectivity_nodes(min_connections=5)
    long_methods = search.find_anti_patterns("long_method")
    
    print(f"  • Complexity hotspots: {len(hotspots.all_nodes_data)} nodes")
    print(f"  • Long methods to split: {len(long_methods.all_nodes_data)} methods")
    
    # Generate refactoring plan
    refactoring_context = GraphSearchTool.build_llm_context([hotspots, long_methods, god_classes])
    print(f"  • Refactoring plan generated: {len(refactoring_context)} characters")
    
    print("\n✨ All scenarios demonstrate the power of subgraph-centric analysis!")


if __name__ == "__main__":
    # Run advanced tools tests
    results = test_advanced_tools()
    
    # Demonstrate real-world scenarios
    demonstrate_real_world_scenarios()
    
    print("\n" + "="*60)
    print("🎉 ADVANCED TOOLS TESTING COMPLETE!")
    print("="*60)
    print("\n🔧 New Tools Available:")
    print("   ✅ find_similar_structures() - Pattern matching")
    print("   ✅ find_unused_code() - Dead code detection")
    print("   ✅ find_circular_dependencies() - Dependency cycles")
    print("   ✅ find_anti_patterns() - Code smell detection") 
    print("   ✅ find_interface_violations() - Architecture issues")
    print("   ✅ get_dependency_layers() - Layered architecture")
    print("   ✅ find_test_coverage_gaps() - Testing opportunities")
    print("\n🌟 All tools return GraphGenerator subgraphs!")
    print("   • Directly visualizable")
    print("   • Chainable with other operations")
    print("   • LLM context ready")
    print("   • Perfect for code quality analysis")