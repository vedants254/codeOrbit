"""
Enhanced API key routes with full user API key management
Integrated with LLM service for comprehensive functionality
"""
from fastapi import APIRouter, Form, Depends
from typing import Optional, Annotated
from controllers.api_key_controller import api_key_controller
from middleware.auth_middleware import require_auth
from models.user import User
from schemas.chat_schemas import (
    ApiKeyResponse,
    AvailableModelsResponse
)
from schemas.response_schemas import ErrorResponse

router = APIRouter(prefix="/backend-chat")

# API key verification endpoint - exact copy from chat_routes.py
@router.post(
    "/keys/verify",
    response_model=dict,
    summary="Verify API key",
    description="Verify if an API key is valid for a specific provider without saving it",
    response_description="Verification result with details",
    responses={
        200: {
            "description": "API key verification result"
        },
        400: {
            "model": ErrorResponse,
            "description": "Invalid provider specified"
        },
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized - Invalid JWT token"
        },
        500: {
            "model": ErrorResponse,
            "description": "Internal server error"
        }
    }
)
async def verify_user_api_key(
    current_user: Annotated[User, Depends(require_auth)],
    provider: Annotated[str, Form(description="Provider name (openai, anthropic, gemini, groq)")],
    api_key: Annotated[str, Form(description="API key to verify")]
):
    return await api_key_controller.verify_api_key(
        user=current_user,
        provider=provider,
        api_key=api_key
    )

# API key save endpoint - exact copy from chat_routes.py
@router.post(
    "/keys/save",
    response_model=ApiKeyResponse,
    summary="Save user API key",
    description="Save or update an encrypted API key for a specific provider with verification",
    response_description="Confirmation of key save operation",
    responses={
        200: {
            "model": ApiKeyResponse,
            "description": "API key saved successfully"
        },
        400: {
            "model": ErrorResponse,
            "description": "Invalid provider or API key specified"
        },
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized - Invalid JWT token"
        },
        500: {
            "model": ErrorResponse,
            "description": "Internal server error"
        }
    }
)
async def save_user_api_key(
    current_user: Annotated[User, Depends(require_auth)],
    provider: Annotated[str, Form(description="Provider name (openai, anthropic, gemini, groq)")],
    api_key: Annotated[str, Form(description="API key")],
    key_name: Annotated[Optional[str], Form(description="Friendly name for the key")] = None,
    verify_key: Annotated[bool, Form(description="Whether to verify the key before saving")] = True
):
    return await api_key_controller.save_user_api_key(
        user=current_user,
        provider=provider,
        api_key=api_key,
        key_name=key_name,
        verify_key=verify_key
    )

# Get user API keys endpoint
@router.post(
    "/keys/list",
    summary="Get user API keys",
    description="Get list of user's saved API keys (without exposing actual keys)",
    operation_id="get_user_api_keys_backend_enhanced"
)
async def get_user_api_keys_enhanced(
    current_user: Annotated[User, Depends(require_auth)]
):
    """Get list of user's saved API keys"""
    return await api_key_controller.get_user_api_keys(user=current_user)

# Delete user API key endpoint
@router.post(
    "/keys/delete",
    summary="Delete user API key",
    description="Delete user's API key for a specific provider",
    operation_id="delete_user_api_key_backend_enhanced"
)
async def delete_user_api_key_enhanced(
    current_user: Annotated[User, Depends(require_auth)],
    provider: Annotated[str, Form(description="Provider name to delete key for")],
    key_id: Annotated[Optional[str], Form(description="Specific key ID to delete")] = None
):
    """Delete user's API key for a specific provider"""
    return await api_key_controller.delete_user_api_key(
        user=current_user,
        provider=provider,
        key_id=key_id
    )

# Available models endpoint - exact copy from chat_routes.py
@router.post(
    "/models",
    response_model=AvailableModelsResponse,
    summary="Get available LLM models",
    description="Retrieve list of available models per provider and user's API key status",
    response_description="List of available models and user's key status",
    responses={
        200: {
            "model": AvailableModelsResponse,
            "description": "Successful retrieval of available models"
        },
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized - Invalid JWT token"
        },
        500: {
            "model": ErrorResponse,
            "description": "Internal server error"
        }
    }
)
async def get_available_models(
    current_user: Annotated[User, Depends(require_auth)]
):
    return await api_key_controller.get_available_models_response(user=current_user)

# Get available models endpoint with provider filter
@router.post(
    "/models/available",
    summary="Get available models",
    description="Get available models for all providers or a specific provider",
    operation_id="get_available_models_backend_enhanced"
)
async def get_available_models_enhanced(
    current_user: Annotated[User, Depends(require_auth)],
    provider: Annotated[Optional[str], Form(description="Specific provider to get models for")] = None
):
    """Get available models with detailed configurations"""
    return await api_key_controller.get_available_models(
        user=current_user,
        provider=provider
    )

# Get available models (GET endpoint for easier access)
@router.get(
    "/models/available",
    summary="Get available models (GET)",
    description="Get available models for all providers (GET method for easier frontend integration)",
    operation_id="get_available_models_get_backend_enhanced"
)
async def get_available_models_get_enhanced(
    provider: Optional[str] = None
):
    """Get available models with detailed configurations (GET method)"""
    # For GET requests without auth, return basic model information
    return await api_key_controller.get_available_models(
        user=None,
        provider=provider
    )

# Get model configuration endpoint
@router.get(
    "/models/{provider}/{model}/config",
    summary="Get model configuration",
    description="Get detailed configuration for a specific model including max tokens, capabilities, and pricing",
    operation_id="get_model_config_backend_enhanced"
)
async def get_model_config_enhanced(
    provider: str,
    model: str
):
    """Get detailed configuration for a specific model"""
    return await api_key_controller.get_model_config(
        provider=provider,
        model=model
    )

# Health check endpoint
@router.get(
    "/health",
    summary="Health check",
    description="Simple health check for API key service",
    operation_id="health_check_backend_enhanced"
)
async def health_check_enhanced():
    """Health check endpoint"""
    return {
        "status": "ok", 
        "message": "Enhanced API key service is running",
        "features": [
            "API key verification",
            "User API key management", 
            "Encrypted key storage",
            "Multi-provider support",
            "Model information"
        ],
        "supported_providers": ["openai", "anthropic", "gemini", "groq"]
    }

# Service info endpoint
@router.get(
    "/info",
    summary="Service information",
    description="Get information about the API key service capabilities",
    operation_id="service_info_backend_enhanced"
)
async def service_info_enhanced():
    """Get service information and capabilities"""
    from utils.llm_utils import llm_service
    
    available_models = llm_service.get_available_models()
    
    return {
        "service_name": "Enhanced API Key Management Service",
        "version": "2.0.0",
        "capabilities": {
            "api_key_verification": True,
            "encrypted_storage": True,
            "multi_provider_support": True,
            "model_information": True,
            "user_key_management": True
        },
        "supported_providers": list(available_models.keys()),
        "total_models": sum(len(models) for models in available_models.values()),
        "models_per_provider": {
            provider: len(models) 
            for provider, models in available_models.items()
        }
    } 