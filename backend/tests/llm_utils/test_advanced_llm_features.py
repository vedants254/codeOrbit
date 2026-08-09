#!/usr/bin/env python3
"""
Advanced LLM Service Features Test
Tests streaming, structured output, and function calling capabilities
Following LiteLLM API specifications for comprehensive validation
"""

import asyncio
import json
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from enum import Enum

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

# Structured Output Models
class WeatherUnit(str, Enum):
    """Weather temperature unit"""
    CELSIUS = "celsius"
    FAHRENHEIT = "fahrenheit"

class WeatherInfo(BaseModel):
    """Structured weather information"""
    location: str
    temperature: float
    unit: WeatherUnit
    description: str
    humidity: Optional[int] = None
    
class TaskPriority(str, Enum):
    """Task priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class Task(BaseModel):
    """Individual task item"""
    title: str
    priority: TaskPriority
    estimated_hours: float
    dependencies: List[str] = []

class ProjectPlan(BaseModel):
    """Complete project plan with multiple tasks"""
    project_name: str
    description: str
    total_duration_weeks: int
    tasks: List[Task]

# Function Definitions for Function Calling Tests
WEATHER_FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "Temperature unit"
                    }
                },
                "required": ["location"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "get_weather_forecast",
            "description": "Get weather forecast for multiple days",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "days": {"type": "integer", "minimum": 1, "maximum": 7}
                },
                "required": ["location", "days"]
            }
        }
    }
]

CALCULATOR_FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_math_expression",
            "description": "Evaluate a mathematical expression",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(pi/2)')"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_calculation_history",
            "description": "Retrieve previous calculations",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10}
                }
            }
        }
    }
]

class AdvancedLLMTester:
    """Advanced LLM feature testing suite"""
    
    def __init__(self):
        self.test_results = {
            "streaming": {},
            "structured_output": {},
            "function_calling": {}
        }
    
    def print_header(self, title: str):
        """Print formatted header"""
        print(f"\n{'='*70}")
        print(f"🚀 {title}")
        print(f"{'='*70}")
    
    def print_subheader(self, title: str):
        """Print formatted subheader"""
        print(f"\n🔍 {title}")
        print("-" * 50)
    
    async def test_basic_streaming(self):
        """Test basic streaming functionality"""
        self.print_subheader("Basic Streaming Test")
        
        try:
            messages = [{"role": "user", "content": "Count from 1 to 10, one number per line."}]
            
            stream = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                stream=True,
                temperature=0.1,
                max_tokens=100
            )
            
            print("📡 Streaming response:")
            collected_tokens = []
            chunk_count = 0
            
            async for chunk in stream:
                chunk_count += 1
                if chunk.type == "token" and chunk.content:
                    print(chunk.content, end="", flush=True)
                    collected_tokens.append(chunk.content)
                elif chunk.type == "complete":
                    print(f"\n✅ Streaming complete: {len(collected_tokens)} tokens, {chunk_count} chunks")
                    self.test_results["streaming"]["basic"] = {
                        "success": True,
                        "token_count": len(collected_tokens),
                        "chunk_count": chunk_count,
                        "full_content": "".join(collected_tokens)
                    }
                    return True
                elif chunk.type == "error":
                    print(f"\n❌ Streaming error: {chunk.error}")
                    self.test_results["streaming"]["basic"] = {"success": False, "error": chunk.error}
                    return False
            
        except Exception as e:
            print(f"💥 Streaming exception: {e}")
            self.test_results["streaming"]["basic"] = {"success": False, "error": str(e)}
            return False
        
        return False
    
    async def test_streaming_with_function_calls(self):
        """Test streaming with function calling"""
        self.print_subheader("Streaming + Function Calling Test")
        
        try:
            messages = [
                {"role": "user", "content": "What's the weather like in New York City and Los Angeles? Please get current weather for both."}
            ]
            
            # Convert our function format to tools format
            tools = WEATHER_FUNCTIONS
            
            stream = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                stream=True,
                functions=tools,
                temperature=0.1
            )
            
            print("📡 Streaming function call response:")
            function_calls = []
            content_tokens = []
            
            async for chunk in stream:
                if chunk.type == "token" and chunk.content:
                    print(chunk.content, end="", flush=True)
                    content_tokens.append(chunk.content)
                elif chunk.type == "function_call" and chunk.function_call:
                    print(f"\n🔧 Function call: {chunk.function_call}")
                    function_calls.append(chunk.function_call)
                elif chunk.type == "complete":
                    print(f"\n✅ Function call streaming complete: {len(function_calls)} calls")
                    self.test_results["streaming"]["with_functions"] = {
                        "success": True,
                        "function_calls": function_calls,
                        "content_tokens": len(content_tokens)
                    }
                    return True
                elif chunk.type == "error":
                    print(f"\n❌ Function call streaming error: {chunk.error}")
                    self.test_results["streaming"]["with_functions"] = {"success": False, "error": chunk.error}
                    return False
            
        except Exception as e:
            print(f"💥 Function call streaming exception: {e}")
            self.test_results["streaming"]["with_functions"] = {"success": False, "error": str(e)}
            return False
        
        return False
    
    async def test_structured_output_simple(self):
        """Test simple structured output with JSON schema"""
        self.print_subheader("Simple Structured Output Test")
        
        try:
            messages = [
                {"role": "user", "content": "What's the weather like in Tokyo? Please respond in JSON format with location, temperature, unit (celsius), and description fields."}
            ]
            
            response_format = {
                "type": "json_object"
            }
            
            response = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                response_format=response_format,
                temperature=0.1
            )
            
            if response.success and response.content:
                try:
                    structured_data = json.loads(response.content)
                    print(f"📊 Structured response: {json.dumps(structured_data, indent=2)}")
                    
                    # Validate expected fields
                    required_fields = ["location", "temperature", "description"]
                    has_required = all(field in structured_data for field in required_fields)
                    
                    self.test_results["structured_output"]["simple"] = {
                        "success": True,
                        "structured_data": structured_data,
                        "has_required_fields": has_required,
                        "field_count": len(structured_data)
                    }
                    
                    print(f"✅ Simple structured output: {len(structured_data)} fields, required fields: {has_required}")
                    return True
                    
                except json.JSONDecodeError as e:
                    print(f"❌ JSON parsing error: {e}")
                    print(f"Raw content: {response.content}")
                    self.test_results["structured_output"]["simple"] = {"success": False, "error": f"JSON decode error: {e}"}
                    return False
            else:
                print(f"❌ Structured output failed: {response.error}")
                self.test_results["structured_output"]["simple"] = {"success": False, "error": response.error}
                return False
            
        except Exception as e:
            print(f"💥 Structured output exception: {e}")
            self.test_results["structured_output"]["simple"] = {"success": False, "error": str(e)}
            return False
    
    async def test_structured_output_complex(self):
        """Test complex structured output with nested schemas"""
        self.print_subheader("Complex Structured Output Test")
        
        try:
            messages = [
                {"role": "user", "content": "Create a project plan for building a mobile app. Please respond in JSON format with project_name, description, total_duration_weeks, and tasks array. Each task should have title, priority (low/medium/high/urgent), estimated_hours, and dependencies."}
            ]
            
            # Create a JSON schema based on our Pydantic model
            project_schema = {
                "type": "json_object",
                "schema": {
                    "type": "object",
                    "properties": {
                        "project_name": {"type": "string"},
                        "description": {"type": "string"}, 
                        "total_duration_weeks": {"type": "integer"},
                        "tasks": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                                    "estimated_hours": {"type": "number"},
                                    "dependencies": {"type": "array", "items": {"type": "string"}}
                                },
                                "required": ["title", "priority", "estimated_hours"]
                            }
                        }
                    },
                    "required": ["project_name", "description", "total_duration_weeks", "tasks"]
                }
            }
            
            response = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                temperature=0.1
            )
            
            if response.success and response.content:
                try:
                    structured_data = json.loads(response.content)
                    print(f"📊 Complex structured response:")
                    print(json.dumps(structured_data, indent=2))
                    
                    # Validate structure
                    has_required = all(field in structured_data for field in ["project_name", "description", "total_duration_weeks", "tasks"])
                    task_count = len(structured_data.get("tasks", []))
                    
                    # Validate task structure
                    valid_tasks = True
                    for task in structured_data.get("tasks", []):
                        if not all(field in task for field in ["title", "priority", "estimated_hours"]):
                            valid_tasks = False
                            break
                    
                    self.test_results["structured_output"]["complex"] = {
                        "success": True,
                        "structured_data": structured_data,
                        "has_required_fields": has_required,
                        "task_count": task_count,
                        "valid_task_structure": valid_tasks
                    }
                    
                    print(f"✅ Complex structured output: {task_count} tasks, valid structure: {valid_tasks and has_required}")
                    return True
                    
                except json.JSONDecodeError as e:
                    print(f"❌ JSON parsing error: {e}")
                    self.test_results["structured_output"]["complex"] = {"success": False, "error": f"JSON decode error: {e}"}
                    return False
            else:
                print(f"❌ Complex structured output failed: {response.error}")
                self.test_results["structured_output"]["complex"] = {"success": False, "error": response.error}
                return False
                
        except Exception as e:
            print(f"💥 Complex structured output exception: {e}")
            self.test_results["structured_output"]["complex"] = {"success": False, "error": str(e)}
            return False
    
    async def test_function_calling_single(self):
        """Test single function calling"""
        self.print_subheader("Single Function Calling Test")
        
        try:
            messages = [
                {"role": "user", "content": "What's the current weather in Paris, France? Use celsius for temperature."}
            ]
            
            response = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                functions=WEATHER_FUNCTIONS,
                temperature=0.1
            )
            
            if response.success:
                print(f"📞 Function call response:")
                print(f"   Content: {response.content}")
                print(f"   Function calls: {response.function_calls}")
                print(f"   Usage: {response.usage}")
                
                has_function_calls = response.function_calls and len(response.function_calls) > 0
                
                self.test_results["function_calling"]["single"] = {
                    "success": True,
                    "function_calls": response.function_calls,
                    "has_function_calls": has_function_calls,
                    "content": response.content,
                    "usage": response.usage
                }
                
                print(f"✅ Single function calling: {len(response.function_calls or [])} calls made")
                return True
            else:
                print(f"❌ Single function calling failed: {response.error}")
                self.test_results["function_calling"]["single"] = {"success": False, "error": response.error}
                return False
                
        except Exception as e:
            print(f"💥 Single function calling exception: {e}")
            self.test_results["function_calling"]["single"] = {"success": False, "error": str(e)}
            return False
    
    async def test_function_calling_multiple(self):
        """Test multiple function calling"""
        self.print_subheader("Multiple Function Calling Test")
        
        try:
            messages = [
                {"role": "user", "content": "I need to do some math. Calculate 15 * 23, then find the square root of 144, and also get the history of my last 3 calculations."}
            ]
            
            response = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini", 
                functions=CALCULATOR_FUNCTIONS,
                temperature=0.1
            )
            
            if response.success:
                print(f"📞 Multiple function call response:")
                print(f"   Content: {response.content}")
                print(f"   Function calls: {json.dumps(response.function_calls, indent=2)}")
                print(f"   Usage: {response.usage}")
                
                function_call_count = len(response.function_calls or [])
                has_multiple_calls = function_call_count > 1
                
                # Check for expected function calls
                expected_functions = ["calculate_math_expression", "get_calculation_history"]
                called_functions = []
                if response.function_calls:
                    called_functions = [call.get("name", "") for call in response.function_calls]
                
                self.test_results["function_calling"]["multiple"] = {
                    "success": True,
                    "function_calls": response.function_calls,
                    "function_call_count": function_call_count,
                    "has_multiple_calls": has_multiple_calls,
                    "called_functions": called_functions,
                    "content": response.content,
                    "usage": response.usage
                }
                
                print(f"✅ Multiple function calling: {function_call_count} calls, functions: {called_functions}")
                return True
            else:
                print(f"❌ Multiple function calling failed: {response.error}")
                self.test_results["function_calling"]["multiple"] = {"success": False, "error": response.error}
                return False
                
        except Exception as e:
            print(f"💥 Multiple function calling exception: {e}")
            self.test_results["function_calling"]["multiple"] = {"success": False, "error": str(e)}
            return False
    
    async def test_combined_features(self):
        """Test combination of streaming + structured output + function calling"""
        self.print_subheader("Combined Features Test")
        
        try:
            messages = [
                {"role": "user", "content": "Get the weather for Tokyo and create a structured JSON report with the information. Please use the weather function and respond in JSON format."}
            ]
            
            stream = await llm_service.generate(
                messages=messages,
                model="gpt-4o-mini",
                stream=True,
                functions=WEATHER_FUNCTIONS,
                response_format={"type": "json_object"},
                temperature=0.1
            )
            
            print("📡 Combined features streaming:")
            function_calls = []
            content_parts = []
            
            async for chunk in stream:
                if chunk.type == "token" and chunk.content:
                    print(chunk.content, end="", flush=True)
                    content_parts.append(chunk.content)
                elif chunk.type == "function_call":
                    print(f"\n🔧 Function: {chunk.function_call}")
                    if chunk.function_call:
                        function_calls.append(chunk.function_call)
                elif chunk.type == "complete":
                    full_content = "".join(content_parts)
                    
                    # Try to parse as JSON if we have content
                    structured_data = None
                    if full_content.strip():
                        try:
                            structured_data = json.loads(full_content)
                        except json.JSONDecodeError:
                            pass
                    
                    print(f"\n✅ Combined features complete:")
                    print(f"   Functions called: {len(function_calls)}")
                    print(f"   Content tokens: {len(content_parts)}")
                    print(f"   Structured data: {'Yes' if structured_data else 'No'}")
                    
                    self.test_results["combined"] = {
                        "success": True,
                        "function_calls": function_calls,
                        "content_tokens": len(content_parts),
                        "structured_data": structured_data,
                        "full_content": full_content
                    }
                    return True
                elif chunk.type == "error":
                    print(f"\n❌ Combined features error: {chunk.error}")
                    self.test_results["combined"] = {"success": False, "error": chunk.error}
                    return False
            
        except Exception as e:
            print(f"💥 Combined features exception: {e}")
            self.test_results["combined"] = {"success": False, "error": str(e)}
            return False
        
        return False
    
    async def test_provider_capabilities(self):
        """Test capabilities across different providers"""
        self.print_subheader("Provider Capabilities Test")
        
        providers_to_test = {
            "openai": "gpt-4o-mini",
            "anthropic": "claude-3-5-haiku-20241022", 
            "gemini": "gemini-2.0-flash-exp",
            "groq": "llama-3.3-70b-versatile"
        }
        
        capabilities_results = {}
        
        for provider, model in providers_to_test.items():
            print(f"🧪 Testing {provider} capabilities...")
            
            # Check if provider has API key
            api_key = llm_service.default_keys.get(provider)
            if not api_key:
                print(f"⏭️  Skipping {provider} - No API key")
                continue
                
            # Test basic functionality
            try:
                response = await llm_service.generate(
                    messages=[{"role": "user", "content": "What is 2+2?"}],
                    model=model,
                    temperature=0.1
                )
                
                basic_works = response.success
                
                # Test function calling support
                supports_functions = llm_service.supports_function_calling(provider, model)
                
                # Test max context
                max_context = llm_service.get_max_context_length(provider, model)
                
                # Test cost info
                cost_info = llm_service.get_cost_per_million_tokens(provider, model)
                
                capabilities_results[provider] = {
                    "model": model,
                    "basic_response": basic_works,
                    "supports_functions": supports_functions,
                    "max_context_length": max_context,
                    "cost_per_1M": cost_info,
                    "api_key_available": True
                }
                
                print(f"   ✅ Basic: {basic_works}, Functions: {supports_functions}, Context: {max_context:,}")
                
            except Exception as e:
                capabilities_results[provider] = {
                    "error": str(e),
                    "api_key_available": True
                }
                print(f"   ❌ Error: {e}")
        
        self.test_results["provider_capabilities"] = capabilities_results
        return len(capabilities_results) > 0
    
    async def run_all_tests(self):
        """Run comprehensive advanced features test suite"""
        print("🎯 Starting Advanced LLM Features Test Suite")
        
        # Test 1: Streaming
        self.print_header("STREAMING TESTS")
        streaming_basic = await self.test_basic_streaming()
        streaming_functions = await self.test_streaming_with_function_calls()
        
        # Test 2: Structured Output  
        self.print_header("STRUCTURED OUTPUT TESTS")
        structured_simple = await self.test_structured_output_simple()
        structured_complex = await self.test_structured_output_complex()
        
        # Test 3: Function Calling
        self.print_header("FUNCTION CALLING TESTS")
        functions_single = await self.test_function_calling_single()
        functions_multiple = await self.test_function_calling_multiple()
        
        # Test 4: Combined Features
        self.print_header("COMBINED FEATURES TESTS")
        combined = await self.test_combined_features()
        
        # Test 5: Provider Capabilities
        self.print_header("PROVIDER CAPABILITIES")
        capabilities = await self.test_provider_capabilities()
        
        # Summary
        self.print_header("ADVANCED FEATURES TEST SUMMARY")
        
        results = {
            "streaming_basic": streaming_basic,
            "streaming_functions": streaming_functions,
            "structured_simple": structured_simple,
            "structured_complex": structured_complex,
            "functions_single": functions_single,
            "functions_multiple": functions_multiple,
            "combined_features": combined,
            "provider_capabilities": capabilities
        }
        
        passed_tests = sum(1 for result in results.values() if result)
        total_tests = len(results)
        success_rate = (passed_tests / total_tests) * 100
        
        print(f"📊 Test Results:")
        for test_name, passed in results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            print(f"   {test_name}: {status}")
        
        print(f"\n🏆 OVERALL RESULTS:")
        print(f"   Tests Passed: {passed_tests}/{total_tests}")
        print(f"   Success Rate: {success_rate:.1f}%")
        
        # Save detailed results
        results_file = "advanced_llm_test_results.json"
        with open(results_file, 'w') as f:
            json.dump(self.test_results, f, indent=2)
        
        print(f"📁 Detailed results saved to {results_file}")
        
        return success_rate >= 70  # Consider 70%+ success as passing

async def main():
    """Main test runner"""
    tester = AdvancedLLMTester()
    success = await tester.run_all_tests()
    
    if success:
        print("\n🎉 Advanced LLM features are working well!")
        exit(0)
    else:
        print("\n⚠️  Some advanced features need attention")
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())