from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class WikiGenerationRequest(BaseModel):
    repository_url: str
    output_dir: Optional[str] = "./wiki_output"
    language: Optional[str] = "en"
    comprehensive: Optional[bool] = True

class WikiGenerationResponse(BaseModel):
    status: str
    message: str
    task_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

class TaskStatus(BaseModel):
    task_id: str
    status: str  # "pending", "running", "completed", "failed"
    message: str
    error: Optional[str] = None
    created_at: float
    completed_at: Optional[float] = None
    
class RepositoryDocsRequest(BaseModel):
    repo_id: str = Field(..., description="ID of the repository to list documentation files for")
    token: str = Field(..., description="Authentication token for the request")

class FileMetadata(BaseModel):
    filename: str
    size: int
    modified: str  # ISO format datetime string
    type: str

class DocumentationFile(BaseModel):
    metadata: FileMetadata
    content: str
    preview: str
    word_count: int
    read_time: int  # Estimated reading time in minutes

class SidebarItem(BaseModel):
    title: str
    filename: str
    emoji: str
    url: str

class NavigationData(BaseModel):
    sidebar: List[SidebarItem]
    total_pages: int

class RepositoryInfo(BaseModel):
    id: str
    name: str
    directory: str

class RepositoryAnalysis(BaseModel):
    domain_type: Optional[str] = None
    complexity_score: Optional[str] = None
    languages: Optional[str] = None
    frameworks: Optional[str] = None
    total_pages: Optional[str] = None

class RepositoryDocsData(BaseModel):
    repository: RepositoryInfo
    analysis: RepositoryAnalysis
    navigation: NavigationData
    folder_structure: Any
    content: Dict[str, DocumentationFile]

class RepositoryDocsResponse(BaseModel):
    success: bool
    data: RepositoryDocsData
    message: str
    
class IsWikiGeneratedRequest(BaseModel):
    repository_url: str
    token: str
    
class IsWikiGeneratedResponse(BaseModel):
    is_generated: bool
    status: str  # "pending", "running", "completed", "failed",
    message: str = "Wiki documentation generation status checked successfully"
    error: Optional[str] = None