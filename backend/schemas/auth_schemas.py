from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional


class LoginRequest(BaseModel):
    access_token: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


load_dotenv()


class LoginResponse(BaseModel):
    jwt_token: str
    expires_in: int
    user_id: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    refresh_expires_in: Optional[int] = None


class RefreshTokenResponse(BaseModel):
    access_token: str
    expires_in: int
    token_type: str = "bearer"
