import os
import json
import shutil
import hashlib
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime

from models.repository import FilePaths
from dotenv import load_dotenv


class FileManager:
    """Utility class for managing file storage operations."""
    
    def __init__(self, base_storage_dir: Optional[str] = None):
        load_dotenv()
        env_base_dir = os.getenv("FILE_STORAGE_BASEPATH")
        base_dir = base_storage_dir or env_base_dir or "storage"
        self.base_storage_dir = Path(base_dir)
        self.base_storage_dir.mkdir(parents=True, exist_ok=True)
    
    def get_user_storage_path(self, user_id: str) -> Path:
        """Get the storage path for a specific user."""
        user_path = self.base_storage_dir / "users" / user_id
        user_path.mkdir(parents=True, exist_ok=True)
        return user_path
    
    def get_repo_storage_path(self, user_id: str, repo_identifier: str) -> Path:
        """Get the storage path for a specific repository."""
        # Convert forward slashes to underscores for filesystem compatibility
        safe_identifier = sanitize_identifier_for_filesystem(repo_identifier)
        repo_path = self.get_user_storage_path(user_id) / safe_identifier
        repo_path.mkdir(parents=True, exist_ok=True)
        return repo_path
    
    def generate_file_paths(self, user_id: str, repo_identifier: str) -> FilePaths:
        """Generate file paths for a repository."""
        base_dir = self.get_repo_storage_path(user_id, repo_identifier)
        
        # Ensure documentation directory exists
        doc_dir = base_dir / "documentation"
        doc_dir.mkdir(parents=True, exist_ok=True)
        
        return FilePaths(
            zip=str(base_dir / "repository.zip"),
            text=str(base_dir / "content.txt"),
            json_file=str(base_dir / "data.json"),
            documentation_base_path=str(doc_dir)
        )
    
    async def save_text_content(self, file_path: str, content: str) -> bool:
        """Save text content to file."""
        try:
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error saving text content to {file_path}: {e}")
            return False
    
    async def save_zip_content(self, file_path: str, zip_content: bytes) -> bool:
        """Save ZIP content to file."""
        try:
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(zip_content)
            return True
        except Exception as e:
            print(f"Error saving ZIP content to {file_path}: {e}")
            return False
    
    async def save_json_data(self, file_path: str, data: Dict[str, Any]) -> bool:
        """Save JSON data to file."""
        try:
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            return True
        except Exception as e:
            print(f"Error saving JSON data to {file_path}: {e}")
            return False
    
    async def load_text_content(self, file_path: str) -> Optional[str]:
        """Load text content from file."""
        try:
            if not os.path.exists(file_path):
                return None
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"Error loading text content from {file_path}: {e}")
            return None
    
    async def load_json_data(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Load JSON data from file."""
        try:
            if not os.path.exists(file_path):
                return None
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading JSON data from {file_path}: {e}")
            return None
    
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists."""
        return os.path.exists(file_path) and os.path.isfile(file_path)
    
    def get_file_size(self, file_path: str) -> Optional[int]:
        """Get file size in bytes."""
        try:
            if self.file_exists(file_path):
                return os.path.getsize(file_path)
            return None
        except Exception as e:
            print(f"Error getting file size for {file_path}: {e}")
            return None
    
    def get_file_modified_time(self, file_path: str) -> Optional[datetime]:
        """Get file last modified time."""
        try:
            if self.file_exists(file_path):
                timestamp = os.path.getmtime(file_path)
                return datetime.fromtimestamp(timestamp)
            return None
        except Exception as e:
            print(f"Error getting file modified time for {file_path}: {e}")
            return None
    
    async def delete_file(self, file_path: str) -> bool:
        """Delete a single file."""
        try:
            if self.file_exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")
            return False
    
    async def delete_repository_files(self, user_id: str, repo_identifier: str) -> bool:
        """Delete all files for a specific repository."""
        try:
            repo_path = self.get_repo_storage_path(user_id, repo_identifier)
            if repo_path.exists():
                shutil.rmtree(repo_path)
                return True
            return False
        except Exception as e:
            print(f"Error deleting repository files for {repo_identifier}: {e}")
            return False
    
    async def delete_user_files(self, user_id: str) -> bool:
        """Delete all files for a specific user."""
        try:
            user_path = self.get_user_storage_path(user_id)
            if user_path.exists():
                shutil.rmtree(user_path)
                return True
            return False
        except Exception as e:
            print(f"Error deleting user files for {user_id}: {e}")
            return False
    
    def get_storage_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get storage statistics."""
        try:
            if user_id:
                path = self.get_user_storage_path(user_id)
            else:
                path = self.base_storage_dir
            
            total_size = 0
            file_count = 0
            
            for root, dirs, files in os.walk(path):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        total_size += os.path.getsize(file_path)
                        file_count += 1
                    except (OSError, IOError):
                        continue
            
            return {
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "file_count": file_count,
                "path": str(path)
            }
        except Exception as e:
            print(f"Error getting storage stats: {e}")
            return {"error": str(e)}
    
    def list_user_repositories(self, user_id: str) -> List[str]:
        """List all repository identifiers for a user."""
        try:
            user_path = self.get_user_storage_path(user_id)
            if not user_path.exists():
                return []
            
            repos = []
            for item in user_path.iterdir():
                if item.is_dir():
                    repos.append(item.name)
            
            return sorted(repos)
        except Exception as e:
            print(f"Error listing user repositories for {user_id}: {e}")
            return []
    
    async def validate_file_paths(self, file_paths: FilePaths) -> Dict[str, bool]:
        """Validate that all file paths exist and are accessible."""
        validation_result = {}
        
        if file_paths.text:
            validation_result["text"] = self.file_exists(file_paths.text)
        
        if file_paths.zip:
            validation_result["zip"] = self.file_exists(file_paths.zip)
        
        if file_paths.json_file:
            validation_result["json"] = self.file_exists(file_paths.json_file)
        
        if file_paths.documentation_base_path:
            validation_result["documentation"] = os.path.exists(file_paths.documentation_base_path)
        
        return validation_result
    
    def cleanup_empty_directories(self, user_id: Optional[str] = None) -> int:
        """Remove empty directories and return count of removed directories."""
        try:
            if user_id:
                base_path = self.get_user_storage_path(user_id)
            else:
                base_path = self.base_storage_dir
            
            removed_count = 0
            
            # Walk bottom-up to remove empty directories
            for root, dirs, files in os.walk(base_path, topdown=False):
                for dir_name in dirs:
                    dir_path = os.path.join(root, dir_name)
                    try:
                        if not os.listdir(dir_path):  # Empty directory
                            os.rmdir(dir_path)
                            removed_count += 1
                    except OSError:
                        continue
            
            return removed_count
        except Exception as e:
            print(f"Error cleaning up empty directories: {e}")
            return 0
    
    def get_documentation_storage_path(self, user_id: str, repo_identifier: str) -> Path:
        """Get the documentation storage path for a specific repository."""
        doc_path = self.get_repo_storage_path(user_id, repo_identifier) / "documentation"
        doc_path.mkdir(parents=True, exist_ok=True)
        return doc_path

    async def save_documentation_files(self, documentation_base_path: str, pages: List[dict]) -> bool:
        """Save documentation files to the specified path."""
        try:
            # Ensure the documentation directory exists
            os.makedirs(documentation_base_path, exist_ok=True)
            
            # Save each documentation page
            for page in pages:
                page_file = os.path.join(documentation_base_path, f"{page['id']}.md")
                with open(page_file, 'w', encoding='utf-8') as f:
                    f.write(page.get('content', ''))
            
            return True
        except Exception as e:
            print(f"Error saving documentation files: {e}")
            return False
    
    async def list_documentation_files(self, documentation_base_path: str) -> List[str]:
        """List all documentation files in the base path."""
        try:
            if not os.path.exists(documentation_base_path):
                return []
            
            doc_files = []
            for file in os.listdir(documentation_base_path):
                if file.endswith('.md'):
                    doc_files.append(file)
            
            return sorted(doc_files)
        except Exception as e:
            print(f"Error listing documentation files: {e}")
            return []
    
    async def get_documentation_file_content(self, documentation_base_path: str, file_name: str) -> Optional[str]:
        """Get content of a specific documentation file."""
        try:
            file_path = os.path.join(documentation_base_path, file_name)
            if not os.path.exists(file_path):
                return None
            
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading documentation file {file_name}: {e}")
            return None

async def save_repository_files(
    user_id: str,
    repo_identifier: str,
    formatted_text: str,
    graph_data: Optional[Dict[str, Any]] = None,
    structure_data: Optional[Dict[str, Any]] = None,
    zip_content: Optional[bytes] = None
) -> FilePaths:
    """
    Save all repository files to storage.
    
    Args:
        user_id: User identifier
        repo_identifier: Repository identifier
        formatted_text: Text content to save
        graph_data: Optional graph data
        structure_data: Optional structure data
        zip_content: Optional ZIP file content
    
    Returns:
        FilePaths object with paths to saved files
    
    Raises:
        Exception: If saving fails
    """
    file_manager = FileManager()
    file_paths = file_manager.generate_file_paths(user_id, repo_identifier)
    
    try:
        # Save text content
        text_saved = await file_manager.save_text_content(file_paths.text, formatted_text)
        if not text_saved:
            raise Exception("Failed to save text content")
        
        # Save ZIP content if provided
        if zip_content and file_paths.zip:
            zip_saved = await file_manager.save_zip_content(file_paths.zip, zip_content)
            if not zip_saved:
                print("Warning: Failed to save ZIP content")
        
        # Prepare JSON data
        json_data = {}
        if graph_data:
            json_data["graph"] = graph_data
        if structure_data:
            json_data["structure"] = structure_data
        
        # Add metadata
        json_data["metadata"] = {
            "created_at": datetime.utcnow().isoformat(),
            "repo_identifier": repo_identifier,
            "user_id": user_id
        }
        
        # Save JSON data
        json_saved = await file_manager.save_json_data(file_paths.json_file, json_data)
        if not json_saved:
            raise Exception("Failed to save JSON data")
        
        return file_paths
        
    except Exception as e:
        print(f"Error in save_repository_files: {e}")
        # Cleanup partially saved files
        await file_manager.delete_repository_files(user_id, repo_identifier)
        raise


def generate_repo_identifier(repo_url: Optional[str], zip_filename: Optional[str], branch: str = "main") -> str:
    """Generate a unique identifier for the repository using owner/repo/branch format."""
    if repo_url:
        from utils.repo_utils import parse_repo_url
        repo_info = parse_repo_url(repo_url)
        return f"{repo_info['owner']}/{repo_info['repo']}/{branch}"
    elif zip_filename:
        # Create a hash of the filename for consistency
        return f"zip_{hashlib.md5(zip_filename.encode()).hexdigest()[:8]}"
    return f"unknown_repo_{datetime.utcnow().timestamp()}"


def parse_repo_identifier(identifier: str) -> dict[str, str]:
    """Parse repository identifier into owner, repo, and branch components."""
    if '/' in identifier and identifier.count('/') >= 2:
        parts = identifier.split('/')
        return {
            "owner": parts[0],
            "repo": parts[1], 
            "branch": parts[2] if len(parts) > 2 else "main"
        }
    # Handle legacy format owner_repo_branch for backward compatibility
    elif '_' in identifier:
        parts = identifier.split('_')
        if len(parts) >= 3:
            # Rejoin middle parts in case repo name contains underscores
            return {
                "owner": parts[0],
                "repo": '_'.join(parts[1:-1]),
                "branch": parts[-1]
            }
    return {"owner": "unknown", "repo": "repository", "branch": "main"}


def sanitize_identifier_for_filesystem(identifier: str) -> str:
    """Convert repository identifier to filesystem-safe format."""
    return identifier.replace('/', '_')


def calculate_file_hash(file_path: str, algorithm: str = "md5") -> Optional[str]:
    """Calculate hash of a file."""
    try:
        hash_obj = hashlib.new(algorithm)
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()
    except Exception as e:
        print(f"Error calculating hash for {file_path}: {e}")
        return None


# Create a global instance for easy access
file_manager = FileManager()