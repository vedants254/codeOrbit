"""
Strict JWT authentication middleware for FastAPI.
Enforces Authorization header usage for secure token transmission.
"""

from fastapi import  HTTPException, Header
from typing import Optional
from models.user import User
from utils.jwt_utils import _decode_jwt_token


async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    """
    Strict JWT authentication dependency.
    Requires 'Authorization: Bearer <token>' header.
    Returns authenticated User object.
    
    Raises:
        HTTPException(401): If no token, invalid format, or authentication fails
    """
    
    if not authorization:
        raise HTTPException(
            status_code=401, 
            detail="Authentication required: Missing Authorization header"
        )
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, 
            detail="Authentication required: Invalid Authorization header format. Expected 'Bearer <token>'"
        )
    
    token = authorization.split(" ")[1]
    
    if not token:
        raise HTTPException(
            status_code=401, 
            detail="Authentication required: Empty token"
        )
    
    # Decode and validate the JWT token
    user = await _decode_jwt_token(token)
    if not user:
        raise HTTPException(
            status_code=401, 
            detail="Authentication failed: Invalid token"
        )
    
    return user


async def optional_auth(authorization: Optional[str] = Header(None)) -> Optional[User]:
    """
    Optional JWT authentication dependency.
    Returns User object if valid token provided, None otherwise.
    Does not raise exceptions for missing/invalid tokens.
    """
    
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    token = authorization.split(" ")[1]
    if not token:
        return None
    
    try:
        return await _decode_jwt_token(token)
    except:
        return None