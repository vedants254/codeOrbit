from typing import Optional, Dict, Any, List
from datetime import datetime
from beanie import Document, Indexed
from pydantic import BaseModel, Field

class TaskProgressEvent(BaseModel):
    """Individual progress event for a task"""
    timestamp: float
    message: str
    event_type: str = "progress"
    metadata: Optional[Dict[str, Any]] = None

class DocumentationTask(Document):
    """Database model for documentation generation tasks"""
    
    # Task identification
    task_id: Indexed(str, unique=True)  # type: ignore
    user_id: str  # Reference to user who created the task
    repository_id: str  # Reference to repository
    
    # Task configuration
    provider: str = "gemini"
    model: Optional[str] = None
    temperature: float = 0.7
    language: str = "en"
    comprehensive: bool = True
    
    # Task status
    status: str = "pending"  # pending, running, completed, failed, cancelled
    message: str = "Task queued"
    error: Optional[str] = None
    
    # Progress tracking
    progress_events: List[TaskProgressEvent] = []
    current_step: Optional[str] = None
    progress_percentage: float = 0.0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Results
    result: Optional[Dict[str, Any]] = None
    
    class Settings:
        name = "documentation_tasks"
        indexes = [
            [("user_id", 1), ("created_at", -1)],  # For user task history
            [("status", 1), ("created_at", -1)],   # For active task queries
            "task_id",  # Unique task lookup
        ]
    
    def add_progress_event(self, message: str, event_type: str = "progress", metadata: Optional[Dict[str, Any]] = None):
        """Add a progress event to the task"""
        event = TaskProgressEvent(
            timestamp=datetime.utcnow().timestamp(),
            message=message,
            event_type=event_type,
            metadata=metadata
        )
        self.progress_events.append(event)
        self.message = message
    
    def update_status(self, status: str, message: str, error: Optional[str] = None):
        """Update task status"""
        self.status = status
        self.message = message
        if error:
            self.error = error
            
        if status == "running" and not self.started_at:
            self.started_at = datetime.utcnow()
        elif status in ["completed", "failed", "cancelled"]:
            self.completed_at = datetime.utcnow()
    
    def get_recent_progress(self, limit: int = 10) -> List[TaskProgressEvent]:
        """Get recent progress events"""
        return self.progress_events[-limit:] if self.progress_events else []