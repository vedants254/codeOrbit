from fastapi import APIRouter, Depends, Form
from typing import Annotated
from schemas.auth_schemas import (
    LoginResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
)
from schemas.response_schemas import ErrorResponse
from controllers.auth_controller import login_user
from utils.jwt_utils import refresh_access_token


router = APIRouter(prefix="/backend-auth")

router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate via GitHub access token",
    description="Accepts a GitHub access token, fetches user profile from GitHub, creates a new user if not existing, and returns a JWT access token.",
    response_description="A valid JWT token along with user metadata.",
    responses={
        200: {
            "model": LoginResponse,
            "description": "Login successful. Returns JWT and user ID.",
        },
        400: {
            "model": ErrorResponse,
            "description": "Bad request. GitHub token is invalid or does not return required user data (email/username).",
        },
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized. GitHub token is invalid or expired.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
)(login_user)


@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    summary="Refresh access token",
    description="Accepts a refresh token and returns a new access token.",
    response_description="A new access token.",
    responses={
        200: {
            "model": RefreshTokenResponse,
            "description": "Token refresh successful. Returns new access token.",
        },
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized. Refresh token is invalid or expired.",
        },
        404: {"model": ErrorResponse, "description": "User not found."},
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
)
async def refresh_token(request: RefreshTokenRequest):
    token_data = await refresh_access_token(request.refresh_token)
    return RefreshTokenResponse(
        access_token=token_data["access_token"], expires_in=token_data["access_expires"]
    )
