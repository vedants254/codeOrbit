from jose import jwt, JWTError, ExpiredSignatureError
from datetime import datetime, timedelta
from models.user import User
from beanie.operators import Or
from fastapi import HTTPException, Header
import os

from typing import Optional

JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(
    os.getenv("JWT_EXPIRE_MINUTES", 10080)
)  # Default to 7 days (10080 minutes)
REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30)
)  # Default to 30 days


async def create_jwt_token(identifier: str):
    # Fetch user from DB using either email or username
    user = await User.find_one(
        Or(User.email == identifier, User.username == identifier)
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Set expiry for access token
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)

    # JWT payload with custom claims
    jwt_payload = {
        "_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "exp": expire,
        "type": "access",
    }

    access_token = jwt.encode(jwt_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return access_token, int(expire.timestamp())


async def create_refresh_token(identifier: str):
    # Fetch user from DB using either email or username
    user = await User.find_one(
        Or(User.email == identifier, User.username == identifier)
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Set expiry for refresh token (longer duration)
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    # Refresh token payload
    refresh_payload = {
        "_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "exp": expire,
        "type": "refresh",
    }

    refresh_token = jwt.encode(refresh_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return refresh_token, int(expire.timestamp())


async def create_tokens(identifier: str):
    """Create both access and refresh tokens"""
    access_token, access_expires = await create_jwt_token(identifier)
    refresh_token, refresh_expires = await create_refresh_token(identifier)

    return {
        "access_token": access_token,
        "access_expires": access_expires,
        "refresh_token": refresh_token,
        "refresh_expires": refresh_expires,
    }


async def refresh_access_token(refresh_token: str):
    """Generate new access token from refresh token"""
    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        # Verify it's a refresh token
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id = payload.get("_id")
        email = payload.get("email")

        if not user_id or not email:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # Verify user still exists
        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Create new access token
        access_token, access_expires = await create_jwt_token(email)

        return {"access_token": access_token, "access_expires": access_expires}

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token has expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# Helper function to decode JWT token from string
async def _decode_jwt_token(token: str) -> Optional[User]:
    """Internal function to decode JWT token and return user"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        # Verify it's an access token
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id = payload.get("_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# Overloaded function to support both direct token string and FastAPI dependency
async def get_current_user(
    token_or_authorization: Optional[str] = None,
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """
    Get current user from JWT token. Supports two usage patterns:
    1. As FastAPI dependency: get_current_user() - reads from Authorization header
    2. As direct function call: get_current_user(token_string) - uses provided token
    """

    # If token_or_authorization is provided, treat it as a direct token string call
    if token_or_authorization is not None:
        return await _decode_jwt_token(token_or_authorization)

    # Otherwise, use the authorization header (FastAPI dependency pattern)
    if not authorization or not authorization.startswith("Bearer "):
        return None  # No token → allow anonymous access

    token = authorization.split(" ")[1]
    return await _decode_jwt_token(token)
