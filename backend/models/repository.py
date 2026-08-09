from beanie import Document, Link
from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime
from models.user import User


class FilePaths(BaseModel):
    zip: str
    text: str
    json_file: str
    documentation_base_path: str


class Repository(Document):
    user: Link[User]  # Reference to the User document
    repo_name: str
    branch: str = "main"
    commit_sha: Optional[str] = None
    source: str  # "github" or "zip"
    github_url: Optional[str]
    file_paths: FilePaths
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "repositories"