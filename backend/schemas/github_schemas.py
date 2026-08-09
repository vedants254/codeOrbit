from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime


class GitHubAccount(BaseModel):
    """GitHub account information"""
    login: str
    id: int
    avatar_url: str
    type: Optional[str] = None


class GitHubInstallation(BaseModel):
    """GitHub App installation"""
    id: int
    account: GitHubAccount
    app_id: int
    target_type: str
    target_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GitHubInstallationsResponse(BaseModel):
    """Response for GitHub installations endpoint"""
    installations: List[GitHubInstallation]
    user_id: int
    user_login: str


class GitHubRepository(BaseModel):
    """GitHub repository information"""
    id: int
    name: str
    full_name: str
    description: Optional[str] = None
    private: bool
    html_url: str
    language: Optional[str] = None
    stargazers_count: int = 0
    forks_count: int = 0
    default_branch: str = "main"
    updated_at: Optional[str] = None


class GitHubRepositoriesResponse(BaseModel):
    """Response for GitHub repositories endpoint"""
    repositories: List[GitHubRepository]
    total_count: int


class GitHubInstallationsRequest(BaseModel):
    """Request for getting GitHub installations"""
    pass  # No additional parameters needed, user ID comes from JWT


class GitHubRepositoriesRequest(BaseModel):
    """Request for getting installation repositories"""
    installation_id: int = Field(..., description="GitHub App installation ID")