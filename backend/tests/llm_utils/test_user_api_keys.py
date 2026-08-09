#!/usr/bin/env python3
"""
User API Key Management Test
Tests user-specific API key storage, encryption, and usage with dummy users
"""

import asyncio
import os
from typing import Dict, List
from datetime import datetime, timezone

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Loaded .env file successfully")
except ImportError:
    print("⚠️  python-dotenv not available, using system environment variables")
except Exception as e:
    print(f"⚠️  Error loading .env file: {e}")

from utils.llm_utils import llm_service
from models.user import User
from models.chat import UserApiKey
from beanie import PydanticObjectId

class UserApiKeyTester:
    """User API key testing suite"""
    
    def __init__(self):
        self.test_results = {}
        self.dummy_users = []
        
        # API keys from .env for testing
        self.test_api_keys = {
            "openai": os.getenv("OPENAI_API_KEY"),
            "anthropic": os.getenv("ANTHROPIC_API_KEY"),
            "gemini": os.getenv("GEMINI_API_KEY"),
            "groq": os.getenv("GROQ_API_KEY")
        }
    
    def print_header(self, title: str):
        """Print formatted header"""
        print(f"\n{'='*60}")
        print(f"👤 {title}")
        print(f"{'='*60}")
    
    def print_subheader(self, title: str):
        """Print formatted subheader"""
        print(f"\n🔍 {title}")
        print("-" * 40)
    
    def create_dummy_user(self, username: str, email: str) -> User:
        """Create a dummy user for testing"""
        user = User.construct(
            id=PydanticObjectId(),
            fullname=f"Test User {username}",
            username=username,
            email=email,
            github_access_token="test-token-" + username,
            daily_requests_count=0,
            user_tier="unlimited",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        self.dummy_users.append(user)
        return user
    
    async def test_api_key_encryption_decryption(self):
        """Test API key encryption and decryption"""
        self.print_subheader("API Key Encryption/Decryption Test")
        
        test_api_key = "sk-test-key-1234567890abcdef"
        
        try:
            # Test encryption
            encrypted_key = llm_service.encrypt_api_key(test_api_key)
            print(f"✅ Encrypted key: {encrypted_key[:20]}...")
            
            # Test decryption
            decrypted_key = llm_service.decrypt_api_key(encrypted_key)
            print(f"✅ Decrypted key: {decrypted_key}")
            
            # Verify they match
            encryption_works = test_api_key == decrypted_key
            print(f"✅ Encryption/decryption: {'PASSED' if encryption_works else 'FAILED'}")
            
            self.test_results["encryption"] = {
                "success": encryption_works,
                "original_length": len(test_api_key),
                "encrypted_length": len(encrypted_key),
                "decrypted_matches": encryption_works
            }
            
            return encryption_works
            
        except Exception as e:
            print(f"❌ Encryption test failed: {e}")
            self.test_results["encryption"] = {"success": False, "error": str(e)}
            return False
    
    async def test_user_api_key_storage(self):
        """Test user API key storage and retrieval (without database)"""
        self.print_subheader("User API Key Storage Test")
        
        # Create dummy user
        user = self.create_dummy_user("apitest", "apitest@example.com")
        print(f"📝 Created dummy user: {user.username} (ID: {user.id})")
        
        storage_results = {}
        
        for provider, api_key in self.test_api_keys.items():
            if not api_key or len(api_key.strip()) == 0:
                print(f"⏭️  Skipping {provider} - No API key in .env")
                continue
            
            try:
                print(f"🔐 Testing {provider} API key storage...")
                
                # Test encryption (simulate storage without actual database)
                encrypted_key = llm_service.encrypt_api_key(api_key)
                
                # Test decryption (simulate retrieval)
                decrypted_key = llm_service.decrypt_api_key(encrypted_key)
                
                # Verify integrity
                key_matches = api_key == decrypted_key
                
                # Test API key verification (if verifier is available)
                try:
                    is_valid = llm_service.verify_api_key(provider, api_key)
                except:
                    is_valid = None  # Verifier not available
                
                storage_results[provider] = {
                    "encryption_success": True,
                    "decryption_success": True,
                    "key_integrity": key_matches,
                    "api_key_valid": is_valid,
                    "original_length": len(api_key),
                    "encrypted_length": len(encrypted_key)
                }
                
                status = "✅" if key_matches else "❌"
                valid_status = f", valid: {is_valid}" if is_valid is not None else ""
                print(f"   {status} {provider}: encrypted/decrypted successfully{valid_status}")
                
            except Exception as e:
                storage_results[provider] = {
                    "encryption_success": False,
                    "error": str(e)
                }
                print(f"   ❌ {provider}: Error - {e}")
        
        self.test_results["user_storage"] = {
            "user_id": str(user.id),
            "username": user.username,
            "providers_tested": list(storage_results.keys()),
            "results": storage_results
        }
        
        successful_providers = sum(1 for result in storage_results.values() if result.get("key_integrity", False))
        print(f"\n📊 Storage test: {successful_providers}/{len(storage_results)} providers successful")
        
        return successful_providers > 0
    
    async def test_user_llm_calls_with_simulated_keys(self):
        """Test LLM calls using simulated user API keys"""
        self.print_subheader("User LLM Calls Test (Simulated)")
        
        user = self.create_dummy_user("llmtest", "llmtest@example.com")
        print(f"👤 Testing with user: {user.username}")
        
        # Test models for each provider
        test_models = {
            "openai": "gpt-4o-mini",
            "anthropic": "claude-3-5-haiku-20241022",
            "gemini": "gemini-2.0-flash-exp", 
            "groq": "llama-3.3-70b-versatile"
        }
        
        llm_call_results = {}
        
        for provider, model in test_models.items():
            api_key = self.test_api_keys.get(provider)
            if not api_key:
                print(f"⏭️  Skipping {provider} - No API key")
                continue
            
            try:
                print(f"🚀 Testing {provider}/{model} with user API simulation...")
                
                # Simulate using user API key by temporarily setting it
                # In real implementation, this would use save_user_api_key and get_user_api_key
                original_key = llm_service.default_keys[provider]
                llm_service.default_keys[provider] = api_key
                
                # Test basic LLM call
                response = await llm_service.generate(
                    messages=[{"role": "user", "content": "What is 2+2? Answer briefly."}],
                    model=model,
                    temperature=0.1,
                    max_tokens=20
                )
                
                # Restore original key
                llm_service.default_keys[provider] = original_key
                
                if response.success:
                    llm_call_results[provider] = {
                        "success": True,
                        "model": model,
                        "response_length": len(response.content) if response.content else 0,
                        "usage": response.usage,
                        "content_preview": (response.content[:50] + "...") if response.content and len(response.content) > 50 else response.content
                    }
                    print(f"   ✅ Success: {response.content}")
                else:
                    llm_call_results[provider] = {
                        "success": False,
                        "model": model,
                        "error": response.error
                    }
                    print(f"   ❌ Failed: {response.error}")
                
            except Exception as e:
                llm_call_results[provider] = {
                    "success": False,
                    "model": model,
                    "error": str(e)
                }
                print(f"   💥 Exception: {e}")
        
        self.test_results["user_llm_calls"] = {
            "user_id": str(user.id),
            "results": llm_call_results
        }
        
        successful_calls = sum(1 for result in llm_call_results.values() if result.get("success", False))
        print(f"\n📊 LLM calls: {successful_calls}/{len(llm_call_results)} providers successful")
        
        return successful_calls > 0
    
    async def test_multiple_users_api_keys(self):
        """Test multiple users with different API keys"""
        self.print_subheader("Multiple Users API Keys Test")
        
        # Create multiple dummy users
        users = [
            self.create_dummy_user("user1", "user1@example.com"),
            self.create_dummy_user("user2", "user2@example.com"),
            self.create_dummy_user("user3", "user3@example.com")
        ]
        
        multi_user_results = {}
        
        for i, user in enumerate(users):
            print(f"\n👤 Testing user {i+1}: {user.username}")
            
            user_results = {}
            
            # Test each provider with this user
            for provider, api_key in self.test_api_keys.items():
                if not api_key:
                    continue
                
                try:
                    # Simulate user-specific API key encryption
                    encrypted_key = llm_service.encrypt_api_key(api_key)
                    decrypted_key = llm_service.decrypt_api_key(encrypted_key)
                    
                    # Simulate user API key retrieval
                    key_matches = api_key == decrypted_key
                    
                    user_results[provider] = {
                        "encryption_success": True,
                        "key_integrity": key_matches,
                        "encrypted_length": len(encrypted_key)
                    }
                    
                    print(f"   {provider}: {'✅' if key_matches else '❌'}")
                    
                except Exception as e:
                    user_results[provider] = {
                        "encryption_success": False,
                        "error": str(e)
                    }
                    print(f"   {provider}: ❌ Error - {e}")
            
            multi_user_results[user.username] = {
                "user_id": str(user.id),
                "results": user_results
            }
        
        self.test_results["multiple_users"] = multi_user_results
        
        # Calculate success rate
        total_tests = 0
        successful_tests = 0
        
        for user_result in multi_user_results.values():
            for provider_result in user_result["results"].values():
                total_tests += 1
                if provider_result.get("key_integrity", False):
                    successful_tests += 1
        
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        print(f"\n📊 Multiple users test: {successful_tests}/{total_tests} tests passed ({success_rate:.1f}%)")
        
        return success_rate > 80
    
    async def test_api_key_retrieval_methods(self):
        """Test different API key retrieval methods"""
        self.print_subheader("API Key Retrieval Methods Test")
        
        user = self.create_dummy_user("keytest", "keytest@example.com")
        
        retrieval_results = {}
        
        for provider, api_key in self.test_api_keys.items():
            if not api_key:
                continue
            
            print(f"🔑 Testing {provider} key retrieval methods...")
            
            try:
                # Test 1: System API key retrieval (use_user_key=False)
                system_key = await llm_service.get_api_key(provider, user, use_user_key=False)
                system_key_works = system_key is not None and len(system_key) > 0
                
                # Test 2: User API key retrieval simulation
                # In real scenario, this would try to get user's stored key first
                try:
                    user_key = await llm_service.get_api_key(provider, user, use_user_key=True)
                    user_key_works = False  # Expected to fail since no user key is stored
                except ValueError:
                    user_key_works = "expected_failure"  # This is expected behavior
                
                retrieval_results[provider] = {
                    "system_key_available": system_key_works,
                    "user_key_behavior": user_key_works,
                    "system_key_length": len(system_key) if system_key else 0
                }
                
                print(f"   System key: {'✅' if system_key_works else '❌'}")
                print(f"   User key fallback: {'✅' if user_key_works == 'expected_failure' else '❌'}")
                
            except Exception as e:
                retrieval_results[provider] = {
                    "system_key_available": False,
                    "error": str(e)
                }
                print(f"   ❌ Error: {e}")
        
        self.test_results["key_retrieval"] = {
            "user_id": str(user.id),
            "results": retrieval_results
        }
        
        successful_retrievals = sum(1 for result in retrieval_results.values() 
                                  if result.get("system_key_available", False))
        
        print(f"\n📊 Key retrieval: {successful_retrievals}/{len(retrieval_results)} providers successful")
        
        return successful_retrievals > 0
    
    async def test_model_capabilities_per_user(self):
        """Test model capabilities and costs per user context"""
        self.print_subheader("User Model Capabilities Test")
        
        user = self.create_dummy_user("capabilities", "capabilities@example.com")
        print(f"👤 Testing capabilities for user: {user.username}")
        
        # Test different models and their capabilities
        test_models = [
            ("openai", "gpt-4o-mini"),
            ("anthropic", "claude-3-5-haiku-20241022"),
            ("gemini", "gemini-2.0-flash-exp"),
            ("groq", "llama-3.3-70b-versatile")
        ]
        
        capabilities_results = {}
        
        for provider, model in test_models:
            print(f"\n🔍 {provider}/{model}:")
            
            try:
                # Get model capabilities
                config = llm_service.get_model_config(provider, model)
                max_context = llm_service.get_max_context_length(provider, model)
                max_output = llm_service.get_max_output_tokens(provider, model)
                supports_functions = llm_service.supports_function_calling(provider, model)
                supports_vision = llm_service.supports_vision(provider, model)
                is_reasoning = llm_service.is_reasoning_model(provider, model)
                cost_info = llm_service.get_cost_per_million_tokens(provider, model)
                
                capabilities_results[f"{provider}_{model}"] = {
                    "provider": provider,
                    "model": model,
                    "max_context": max_context,
                    "max_output": max_output,
                    "supports_functions": supports_functions,
                    "supports_vision": supports_vision,
                    "is_reasoning": is_reasoning,
                    "cost_per_1M_input": cost_info.get("input", 0),
                    "cost_per_1M_output": cost_info.get("output", 0),
                    "has_config": config is not None
                }
                
                print(f"   Context: {max_context:,} tokens")
                print(f"   Output: {max_output:,} tokens") 
                print(f"   Functions: {'✅' if supports_functions else '❌'}")
                print(f"   Vision: {'✅' if supports_vision else '❌'}")
                print(f"   Reasoning: {'✅' if is_reasoning else '❌'}")
                print(f"   Cost: ${cost_info['input']:.3f}/${cost_info['output']:.3f} per 1M tokens")
                
            except Exception as e:
                capabilities_results[f"{provider}_{model}"] = {
                    "provider": provider,
                    "model": model,
                    "error": str(e)
                }
                print(f"   ❌ Error: {e}")
        
        self.test_results["model_capabilities"] = {
            "user_id": str(user.id),
            "results": capabilities_results
        }
        
        successful_configs = sum(1 for result in capabilities_results.values() 
                               if result.get("has_config", False))
        
        print(f"\n📊 Model capabilities: {successful_configs}/{len(capabilities_results)} models configured")
        
        return successful_configs > 0
    
    async def run_all_user_tests(self):
        """Run comprehensive user API key test suite"""
        print("🎯 Starting User API Key Management Test Suite")
        
        # Test 1: Basic encryption/decryption
        self.print_header("ENCRYPTION TESTS")
        encryption_works = await self.test_api_key_encryption_decryption()
        
        # Test 2: User API key storage simulation
        self.print_header("USER STORAGE TESTS")
        storage_works = await self.test_user_api_key_storage()
        
        # Test 3: LLM calls with user API keys
        self.print_header("USER LLM CALLS TESTS")
        llm_calls_work = await self.test_user_llm_calls_with_simulated_keys()
        
        # Test 4: Multiple users
        self.print_header("MULTIPLE USERS TESTS")
        multi_user_works = await self.test_multiple_users_api_keys()
        
        # Test 5: API key retrieval methods
        self.print_header("KEY RETRIEVAL TESTS")
        retrieval_works = await self.test_api_key_retrieval_methods()
        
        # Test 6: Model capabilities per user
        self.print_header("MODEL CAPABILITIES TESTS")
        capabilities_work = await self.test_model_capabilities_per_user()
        
        # Summary
        self.print_header("USER API KEY TEST SUMMARY")
        
        results = {
            "encryption": encryption_works,
            "user_storage": storage_works,
            "user_llm_calls": llm_calls_work,
            "multiple_users": multi_user_works,
            "key_retrieval": retrieval_works,
            "model_capabilities": capabilities_work
        }
        
        passed_tests = sum(1 for result in results.values() if result)
        total_tests = len(results)
        success_rate = (passed_tests / total_tests) * 100
        
        print(f"📊 Test Results:")
        for test_name, passed in results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"   {test_name}: {status}")
        
        print(f"\n👥 Created {len(self.dummy_users)} dummy users for testing")
        for user in self.dummy_users:
            print(f"   - {user.username} ({user.email}) [ID: {str(user.id)[:8]}...]")
        
        print(f"\n🏆 OVERALL RESULTS:")
        print(f"   Tests Passed: {passed_tests}/{total_tests}")
        print(f"   Success Rate: {success_rate:.1f}%")
        
        # Show API key availability
        available_keys = sum(1 for key in self.test_api_keys.values() if key and len(key.strip()) > 0)
        print(f"   API Keys Available: {available_keys}/{len(self.test_api_keys)}")
        
        # Save detailed results
        import json
        results_file = "user_api_key_test_results.json"
        with open(results_file, 'w') as f:
            # Convert ObjectIds to strings for JSON serialization
            serializable_results = {}
            for key, value in self.test_results.items():
                if isinstance(value, dict):
                    serializable_results[key] = self._make_json_serializable(value)
                else:
                    serializable_results[key] = value
            
            json.dump({
                "summary": {
                    "tests_passed": passed_tests,
                    "total_tests": total_tests,
                    "success_rate": success_rate,
                    "dummy_users_created": len(self.dummy_users),
                    "api_keys_available": available_keys
                },
                "detailed_results": serializable_results
            }, f, indent=2)
        
        print(f"📁 Detailed results saved to {results_file}")
        
        return success_rate >= 80  # Consider 80%+ success as passing
    
    def _make_json_serializable(self, obj):
        """Convert ObjectIds and other non-serializable objects to strings"""
        if isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._make_json_serializable(item) for item in obj]
        elif isinstance(obj, PydanticObjectId):
            return str(obj)
        elif hasattr(obj, 'dict'):  # Pydantic models
            return obj.dict()
        else:
            return obj

async def main():
    """Main test runner"""
    tester = UserApiKeyTester()
    success = await tester.run_all_user_tests()
    
    if success:
        print("\n🎉 User API key management is working well!")
        exit(0)
    else:
        print("\n⚠️  Some user API key features need attention")
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())