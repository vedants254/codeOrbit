"""
Enhanced API key controller integrated with LLM service
Handles API key verification, saving, and management for users
"""
from fastapi import HTTPException, Form
from typing import Annotated, Optional
from utils.llm_utils import llm_service
from models.user import User
from models.chat import UserApiKey
from beanie import BeanieObjectId
from datetime import datetime, timezone
from schemas.chat_schemas import AvailableModelsResponse



class ApiKeyController:
    """Enhanced controller for API key verification and management"""

    async def verify_api_key(
        self,
        user: User,
        provider: Annotated[str, Form(description="Provider name (openai, anthropic, gemini, groq)")],
        api_key: Annotated[str, Form(description="API key to verify")]
    ) -> dict:
        """Verify API key without saving it"""
        try:
            # Validate provider
            valid_providers = ["openai", "anthropic", "gemini", "groq"]
            if provider not in valid_providers:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid provider. Valid providers: {', '.join(valid_providers)}"
                )
            
            # Verify the API key using llm_service
            is_valid = llm_service.verify_api_key(provider, api_key)
            
            response = {
                "success": True,
                "provider": provider,
                "is_valid": is_valid,
                "message": "API key is valid" if is_valid else "API key is invalid"
            }
            
            # Get available models if key is valid
            if is_valid:
                try:
                    # Get models from llm_service configuration
                    all_models = llm_service.get_available_models()
                    provider_models = all_models.get(provider, [])
                    response["available_models"] = provider_models[:15]  # Return up to 15 models
                    
                    # Get model configurations for additional info
                    model_configs = []
                    for model in provider_models[:10]:  # Detailed info for first 10
                        config = llm_service.get_model_config(provider, model)
                        if config:
                            model_configs.append({
                                "name": model,
                                "max_tokens": config.max_tokens,
                                "max_output_tokens": config.max_output_tokens,
                                "supports_function_calling": config.supports_function_calling,
                                "supports_vision": config.supports_vision,
                                "is_reasoning_model": config.is_reasoning_model,
                                "knowledge_cutoff": config.knowledge_cutoff
                            })
                    
                    response["model_configs"] = model_configs
                    
                except Exception as e:
                    print(f"Could not fetch model configs for {provider}: {e}")
                    response["available_models"] = []
                    response["model_configs"] = []
            
            return response
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def save_user_api_key(
        self,
        user: User,
        provider: Annotated[str, Form(description="Provider name (openai, anthropic, gemini, groq)")],
        api_key: Annotated[str, Form(description="API key to save")],
        key_name: Annotated[Optional[str], Form(description="Optional friendly name for the key")] = None,
        verify_key: Annotated[bool, Form(description="Whether to verify key before saving")] = True
    ) -> dict:
        """Save encrypted user API key"""
        try:
            
            # Validate provider
            valid_providers = ["openai", "anthropic", "gemini", "groq"]
            if provider not in valid_providers:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid provider. Valid providers: {', '.join(valid_providers)}"
                )
            
            # Save API key using llm_service
            saved_key = await llm_service.save_user_api_key(
                user=user,
                provider=provider,
                api_key=api_key,
                verify=verify_key
            )
            
            # Update key_name if provided
            if key_name and saved_key:
                saved_key.key_name = key_name
                await saved_key.save()
            
            return {
                "success": True,
                "message": "API key saved successfully",
                "provider": provider,
                "key_name": key_name,
                "created_at": saved_key.created_at.isoformat() if saved_key else None,
                "is_active": True
            }
            
        except ValueError as e:
            # Handle verification errors
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def get_user_api_keys(
        self,
        user: User
    ) -> dict:
        """Get list of user's saved API keys (without exposing the actual keys)"""
        try:
            
            # Get user's API keys
            user_keys = await UserApiKey.find(
                UserApiKey.user.id == BeanieObjectId(user.id),
                UserApiKey.is_active == True
            ).to_list()
            
            keys_info = []
            for key in user_keys:
                keys_info.append({
                    "id": str(key.id),
                    "provider": key.provider,
                    "key_name": key.key_name,
                    "created_at": key.created_at.isoformat(),
                    "updated_at": key.updated_at.isoformat(),
                    "is_active": key.is_active
                })
            
            return {
                "success": True,
                "keys": keys_info,
                "total_keys": len(keys_info)
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def delete_user_api_key(
        self,
        user: User,
        provider: Annotated[str, Form(description="Provider name to delete key for")],
        key_id: Annotated[Optional[str], Form(description="Specific key ID to delete")] = None
    ) -> dict:
        """Delete user's API key for a specific provider"""
        try:
            
            # Find the key using proper Beanie query format
            if key_id:
                # If specific key ID provided, find by ID and verify it belongs to user
                try:
                    user_key = await UserApiKey.find_one(
                        UserApiKey.id == BeanieObjectId(key_id),
                        UserApiKey.user.id == BeanieObjectId(user.id),
                        UserApiKey.provider == provider
                        # Removed is_active filter since we're doing hard deletes
                    )
                except Exception as e:
                    print(f"Error finding key by ID {key_id}: {e}")
                    user_key = None
            else:
                # Find by user and provider (active keys only for provider-based deletion)
                user_key = await UserApiKey.find_one(
                    UserApiKey.user.id == BeanieObjectId(user.id),
                    UserApiKey.provider == provider,
                    UserApiKey.is_active == True  # Keep this for provider-based deletion
                )
            if not user_key:
                # Debug: List all keys for this user to help troubleshoot
                all_user_keys = await UserApiKey.find(
                    UserApiKey.user.id == BeanieObjectId(user.id)
                ).to_list()
                
                print(f"Debug - Delete API key: User {user.id}, Provider {provider}, Key ID {key_id}")
                print(f"Debug - User has {len(all_user_keys)} total keys")
                for key in all_user_keys:
                    print(f"Debug - Key: ID={key.id}, Provider={key.provider}, Active={key.is_active}")
                
                raise HTTPException(
                    status_code=404, 
                    detail=f"API key not found for provider '{provider}'. Available providers for user: {[k.provider for k in all_user_keys if k.is_active]}"
                )
            
            # Hard delete for security reasons - completely remove the API key from database
            deleted_at = datetime.now(timezone.utc)
            await user_key.delete()
            
            return {
                "success": True,
                "message": f"API key for {provider} permanently deleted successfully",
                "provider": provider,
                "deleted_at": deleted_at.isoformat()
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def get_available_models(
        self,
        user: Optional[User] = None,
        provider: Annotated[Optional[str], Form(description="Specific provider to get models for")] = None
    ) -> dict:
        """Get available models for all providers or a specific provider"""
        try:
            
            # Get available models from llm_service
            all_models = llm_service.get_available_models()
            
            if provider:
                if provider not in all_models:
                    raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")
                models_data = {provider: all_models[provider]}
            else:
                models_data = all_models
            
            # Check which providers user has keys for
            user_has_keys = []
            if user:
                for prov in models_data.keys():
                    user_key = await llm_service.get_user_api_key(user, prov)
                    if user_key:
                        user_has_keys.append(prov)
            
            # Get detailed model configurations
            detailed_models = {}
            for prov, models in models_data.items():
                detailed_models[prov] = []
                for model in models:
                    config = llm_service.get_model_config(prov, model)
                    if config:
                        detailed_models[prov].append({
                            "name": model,
                            "max_tokens": config.max_tokens,
                            "max_output_tokens": config.max_output_tokens,
                            "supports_function_calling": config.supports_function_calling,
                            "supports_vision": config.supports_vision,
                            "is_reasoning_model": config.is_reasoning_model,
                            "knowledge_cutoff": config.knowledge_cutoff,
                            "cost_per_1M_input": config.cost_per_1M_input,
                            "cost_per_1M_output": config.cost_per_1M_output
                        })
            
            return {
                "success": True,
                "providers": list(models_data.keys()),
                "models": models_data,
                "detailed_models": detailed_models,
                "user_has_keys": user_has_keys,
                "total_models": sum(len(models) for models in models_data.values())
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def get_model_config(
        self,
        provider: str,
        model: str
    ) -> dict:
        """Get detailed configuration for a specific model"""
        try:
            # Validate provider
            valid_providers = ["openai", "anthropic", "gemini", "groq"]
            if provider not in valid_providers:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid provider. Valid providers: {', '.join(valid_providers)}"
                )
            
            # Get model configuration from llm_service
            config = llm_service.get_model_config(provider, model)
            if not config:
                # Check if model exists for this provider
                all_models = llm_service.get_available_models()
                provider_models = all_models.get(provider, [])
                if model not in provider_models:
                    raise HTTPException(
                        status_code=404, 
                        detail=f"Model '{model}' not found for provider '{provider}'. Available models: {provider_models[:10]}"
                    )
                else:
                    raise HTTPException(
                        status_code=404, 
                        detail=f"Configuration not found for model '{model}'"
                    )
            
            # Return detailed configuration
            return {
                "success": True,
                "provider": provider,
                "model": model,
                "config": {
                    "max_tokens": config.max_tokens,
                    "max_output_tokens": config.max_output_tokens,
                    "cost_per_1M_input": config.cost_per_1M_input,
                    "cost_per_1M_output": config.cost_per_1M_output,
                    "cost_per_1M_cached_input": config.cost_per_1M_cached_input,
                    "supports_function_calling": config.supports_function_calling,
                    "supports_vision": config.supports_vision,
                    "knowledge_cutoff": config.knowledge_cutoff,
                    "is_reasoning_model": config.is_reasoning_model
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def get_available_models_response(
        self,
        user: User
    ) -> AvailableModelsResponse:
        """Get available models with user's key status - returns AvailableModelsResponse schema"""
        try:
            # Get user's keys
            user_keys = await UserApiKey.find(
                UserApiKey.user.id == BeanieObjectId(user.id),
                UserApiKey.is_active == True
            ).to_list()
            
            user_has_keys = [key.provider for key in user_keys]
            
            # Get available models from LangChain service
            from utils.langchain_llm_service import langchain_service
            models = langchain_service.get_available_models()
            
            response = AvailableModelsResponse(
                providers=models,
                current_limits={},  # Remove limits
                user_has_keys=user_has_keys
            )
            
            return response
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# Global instance
api_key_controller = ApiKeyController() 