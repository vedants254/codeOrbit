#!/usr/bin/env python3
"""
LLM Service Usage Examples
Simple examples showing how to use the minimal LLM service wrapper
"""

import asyncio
import json

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Loaded .env file")
except ImportError:
    print("⚠️  python-dotenv not available")

from utils.llm_utils import llm_service

async def basic_examples():
    """Basic usage examples"""
    print("\n🚀 Basic LLM Service Examples")
    print("="*50)
    
    # Example 1: Simple chat (auto-detects provider from model)
    print("\n1. Simple Chat:")
    response = await llm_service.chat("What is the capital of Japan?", model="gpt-4o-mini")
    print(f"   Answer: {response.content}")
    
    # Example 2: With different providers (auto-detected)
    print("\n2. Different Providers:")
    models_to_test = [
        "gpt-4o-mini",                    # OpenAI
        "claude-3-5-haiku-20241022",      # Anthropic  
        "gemini-2.0-flash-exp",           # Gemini
        "llama-3.3-70b-versatile"         # Groq
    ]
    
    for model in models_to_test:
        try:
            response = await llm_service.chat("What is 2+2?", model=model)
            provider = llm_service.detect_provider_from_model(model)
            print(f"   {provider}: {response.content}")
        except Exception as e:
            print(f"   {model}: Error - {str(e)[:50]}...")

async def streaming_example():
    """Streaming response example"""
    print("\n\n🌊 Streaming Example")
    print("="*50)
    
    print("Question: Tell me a short story about a robot")
    print("Streaming response:")
    
    stream = await llm_service.generate(
        messages=[{"role": "user", "content": "Tell me a very short story about a friendly robot"}],
        model="gpt-4o-mini",
        stream=True,
        max_tokens=200
    )
    
    async for chunk in stream:
        if chunk.type == "token" and chunk.content:
            print(chunk.content, end="", flush=True)
        elif chunk.type == "complete":
            print(f"\n   [Streamed {len(chunk.content)} characters total]")

async def structured_output_example():
    """Structured output example"""
    print("\n\n📊 Structured Output Example")
    print("="*50)
    
    response = await llm_service.generate(
        messages=[{
            "role": "user", 
            "content": "Create a simple recipe for chocolate chip cookies. Respond in JSON format with name, prep_time_minutes, ingredients (array), and instructions (array)."
        }],
        model="gpt-4o-mini",
        response_format={"type": "json_object"}
    )
    
    if response.success and response.content:
        try:
            recipe = json.loads(response.content)
            print("Generated Recipe:")
            print(json.dumps(recipe, indent=2))
        except json.JSONDecodeError:
            print("   Could not parse JSON response")

async def function_calling_example():
    """Function calling example"""
    print("\n\n📞 Function Calling Example")
    print("="*50)
    
    # Define some functions
    functions = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get current weather for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "City and country"},
                        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "calculate",
                "description": "Perform a calculation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expression": {"type": "string", "description": "Math expression"}
                    },
                    "required": ["expression"]
                }
            }
        }
    ]
    
    response = await llm_service.generate(
        messages=[{
            "role": "user",
            "content": "What's the weather in London and also calculate 15 * 23 for me?"
        }],
        model="gpt-4o-mini",
        functions=functions
    )
    
    print("Function calls made:")
    if response.function_calls:
        for call in response.function_calls:
            print(f"   {call['name']}: {call['arguments']}")
    else:
        print("   No function calls made")

async def model_information_example():
    """Model information and capabilities example"""
    print("\n\n🔍 Model Information Example")
    print("="*50)
    
    # Show available models
    models = llm_service.get_available_models()
    print("Available models by provider:")
    for provider, model_list in models.items():
        print(f"   {provider}: {len(model_list)} models")
    
    # Show model capabilities
    test_model = "gpt-4o-mini"
    provider = llm_service.detect_provider_from_model(test_model)
    
    print(f"\n{test_model} capabilities:")
    print(f"   Provider: {provider}")
    print(f"   Max context: {llm_service.get_max_context_length(provider, test_model):,} tokens")
    print(f"   Max output: {llm_service.get_max_output_tokens(provider, test_model):,} tokens")
    print(f"   Function calling: {llm_service.supports_function_calling(provider, test_model)}")
    print(f"   Vision support: {llm_service.supports_vision(provider, test_model)}")
    print(f"   Reasoning model: {llm_service.is_reasoning_model(provider, test_model)}")
    
    cost_info = llm_service.get_cost_per_million_tokens(provider, test_model)
    print(f"   Cost per 1M tokens: ${cost_info['input']:.2f} input, ${cost_info['output']:.2f} output")

async def main():
    """Run all examples"""
    print("🎯 LLM Service Usage Examples")
    
    try:
        await basic_examples()
        await streaming_example()
        await structured_output_example()
        await function_calling_example()
        await model_information_example()
        
        print("\n\n✅ All examples completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error running examples: {e}")

if __name__ == "__main__":
    asyncio.run(main())