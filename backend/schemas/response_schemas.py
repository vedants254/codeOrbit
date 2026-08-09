from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

# =====================
# Models
# =====================
class ErrorResponse(BaseModel):
    detail: str


class GraphNode(BaseModel):
    id: str
    name: str
    category: str
    file: Optional[str] = None
    line: Optional[int] = Field(None, alias="start_line")
    end_line: Optional[int] = Field(None, alias="end_line")
    code: Optional[str] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str


class GraphResponse(BaseModel):
    html_url: Optional[str] = None
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# New model for individual file data
class FileData(BaseModel):
    path: str
    content: str
    # language: Optional[str] = None # Future: for syntax highlighting hints


class StructureResponse(BaseModel):
    directory_tree: str  # The visual tree string
    files: List[FileData]  # List of files with their content
    # file_count is removed, can be derived from len(files)


class TextResponse(BaseModel):
    text_content: str
    filename_suggestion: str
    repo_id: str


# Schema for indexed repository information
class IndexedRepository(BaseModel):
    repo_id: str
    repo_name: str
    branch: str
    source: str  # "github" or "zip"
    github_url: Optional[str] = None
    commit_sha: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    file_size_mb: Optional[float] = None  # Size in MB for display


class IndexedRepositoriesResponse(BaseModel):
    repositories: List[IndexedRepository]
    total_count: int
    user_tier: str