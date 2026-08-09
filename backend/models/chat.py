from beanie import Document, Link
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from models.user import User
from models.repository import Repository

class Message(BaseModel):
    """Individual message in a conversation"""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    context_used: Optional[str] = None  # Context from repository used for this message
    metadata: Optional[Dict[str, Any]] = None  # Additional metadata like token count, model used, etc.
    
 
class Conversation(Document):
    """A conversation thread within a chat session"""
    user: Link[User]
    repository: Link[Repository]
    chat_id: str  # Groups multiple conversations under one chat session
    conversation_id: str  # Unique identifier for this specific conversation thread
    title: Optional[str] = None  # Auto-generated or user-set title
    messages: List[Message] = []
    
    # Model and settings used for this conversation
    model_provider: str = "openai"  # "openai", "anthropic", "gemini"
    model_name: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    total_tokens_used: int = 0
    
    class Settings:
        name = "conversations"
        
    def add_message(self, role: str, content: str, context_used: Optional[str] = None, metadata: Optional[Dict] = None):
        """Add a message to the conversation"""
        message = Message(
            role=role,
            content=content,
            context_used=context_used,
            metadata=metadata or {}
        )
        self.messages.append(message)
        self.updated_at = datetime.utcnow()
        return message

class ChatSession(Document):
    """Chat session that groups multiple conversations"""
    user: Link[User]
    repository: Link[Repository]
    chat_id: str  # Unique identifier for the chat session
    title: Optional[str] = None
    
    # Settings for the entire chat session
    default_model_provider: str = "gemini"
    default_model_name: str = "gemini-1.5-flash"
    default_temperature: float = 0.7
    
    # API Key settings
    use_own_key: bool = False
    encrypted_api_keys: Optional[Dict[str, str]] = None  # Provider -> encrypted key
    
    # Rate limiting tracking
    daily_requests_count: int = 0
    last_request_date: datetime = Field(default_factory=datetime.utcnow)
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    
    class Settings:
        name = "chat_sessions"
        
    def reset_daily_count_if_needed(self):
        """Reset daily request count if it's a new day"""
        today = datetime.utcnow().date()
        if self.last_request_date.date() != today:
            self.daily_requests_count = 0
            self.last_request_date = datetime.utcnow()
            
    def can_make_request(self, daily_limit: int = 50) -> bool:
        """Check if user can make another request based on daily limit"""
        self.reset_daily_count_if_needed()
        return self.daily_requests_count < daily_limit or self.use_own_key
        
    def increment_request_count(self):
        """Increment the daily request count"""
        self.reset_daily_count_if_needed()
        self.daily_requests_count += 1
        self.updated_at = datetime.utcnow()
        
class UserApiKey(Document):
    """Store user's API keys securely"""
    user: Link[User]
    provider: str  # "openai", "anthropic", "gemini"
    encrypted_key: str
    key_name: Optional[str] = None  # User-friendly name for the key
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_used: Optional[datetime] = None
    
    class Settings:
        name = "user_api_keys"