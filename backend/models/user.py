from beanie import Document
from pydantic import EmailStr
from typing import Optional
from datetime import datetime


class User(Document):
    fullname: str
    username: str
    email: EmailStr
    github_access_token: str
    profile_picture: Optional[str] = None
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()
    
    daily_requests_count: int = 0
    last_request_date: Optional[datetime] = None
    user_tier: str = "free"  # "free", "premium", "unlimited"

    class Settings:
        name = "users"  # MongoDB collection name
        
    def reset_daily_count_if_needed(self):
        """Reset daily count if it's a new day"""
        today = datetime.utcnow().date()
        if not self.last_request_date or self.last_request_date.date() != today:
            self.daily_requests_count = 0
            self.last_request_date = datetime.utcnow()

    def increment_request_count(self):
        """Increment the daily request count"""
        self.reset_daily_count_if_needed()
        self.daily_requests_count += 1
        self.last_request_date = datetime.utcnow()