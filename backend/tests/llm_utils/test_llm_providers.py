#!/usr/bin/env python3
"""
Comprehensive LLM Service Provider Test
Tests all providers (OpenAI, Anthropic, Gemini, Groq) using .env API keys
"""

import asyncio
import os
import json
from typing import Dict, List

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

# Test configurations for each provider
TEST_MODELS = {
    "openai": ["gpt-4o-mini", "gpt-4o"],
    "anthropic": ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
    "gemini": ["gemini-2.0-flash-exp", "gemini-1.5-flash"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
}

class LLMProviderTester:
    """Comprehensive LLM provider testing suite"""
    
    def __init__(self):
        self.results = {}
        self.test_message = "What is 2+2? Please answer concisely."
        
    def print_header(self, title: str):
        """Print formatted header"""
        print(f"\n{'='*60}")
        print(f"🧪 {title}")
        print(f"{'='*60}")
    
    def print_subheader(self, title: str):
        """Print formatted subheader"""
        print(f"\n🔍 {title}")
        print("-" * 40)
    
    async def test_provider_detection(self):
        """Test automatic provider detection"""
        self.print_header("Testing Automatic Provider Detection")
        
        test_cases = [
            ("gpt-4o-mini", "openai"),
            ("claude-3-5-sonnet-20241022", "anthropic"),
            ("gemini-2.0-flash-exp", "gemini"),
            ("llama-3.3-70b-versatile", "groq"),
            ("o1-mini", "openai"),
            ("claude-3-opus-20240229", "anthropic"),
            ("gemini-1.5-pro", "gemini"),
            ("llama-3.1-8b-instant", "groq")
        ]
        
        print(f"Testing {len(test_cases)} model-to-provider mappings...")
        all_passed = True
        
        for model, expected_provider in test_cases:
            detected_provider = llm_service.detect_provider_from_model(model)
            status = "✅" if detected_provider == expected_provider else "❌"
            print(f"{status} {model:<30} -> {detected_provider:<12} (expected: {expected_provider})")
            
            if detected_provider != expected_provider:
                all_passed = False
        
        print(f"\n🎯 Provider Detection Test: {'PASSED' if all_passed else 'FAILED'}")
        return all_passed
    
    async def test_api_key_availability(self):
        """Test API key availability from .env"""
        self.print_header("Testing API Key Availability")
        
        available_keys = {}
        for provider, key in llm_service.default_keys.items():
            has_key = key is not None and len(key.strip()) > 0
            status = "✅" if has_key else "❌"
            masked_key = f"{key[:10]}...{key[-4:]}" if has_key else "Not found"
            print(f"{status} {provider:<12}: {masked_key}")
            available_keys[provider] = has_key
        
        total_keys = sum(available_keys.values())
        print(f"\n🔑 Available API Keys: {total_keys}/{len(llm_service.default_keys)}")
        return available_keys
    
    async def test_model_configs(self):
        """Test model configuration access"""
        self.print_header("Testing Model Configuration Access")
        
        total_models = 0
        for provider, models in llm_service.model_configs.items():
            model_count = len(models)
            total_models += model_count
            print(f"📊 {provider:<12}: {model_count} models configured")
            
            # Test a few utility methods
            if models:
                first_model = list(models.keys())[0]
                max_tokens = llm_service.get_max_context_length(provider, first_model)
                supports_functions = llm_service.supports_function_calling(provider, first_model)
                print(f"   └─ {first_model}: {max_tokens:,} tokens, functions: {supports_functions}")
        
        print(f"\n📈 Total Models Configured: {total_models}")
        return total_models
    
    async def test_single_provider(self, provider: str, models: List[str], has_api_key: bool) -> Dict:
        """Test a single provider with its models"""
        self.print_subheader(f"Testing {provider.upper()} Provider")
        
        provider_results = {
            "provider": provider,
            "models_tested": [],
            "successes": 0,
            "errors": 0,
            "skipped": 0
        }
        
        if not has_api_key:
            print(f"⏭️  Skipping {provider} - No API key available")
            provider_results["skipped"] = len(models)
            return provider_results
        
        for model in models:
            print(f"🚀 Testing {model}...")
            
            try:
                # Test with auto-detection (no provider specified)
                response = await llm_service.generate(
                    messages=[{"role": "user", "content": self.test_message}],
                    model=model,
                    temperature=0.1,
                    max_tokens=50
                )
                
                if response.success:
                    content_preview = (response.content[:100] + "...") if len(response.content) > 100 else response.content
                    print(f"   ✅ Success: {content_preview}")
                    print(f"   📊 Usage: {response.usage}")
                    provider_results["successes"] += 1
                else:
                    print(f"   ❌ Failed: {response.error}")
                    provider_results["errors"] += 1
                
                provider_results["models_tested"].append({
                    "model": model,
                    "success": response.success,
                    "response_length": len(response.content) if response.content else 0,
                    "usage": response.usage,
                    "error": response.error
                })
                
                # Small delay to avoid rate limits
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"   💥 Exception: {str(e)}")
                provider_results["errors"] += 1
                provider_results["models_tested"].append({
                    "model": model,
                    "success": False,
                    "error": str(e)
                })
        
        success_rate = (provider_results["successes"] / len(models)) * 100 if models else 0
        print(f"📈 {provider.upper()} Results: {provider_results['successes']}/{len(models)} success ({success_rate:.1f}%)")
        
        return provider_results
    
    async def test_all_providers(self):
        """Test all available providers"""
        self.print_header("Testing All LLM Providers")
        
        # Get API key availability
        available_keys = await self.test_api_key_availability()
        
        # Test each provider
        all_results = []
        for provider, models in TEST_MODELS.items():
            has_key = available_keys.get(provider, False)
            result = await self.test_single_provider(provider, models, has_key)
            all_results.append(result)
        
        return all_results
    
    async def test_streaming(self):
        """Test streaming functionality"""
        self.print_header("Testing Streaming Functionality")
        
        # Find a provider with API key
        test_provider = None
        test_model = None
        
        for provider, key in llm_service.default_keys.items():
            if key and len(key.strip()) > 0:
                test_provider = provider
                test_model = TEST_MODELS[provider][0]  # Use first model
                break
        
        if not test_provider:
            print("⏭️  No API keys available for streaming test")
            return False
        
        print(f"🌊 Testing streaming with {test_provider}/{test_model}")
        
        try:
            stream = await llm_service.generate(
                messages=[{"role": "user", "content": "Count from 1 to 5, one number per line."}],
                model=test_model,
                stream=True,
                temperature=0.1,
                max_tokens=50
            )
            
            print("📡 Streaming response:")
            token_count = 0
            async for chunk in stream:
                if chunk.type == "token" and chunk.content:
                    print(chunk.content, end="", flush=True)
                    token_count += 1
                elif chunk.type == "complete":
                    print(f"\n✅ Streaming complete: {token_count} tokens received")
                    return True
                elif chunk.type == "error":
                    print(f"\n❌ Streaming error: {chunk.error}")
                    return False
            
        except Exception as e:
            print(f"💥 Streaming exception: {e}")
            return False
        
        return False
    
    async def run_comprehensive_test(self):
        """Run all tests"""
        print("🎯 Starting Comprehensive LLM Provider Test Suite")
        print("Environment: " + os.path.basename(os.getcwd()))
        
        # Test 1: Provider detection
        detection_passed = await self.test_provider_detection()
        
        # Test 2: Model configurations
        total_models = await self.test_model_configs()
        
        # Test 3: All providers
        provider_results = await self.test_all_providers()
        
        # Test 4: Streaming
        streaming_works = await self.test_streaming()
        
        # Summary
        self.print_header("TEST SUMMARY")
        print(f"🎯 Provider Detection: {'PASSED' if detection_passed else 'FAILED'}")
        print(f"📊 Model Configurations: {total_models} models")
        print(f"🌊 Streaming: {'WORKING' if streaming_works else 'FAILED'}")
        print()
        
        total_success = 0
        total_tested = 0
        total_errors = 0
        
        for result in provider_results:
            provider = result["provider"]
            successes = result["successes"]
            errors = result["errors"]
            skipped = result["skipped"]
            tested = successes + errors
            
            if tested > 0:
                success_rate = (successes / tested) * 100
                print(f"🔌 {provider.upper():<12}: {successes}/{tested} success ({success_rate:.1f}%)")
            elif skipped > 0:
                print(f"⏭️  {provider.upper():<12}: {skipped} models skipped (no API key)")
            
            total_success += successes
            total_tested += tested
            total_errors += errors
        
        overall_success_rate = (total_success / total_tested) * 100 if total_tested > 0 else 0
        
        print(f"\n🏆 OVERALL RESULTS:")
        print(f"   Total Tests: {total_tested}")
        print(f"   Successes: {total_success}")
        print(f"   Errors: {total_errors}")
        print(f"   Success Rate: {overall_success_rate:.1f}%")
        
        # Save detailed results
        results_file = "llm_test_results.json"
        with open(results_file, 'w') as f:
            json.dump({
                "summary": {
                    "detection_passed": detection_passed,
                    "total_models_configured": total_models,
                    "streaming_works": streaming_works,
                    "total_tested": total_tested,
                    "total_success": total_success,
                    "total_errors": total_errors,
                    "success_rate": overall_success_rate
                },
                "provider_results": provider_results
            }, f, indent=2)
        
        print(f"📁 Detailed results saved to {results_file}")
        
        return overall_success_rate > 0

async def main():
    """Main test runner"""
    tester = LLMProviderTester()
    success = await tester.run_comprehensive_test()
    
    if success:
        print("\n🎉 LLM Service is working correctly!")
        exit(0)
    else:
        print("\n⚠️  Some tests failed or no API keys available")
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())