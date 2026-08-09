"""
Minimal LangChain LLM Service
Simple API key management + easy LLM access using native LangChain chat models
Designed for "bring your own key" usage pattern
"""

from typing import Optional, Dict, List

# LangChain chat models
try:
    from langchain_openai import ChatOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from langchain_anthropic import ChatAnthropic
    import os
    # Ensure environment variable is available for Anthropic
    if not os.getenv("ANTHROPIC_API_KEY") and not os.getenv("ANTHROPIC_API_URL"):
        print("💡 Anthropic: Set ANTHROPIC_API_KEY environment variable to enable")
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    print("⚠️ langchain-anthropic not available - install with: pip install langchain-anthropic")

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

try:
    from langchain_groq import ChatGroq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

# Import existing API key management and model configs
from utils.llm_utils import llm_service as legacy_service


class SimpleLangChainService:
    """Minimal LangChain service with API key management"""
    
    def __init__(self):
        # Inherit API key management from existing service
        self.encrypt_api_key = legacy_service.encrypt_api_key
        self.decrypt_api_key = legacy_service.decrypt_api_key
        self.save_user_api_key = legacy_service.save_user_api_key
        self.get_user_api_key = legacy_service.get_user_api_key
        self.verify_api_key = legacy_service.verify_api_key
        
        # Inherit model configs
        self.model_configs = legacy_service.model_configs
        self.get_model_config = legacy_service.get_model_config
        self.detect_provider_from_model = legacy_service.detect_provider_from_model
        self.supports_function_calling = legacy_service.supports_function_calling
        self.supports_vision = legacy_service.supports_vision
        self.get_cost_per_million_tokens = legacy_service.get_cost_per_million_tokens
        
        # Local API keys (check environment)
        self.local_api_keys = self._load_local_api_keys()
        
        # Provider availability
        self.providers = {
            "openai": {"available": OPENAI_AVAILABLE, "class": ChatOpenAI if OPENAI_AVAILABLE else None},
            "anthropic": {"available": ANTHROPIC_AVAILABLE, "class": ChatAnthropic if ANTHROPIC_AVAILABLE else None},
            "gemini": {"available": GOOGLE_AVAILABLE, "class": ChatGoogleGenerativeAI if GOOGLE_AVAILABLE else None},
            "groq": {"available": GROQ_AVAILABLE, "class": ChatGroq if GROQ_AVAILABLE else None}
        }
    
    def _load_local_api_keys(self) -> Dict[str, Optional[str]]:
        """Load API keys from environment variables"""
        import os
        return {
            "openai": os.getenv("OPENAI_API_KEY"),
            "anthropic": os.getenv("ANTHROPIC_API_KEY"),
            "gemini": os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            "groq": os.getenv("GROQ_API_KEY")
        }
    
    async def get_api_key_with_fallback(self, provider: str, user=None, use_user_key: bool = True) -> str:
        """
        Get API key with proper fallback chain:
        1. User's stored key (if use_user_key=True and user provided)
        2. Local environment variable
        3. System default key
        
        Args:
            provider: Provider name
            user: User object (optional)
            use_user_key: Whether to try user's key first
            
        Returns:
            API key string
            
        Raises:
            ValueError: If no API key is found
        """
        # Step 1: Try user's stored key first (if requested and user provided)
        if use_user_key and user:
            try:
                user_key = await self.get_user_api_key(user, provider)
                if user_key:
                    return user_key
            except Exception:
                pass  # Continue to next fallback
        
        # Step 2: Try local environment variable
        local_key = self.local_api_keys.get(provider)
        if local_key:
            return local_key
        
        # Step 3: Try system default key
        try:
            return await legacy_service.get_api_key(provider, user, use_user_key=False)
        except Exception:
            pass
        
        # No key found
        available_keys = []
        if self.local_api_keys.get(provider):
            available_keys.append("local environment")
        if use_user_key and user:
            available_keys.append("user stored")
        
        if available_keys:
            raise ValueError(f"API key for {provider} found in {', '.join(available_keys)} but validation failed")
        else:
            raise ValueError(f"No API key found for {provider}. Please set {provider.upper()}_API_KEY environment variable or add a user key.")
    
    def is_reasoning_model(self, provider: str, model: str) -> bool:
        """Check if model is a reasoning model that doesn't support temperature"""
        if provider == "openai":
            reasoning_models = ["o1-mini", "o1-preview", "o3-mini", "o3", "o4-mini", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-chat"]
            return any(reasoning_model in model.lower() for reasoning_model in reasoning_models)
        elif provider == "anthropic":
            # Claude 4 series and 3.7 Sonnet with thinking capabilities
            thinking_models = ["claude-4", "claude-opus-4", "claude-sonnet-4", "claude-3.7-sonnet", "claude-opus-4.1"]
            return any(thinking_model in model.lower() for thinking_model in thinking_models)
        elif provider == "gemini":
            # Gemini 2.5 series thinking models
            thinking_models = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-deep-think", "gemini-2.5-flash-lite"]
            return any(thinking_model in model.lower() for thinking_model in thinking_models)
        return False
    
    async def get_chat_model(
        self, 
        model: str, 
        user=None, 
        use_user_key: bool = True,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        enable_reasoning_traces: bool = False,
        **kwargs
    ):
        """
        Get a LangChain chat model instance - this is the main method you'll use
        
        Args:
            model: Model name (e.g., "gpt-4o-mini", "claude-3-5-haiku-20241022")
            user: User object for API key lookup
            use_user_key: Whether to use user's API key (default: True for BYOK)
            temperature: Model temperature (ignored for reasoning models)
            max_tokens: Maximum tokens (uses max_completion_tokens for reasoning models)
            enable_reasoning_traces: Enable reasoning traces for o1/o3 models
            **kwargs: Additional model parameters
            
        Returns:
            LangChain chat model instance ready to use
            
        Example:
            chat_model = await service.get_chat_model("gpt-4o-mini", user=current_user)
            response = await chat_model.ainvoke([HumanMessage(content="Hello!")])
        """
        # Detect provider
        provider = self.detect_provider_from_model(model)
        
        # Check if provider is available
        if not self.providers[provider]["available"]:
            available_providers = [p for p, info in self.providers.items() if info["available"]]
            raise ValueError(f"Provider {provider} not available. Install: pip install langchain-{provider}. Available providers: {available_providers}")
        
        # Get API key with fallback
        api_key = await self.get_api_key_with_fallback(provider, user, use_user_key)
        
        # Get chat model class
        chat_model_class = self.providers[provider]["class"]
        
        # Prepare parameters
        params = {"model": model}
        
        # Handle reasoning models (don't support temperature)
        is_reasoning = self.is_reasoning_model(provider, model)
        if not is_reasoning:
            params["temperature"] = temperature
        
        # Handle token limits
        if max_tokens:
            if is_reasoning and provider == "openai":
                params["max_completion_tokens"] = max_tokens
            else:
                params["max_tokens"] = max_tokens
        
        # Add any other kwargs
        params.update(kwargs)
        
        # Provider-specific API key parameter names and special handling
        if provider == "openai":
            params["api_key"] = api_key
            
            # Enable reasoning traces for o1/o3 models
            if is_reasoning and enable_reasoning_traces:
                # Use Responses API for reasoning traces
                params["use_responses_api"] = True
                # Add reasoning configuration
                params["reasoning"] = {
                    "effort": "medium",  # low, medium, high
                    "summary": "auto"    # auto, concise, detailed
                }
            
        elif provider == "anthropic":
            params["anthropic_api_key"] = api_key
        elif provider == "gemini":
            params["google_api_key"] = api_key
        elif provider == "groq":
            params["groq_api_key"] = api_key
        
        return chat_model_class(**params)
    
    def convert_system_message_for_reasoning_models(self, messages: List[Dict[str, str]], provider: str, model: str) -> List[Dict[str, str]]:
        """
        Convert system messages to developer role for o1/o3 models
        This fixes the 'developer role not supported' error
        """
        if not self.is_reasoning_model(provider, model):
            return messages
        
        converted_messages = []
        for message in messages:
            if message.get("role") == "system" and provider == "openai":
                # Convert system to developer role for o1/o3 models
                converted_messages.append({
                    "role": "developer", 
                    "content": message["content"]
                })
            else:
                converted_messages.append(message)
        
        return converted_messages
    
    def get_available_providers(self) -> List[str]:
        """Get list of available providers"""
        return [name for name, info in self.providers.items() if info["available"]]
    
    def get_provider_status(self) -> Dict[str, Dict[str, any]]:
        """Get detailed provider status for debugging"""
        status = {}
        for provider, info in self.providers.items():
            local_key = self.local_api_keys.get(provider)
            status[provider] = {
                "package_available": info["available"],
                "local_api_key": bool(local_key),
                "local_key_preview": f"{local_key[:10]}..." if local_key else None
            }
        return status
    
    def get_available_models(self, provider: Optional[str] = None) -> Dict[str, List[str]]:
        """Get available models, optionally filtered by provider"""
        if provider:
            return {provider: list(self.model_configs.get(provider, {}).keys())}
        else:
            return {
                prov: list(models.keys()) 
                for prov, models in self.model_configs.items()
                if self.providers.get(prov, {}).get("available", False)
            }
    
    def count_tokens_approximately(self, content, chars_per_token: float = 4.0) -> int:
        """
        Count tokens in content using LangChain's approximate token counting
        
        Args:
            content: Content to count (can be string, BaseMessage, or list of messages)
            chars_per_token: Characters per token approximation (default: 4.0)
            
        Returns:
            Approximate number of tokens
        """
        try:
            from langchain_core.messages.utils import count_tokens_approximately
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
            
            # Handle different input types
            if isinstance(content, str):
                # For plain text, create a single message
                message = HumanMessage(content=content)
                return count_tokens_approximately([message], chars_per_token=chars_per_token)
            elif isinstance(content, (list, tuple)):
                # For list of messages or dict-like messages
                messages = []
                for item in content:
                    if isinstance(item, dict):
                        role = item.get("role", "user")
                        content_text = item.get("content", "")
                        if role == "system":
                            messages.append(SystemMessage(content=content_text))
                        elif role == "assistant":
                            messages.append(AIMessage(content=content_text))
                        else:
                            messages.append(HumanMessage(content=content_text))
                    else:
                        # Assume it's already a BaseMessage
                        messages.append(item)
                return count_tokens_approximately(messages, chars_per_token=chars_per_token)
            else:
                # Assume it's already a BaseMessage or compatible
                return count_tokens_approximately([content], chars_per_token=chars_per_token)
                
        except ImportError:
            # Fallback to simple estimation if LangChain utils not available
            if isinstance(content, str):
                return len(content) // int(chars_per_token) + 3  # Add message overhead
            elif isinstance(content, (list, tuple)):
                total_chars = sum(len(str(item)) for item in content)
                return total_chars // int(chars_per_token) + len(content) * 3  # Add overhead per message
            else:
                return len(str(content)) // int(chars_per_token) + 3
    
    def get_max_context_tokens(self, model: str, provider: Optional[str] = None) -> int:
        """
        Get maximum context tokens for a model from model config
        
        Args:
            model: Model name
            provider: Optional provider (auto-detected if not provided)
            
        Returns:
            Maximum context tokens for the model
        """
        if not provider:
            provider = self.detect_provider_from_model(model)
        
        config = self.get_model_config(provider, model)
        return config.max_tokens if config else 128000  # Default fallback
    
    def get_max_output_tokens_for_model(self, model: str, provider: Optional[str] = None) -> int:
        """
        Get maximum output tokens for a model from model config
        
        Args:
            model: Model name
            provider: Optional provider (auto-detected if not provided)
            
        Returns:
            Maximum output tokens for the model
        """
        if not provider:
            provider = self.detect_provider_from_model(model)
        
        config = self.get_model_config(provider, model)
        return config.max_output_tokens if config else 16384  # Default fallback
    
    def calculate_available_context_tokens(self, messages, model: str = "gpt-4o-mini", 
                                         max_output_tokens: Optional[int] = None) -> int:
        """
        Calculate remaining context tokens available for additional content
        
        Args:
            messages: Current messages in conversation
            model: Model name
            max_output_tokens: Reserved tokens for output (uses model default if not specified)
            
        Returns:
            Available tokens for additional context
        """
        # Get model limits
        max_context = self.get_max_context_tokens(model)
        if max_output_tokens is None:
            max_output_tokens = self.get_max_output_tokens_for_model(model)
        
        # Count current message tokens
        used_tokens = self.count_tokens_approximately(messages)
        
        # Calculate available tokens (context - used - reserved for output)
        available = max_context - used_tokens - max_output_tokens
        
        return max(0, available)  # Ensure non-negative
    
    def trim_content_to_fit(self, content, max_tokens: int) -> str:
        """
        Trim text content to fit within token limit
        
        Args:
            content: String content to trim
            max_tokens: Maximum tokens allowed
            
        Returns:
            Trimmed content that fits within the token limit
        """
        # Get current token count
        current_tokens = self.count_tokens_approximately(content)
        
        if current_tokens <= max_tokens:
            return content
        
        # Calculate approximate ratio to trim
        trim_ratio = max_tokens / current_tokens
        
        # Use a slightly smaller ratio to be safe
        safe_ratio = trim_ratio * 0.9
        target_chars = int(len(content) * safe_ratio)
        
        # Try to find a natural break point
        trimmed = content[:target_chars]
        
        # Look for natural break points (paragraph, sentence, line endings)
        for break_char in ['\n\n', '. ', '\n', ' ']:
            last_break = trimmed.rfind(break_char)
            if last_break > target_chars * 0.8:  # Don't trim too aggressively
                trimmed = content[:last_break + len(break_char)]
                break
        
        # Verify the result fits
        final_tokens = self.count_tokens_approximately(trimmed)
        if final_tokens <= max_tokens:
            return trimmed + "\n\n... (content truncated due to token limit)"
        else:
            # If still too long, do a more aggressive trim
            chars_per_token = len(trimmed) / final_tokens
            safe_chars = int(max_tokens * chars_per_token * 0.8)
            return content[:safe_chars] + "\n\n... (content truncated due to token limit)"
    
    def trim_messages_to_fit(self, messages, max_tokens: int):
        """
        Trim messages to fit within token limit
        
        Args:
            messages: List of messages or string content to trim
            max_tokens: Maximum tokens allowed
            
        Returns:
            Trimmed messages that fit within the token limit
        """
        # If it's a string, use content trimming
        if isinstance(messages, str):
            return self.trim_content_to_fit(messages, max_tokens)
        
        try:
            from langchain_core.messages.utils import trim_messages
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
            
            # Convert dict messages to LangChain messages if needed
            langchain_messages = []
            for msg in messages:
                if isinstance(msg, dict):
                    role = msg.get("role", "user")
                    content_text = msg.get("content", "")
                    if role == "system":
                        langchain_messages.append(SystemMessage(content=content_text))
                    elif role == "assistant":
                        langchain_messages.append(AIMessage(content=content_text))
                    else:
                        langchain_messages.append(HumanMessage(content=content_text))
                else:
                    langchain_messages.append(msg)
            
            # Create a token counter function for the trim utility
            def token_counter(msgs):
                return self.count_tokens_approximately(msgs)
            
            trimmed = trim_messages(
                messages=langchain_messages,
                max_tokens=max_tokens,
                token_counter=token_counter,
                strategy="last"  # Keep most recent messages
            )
            
            # Convert back to dict format for consistency
            result = []
            for msg in trimmed:
                if hasattr(msg, 'content'):
                    if hasattr(msg, 'role'):
                        result.append({"role": msg.role, "content": msg.content})
                    else:
                        # Determine role from message type
                        msg_type = type(msg).__name__
                        if 'System' in msg_type:
                            role = 'system'
                        elif 'AI' in msg_type or 'Assistant' in msg_type:
                            role = 'assistant'
                        else:
                            role = 'user'
                        result.append({"role": role, "content": msg.content})
            
            return result
            
        except ImportError:
            # Fallback: simple truncation from the end
            trimmed = []
            current_tokens = 0
            
            for message in reversed(messages):
                msg_tokens = self.count_tokens_approximately(message)
                if current_tokens + msg_tokens <= max_tokens:
                    trimmed.insert(0, message)
                    current_tokens += msg_tokens
                else:
                    break
            
            return trimmed
    
    async def simple_chat(
        self, 
        message: str, 
        model: str = "gpt-4o-mini", 
        user=None,
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Simple chat method for quick usage
        
        Args:
            message: User message
            model: Model to use
            user: User object
            system_prompt: Optional system prompt
            **kwargs: Additional model parameters
            
        Returns:
            Response content as string
        """
        from langchain_core.messages import HumanMessage, SystemMessage
        
        chat_model = await self.get_chat_model(model, user=user, **kwargs)
        
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=message))
        
        response = await chat_model.ainvoke(messages)
        return response.content


# Global instance
langchain_service = SimpleLangChainService()