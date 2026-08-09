"""
Standalone API key verification module that doesn't depend on LiteLLM
"""
import httpx
from typing import List


class APIKeyVerifier:
    """Standalone API key verifier using direct HTTP requests"""

    def verify_api_key(self, provider: str, api_key: str) -> bool:
        """Verify if an API key is valid for a specific provider using direct API calls."""
        try:
            if provider == "openai":
                return self._verify_openai_key(api_key)
            elif provider == "anthropic":
                return self._verify_anthropic_key(api_key)
            elif provider == "gemini":
                return self._verify_gemini_key(api_key)
            elif provider == "groq":
                return self._verify_groq_key(api_key)
            else:
                print(f"Unsupported provider for verification: {provider}")
                return False
                
        except Exception as e:
            print(f"Error verifying API key for {provider}: {e}")
            return False

    def _verify_openai_key(self, api_key: str) -> bool:
        """Verify OpenAI API key by making a simple request."""
        try:
            with httpx.Client() as client:
                response = client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"OpenAI key verification failed: {e}")
            return False

    def _verify_anthropic_key(self, api_key: str) -> bool:
        """Verify Anthropic API key by making a simple request."""
        try:
            with httpx.Client() as client:
                # Anthropic doesn't have a models endpoint, so we make a minimal completion request
                response = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "content-type": "application/json",
                        "anthropic-version": "2023-06-01"
                    },
                    json={
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "Hi"}]
                    },
                    timeout=10
                )
                # Return True if we get any valid response (including rate limits)
                return response.status_code in [200, 429]
        except Exception as e:
            print(f"Anthropic key verification failed: {e}")
            return False

    def _verify_gemini_key(self, api_key: str) -> bool:
        """Verify Gemini API key by making a simple request."""
        try:
            with httpx.Client() as client:
                response = client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"Gemini key verification failed: {e}")
            return False

    def _verify_groq_key(self, api_key: str) -> bool:
        """Verify Groq API key by making a simple request."""
        try:
            with httpx.Client() as client:
                response = client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"Groq key verification failed: {e}")
            return False

    def get_valid_models_for_provider(self, provider: str, api_key: str) -> List[str]:
        """Get a list of valid models for a specific provider."""
        try:
            # Return a static list of common models for each provider
            # This is safer than trying to query APIs which might have complex auth
            provider_models = {
                "openai": [
                    "gpt-4o",
                    "gpt-4o-mini",
                    "gpt-4-turbo",
                    "gpt-4",
                    "gpt-3.5-turbo",
                    "o1-preview",
                    "o1-mini"
                ],
                "anthropic": [
                    "claude-3-5-sonnet-20241022",
                    "claude-3-5-haiku-20241022",
                    "claude-3-opus-20240229",
                    "claude-3-sonnet-20240229",
                    "claude-3-haiku-20240307"
                ],
                "gemini": [
                    "gemini-2.0-flash-exp",
                    "gemini-1.5-pro",
                    "gemini-1.5-flash",
                    "gemini-pro"
                ],
                "groq": [
                    "llama-3.3-70b-versatile",
                    "llama-3.1-70b-versatile",
                    "llama-3.1-8b-instant",
                    "llama3-groq-70b-8192-tool-use-preview",
                    "llama3-groq-8b-8192-tool-use-preview",
                    "mixtral-8x7b-32768",
                    "gemma2-9b-it",
                    "gemma-7b-it"
                ]
            }
            
            return provider_models.get(provider, [])
            
        except Exception as e:
            print(f"Error getting valid models for {provider}: {e}")
            return []


# Global instance
api_key_verifier = APIKeyVerifier() 