from fastapi import APIRouter, HTTPException, Form, Depends
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional, AsyncGenerator, Annotated
import time
import asyncio
import os
import json
from concurrent.futures import ThreadPoolExecutor
from documentation_generator.core import DocumentationGenerator
from middleware.auth_middleware import require_auth
from models.user import User
from models.repository import Repository
from beanie.operators import Or
from beanie import PydanticObjectId
from datetime import datetime
import re
from cryptography.fernet import Fernet

# from utils.file_utils import get_user

from schemas.documentation_schemas import (
    WikiGenerationResponse,
    TaskStatus,
    RepositoryDocsResponse,
    IsWikiGeneratedResponse,
)

from models.chat import UserApiKey
from utils.repo_utils import find_user_repository

router = APIRouter(prefix="/documentation")

# TODO: Global storage for task results (in production, use Redis or a database)
task_results: Dict[str, Dict[str, Any]] = {}

# SSE progress streaming storage
progress_streams: Dict[str, list] = {}

# Cancellation flags for running tasks
cancellation_flags: Dict[str, bool] = {}

# Thread pool for CPU-bound tasks
executor = ThreadPoolExecutor(max_workers=4)

def create_progress_callback(task_id: str):
    """Create a progress callback function for streaming updates"""
    def progress_callback(message: str):
        # Check for cancellation first
        if cancellation_flags.get(task_id, False):
            raise Exception("Generation cancelled by user")
            
        timestamp = time.time()
        progress_event = {
            "timestamp": timestamp,
            "message": message,
            "task_id": task_id
        }
        
        # Store progress update
        if task_id in progress_streams:
            progress_streams[task_id].append(progress_event)
            
        # Also update task status if it's a key message
        if task_id in task_results:
            task_results[task_id]["message"] = message
            
    return progress_callback


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Parse GitHub URL to extract owner and repository name.
    Handles various GitHub URL formats:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - https://github.com/owner/repo/
    - git@github.com:owner/repo.git
    """
    if not url:
        raise ValueError("Repository URL cannot be empty")

    # Handle SSH URLs
    if url.startswith("git@github.com:"):
        # Extract from SSH format: git@github.com:owner/repo.git
        match = re.match(r"git@github\.com:([^/]+)/([^/.]+)(?:\.git)?", url)
        if match:
            return match.group(1), match.group(2)
        else:
            raise ValueError("Invalid SSH GitHub URL format")

    # Handle HTTPS URLs
    if "github.com" in url:
        # Clean up the URL
        url = url.rstrip("/")

        # Extract path from URL
        if "github.com/" in url:
            path_part = url.split("github.com/", 1)[1]
            path_segments = path_part.split("/")

            if len(path_segments) >= 2:
                repo_owner = path_segments[0]
                repo_name = path_segments[1]

                # Remove .git extension if present
                if repo_name.endswith(".git"):
                    repo_name = repo_name[:-4]

                # Validate owner and repo name
                if not repo_owner or not repo_name:
                    raise ValueError("Invalid repository owner or name")

                return repo_owner, repo_name
            else:
                raise ValueError(
                    "Invalid GitHub repository URL format - missing owner or repository name"
                )
        else:
            raise ValueError("Invalid GitHub URL format")
    else:
        raise ValueError("Currently only GitHub repositories are supported")


@router.get(
    "/progress-stream/{task_id}",
    summary="Stream wiki generation progress",
    description="Server-Sent Events endpoint for real-time wiki generation progress updates.",
)
async def stream_wiki_progress(task_id: str):
    """Stream real-time progress updates for wiki generation via SSE"""
    
    async def generate_progress_stream() -> AsyncGenerator[str, None]:
        last_sent_index = 0
        
        while True:
            # Check if task exists
            if task_id not in task_results:
                yield 'data: {"error": "Task not found"}\n\n'
                break
                
            task = task_results[task_id]
            
            # Send any new progress updates
            if task_id in progress_streams:
                progress_updates = progress_streams[task_id]
                
                # Send new progress updates
                for i in range(last_sent_index, len(progress_updates)):
                    update = progress_updates[i]
                    yield f"data: {json.dumps(update)}\\n\\n"
                    
                last_sent_index = len(progress_updates)
            
            # Send task status update
            status_update = {
                "type": "status",
                "task_id": task_id,
                "status": task["status"],
                "message": task["message"],
                "timestamp": time.time()
            }
            yield f"data: {json.dumps(status_update)}\\n\\n"
            
            # Check if task is complete or cancelled
            if task["status"] in ["completed", "failed", "cancelled"]:
                completion_update = {
                    "type": "complete",
                    "task_id": task_id,
                    "status": task["status"],
                    "final_message": task["message"],
                    "error": task.get("error"),
                    "timestamp": time.time()
                }
                yield f"data: {json.dumps(completion_update)}\\n\\n"
                break
            
            # Wait before next update
            await asyncio.sleep(2)
    
    return StreamingResponse(
        generate_progress_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@router.post(
    "/cancel-generation/{task_id}",
    summary="Cancel wiki generation",
    description="Cancel an ongoing wiki generation task.",
)
async def cancel_wiki_generation(
    task_id: str,
    current_user: Annotated[User, Depends(require_auth)],
):
    """Cancel an ongoing wiki generation task"""
    try:
        # User is already authenticated via middleware
        user = current_user
        
        # Check if task exists and belongs to user
        if task_id not in task_results:
            raise HTTPException(status_code=404, detail="Task not found")
        
        task = task_results[task_id]
        
        # Verify user owns this task (via repo ownership)
        repo = await Repository.find_one(Repository.id == task["repo_id"])
        if not repo or repo.user.id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Cancel the task
        if task["status"] in ["pending", "running"]:
            # Set cancellation flag
            cancellation_flags[task_id] = True
            
            task_results[task_id].update({
                "status": "cancelled",
                "message": "Task cancelled by user",
                "completed_at": time.time(),
            })
            
            # Add cancellation event to progress stream
            if task_id in progress_streams:
                progress_streams[task_id].append({
                    "timestamp": time.time(),
                    "message": "🛑 Generation cancelled by user",
                    "task_id": task_id,
                    "type": "cancelled"
                })
            
            return {"success": True, "message": "Task cancelled successfully"}
        else:
            return {"success": False, "message": f"Cannot cancel task with status: {task['status']}"}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/generate-wiki",
    response_model=WikiGenerationResponse,
    summary="Generate wiki documentation",
    description="Starts the process of generating wiki documentation for a given repository. The task runs in the background, and a task ID is returned to track its progress.",
    response_description="Task ID and status of the wiki generation process.",
    responses={
        202: {
            "model": WikiGenerationResponse,
            "description": "Wiki generation task accepted and started.",
        },
        400: {"description": "Bad request. Invalid input parameters."},
        500: {"description": "Internal server error."},
    },
)
async def generate_wiki(
    current_user: Annotated[User, Depends(require_auth)],
    repository_url: str = Form(
        ..., description="URL of the repository to generate documentation for"
    ),
    language: Optional[str] = Form("en", description="Language for the documentation"),
    comprehensive: Optional[bool] = Form(
        True, description="Whether to generate comprehensive documentation"
    ),
    provider_name: Optional[str] = Form(
        "gemini", description="Provider name for the documentation generation (openai, anthropic, gemini)"
    ),
    model_name: Optional[str] = Form(
        None, description="Specific model name to use for generation"
    ),
    temperature: Optional[float] = Form(
        0.7, description="Temperature for AI generation (0.0-1.5)"
    )
):
    """Generate wiki documentation for a repository"""

    # User is already authenticated via middleware
    user = current_user

    # Extract and validate repository information
    try:
        # Parse the repository URL to get owner and repo name
        repo_owner, repo_name = parse_github_url(repository_url)

        # Set output directory based on repo info
        repo = await Repository.find_one(
            Or(
                Repository.user == PydanticObjectId(user.id),
                Repository.github_url == repository_url.lower(),
            ),
        )

        if not repo:
            raise HTTPException(
                status_code=404, detail="Repository not found for the user"
            )

        # Use the repository's documentation base path
        output_dir = repo.file_paths.documentation_base_path

    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to parse repository URL: {str(e)}"
        )

    # --- Enhanced Multi-Provider API Key Logic ---
    api_key = None
    
    # Normalize provider name
    provider_name = provider_name.lower() if provider_name else "gemini"
    
    # Get user's API key for the selected provider
    user_api_key = await UserApiKey.find_one(
        UserApiKey.user.id == user.id,
        UserApiKey.provider == provider_name,
    )

    if user_api_key:
        encryption_key = os.getenv("ENCRYPTION_KEY", Fernet.generate_key())
        cipher_suite = Fernet(encryption_key)
        api_key = cipher_suite.decrypt(user_api_key.encrypted_key).decode()

    # Fallback to system keys based on provider
    if not api_key:
        system_keys = {
            "openai": os.getenv("OPENAI_API_KEY"),
            "anthropic": os.getenv("ANTHROPIC_API_KEY"), 
            "gemini": os.getenv("GEMINI_API_KEY"),
        }
        api_key = system_keys.get(provider_name)

    # If no key is found, try fallback providers
    original_provider = provider_name
    if not api_key:
        # Try fallback providers in order of preference
        fallback_providers = ["gemini", "openai", "anthropic"]
        if provider_name in fallback_providers:
            fallback_providers.remove(provider_name)
        
        for fallback in fallback_providers:
            fallback_key = system_keys.get(fallback)
            if fallback_key:
                api_key = fallback_key
                provider_name = fallback
                print(f"Falling back to {fallback.upper()} provider")
                break
        
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_type": "no_api_key",
                    "message": f"No API key found for {original_provider.upper()} or fallback providers. Please add a valid API key in settings.",
                    "provider": original_provider
                }
            )
    # --- End of API Key Logic ---


    try:
        # Generate unique task ID
        task_id = f"wiki_{hash(repository_url)}_{int(time.time())}"

        # Initialize task status and progress stream
        task_results[task_id] = {
            "task_id": task_id,
            "repo_id": repo.id,
            "status": "pending",
            "message": "Wiki generation task queued",
            "result": None,
            "error": None,
            "created_at": time.time(),
            "completed_at": None,
        }
        
        # Initialize progress stream and cancellation flag
        progress_streams[task_id] = []
        cancellation_flags[task_id] = False

        # Start the background task using asyncio.create_task (better approach)
        asyncio.create_task(
            _generate_wiki_background(
                task_id, repository_url, output_dir, language, comprehensive, 
                api_key, provider_name, model_name, temperature
            )
        )

        return WikiGenerationResponse(
            status="accepted", message="Wiki generation started", task_id=task_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _generate_wiki_background(
    task_id: str, repo_url: str, output_dir: str, language: str, comprehensive: bool, 
    api_key: str, provider: str = "gemini", model: str = None, temperature: float = 0.7
):
    """Background task for wiki generation using asyncio"""
    try:
        # Update status to running
        task_results[task_id]["status"] = "running"
        task_results[task_id]["message"] = "Wiki generation in progress"

        # Run the CPU-bound task in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            executor,
            _run_wiki_generation,
            task_id,
            repo_url,
            output_dir,
            language,
            comprehensive,
            api_key,
            provider,
            model,
            temperature
        )

        # Update task status on success
        task_results[task_id].update(
            {
                "status": "completed",
                "message": "Wiki generation completed successfully",
                "completed_at": time.time(),
            }
        )

    except Exception as e:
        # Update task status on error
        task_results[task_id].update(
            {
                "status": "failed",
                "message": "Wiki generation failed",
                "error": str(e),
                "completed_at": time.time(),
            }
        )


def _run_wiki_generation(
    task_id: str, repo_url: str, output_dir: str, language: str, comprehensive: bool, 
    api_key: str, provider: str = "gemini", model: str = None, temperature: float = 0.7
):
    """Synchronous function to run the actual wiki generation"""
    try:
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

        # Create progress callback for this task
        progress_callback = create_progress_callback(task_id)
        
        generator = DocumentationGenerator(
            api_key=api_key,
            provider=provider,
            model=model,
            temperature=temperature,
            progress_callback=progress_callback
        )
        result = generator.generate_complete_wiki(
            repo_url_or_path=repo_url, output_dir=output_dir, language=language
        )
        return result
    except Exception as e:
        raise e


def find_task_by_repo_id(repo_id: str):
    for task in task_results.values():
        if task.get("repo_id") == repo_id:
            return task
    return None


@router.post(
    "/wiki-status",
    response_model=TaskStatus,
    summary="Get wiki generation status",
    description="Retrieves the current status of a wiki generation task using the provided task ID.",
    response_description="Current status of the wiki generation task.",
    responses={
        200: {"description": "Task status retrieved successfully."},
        404: {"description": "Task ID not found."},
        500: {"description": "Internal server error."},
    },
)
async def get_wiki_status(
    current_user: Annotated[User, Depends(require_auth)],
    repo_id: str = Form(
        ..., description="ID of the repository to check wiki generation status for"
    ),
):
    """Get the status of a wiki generation task"""
    try:
        # User is already authenticated via middleware
        user = current_user

        # Resolve repository using the same helper as chat
        repo = await find_user_repository(repo_id, user)

        # Find task by resolved repository id
        task = find_task_by_repo_id(repo.id)
        if not task:
            raise HTTPException(
                status_code=404, detail="No task found for the given repo_id"
            )

        return TaskStatus(**task)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/is-wiki-generated",
    summary="Check if wiki documentation is generated",
    description="Checks if wiki documentation has been generated for a specific repository.",
    response_description="Boolean indicating if wiki documentation is generated.",
    response_model=IsWikiGeneratedResponse,
)
async def is_wiki_generated(
    current_user: Annotated[User, Depends(require_auth)],
    repo_id: str = Form(
        ..., description="ID of the repository to check wiki generation status for"
    ),
):
    """Check if wiki documentation has been generated for a repository"""
    try:
        # User is already authenticated via middleware
        user = current_user
        
        print(f"User: {user}")

        # Resolve repository using the same helper as chat
        repo = await find_user_repository(repo_id, user)

        doc_dir = repo.file_paths.documentation_base_path

        # Check if there's any documentation generation under process
        task = find_task_by_repo_id(repo.id)
        if task and task["status"] in ["running", "pending"]:
            return IsWikiGeneratedResponse(
                is_generated=False,
                status=task["status"],
                message="Wiki generation is currently in progress",
            )

        # Check if there's a failed task
        if task and task["status"] == "failed":
            return IsWikiGeneratedResponse(
                is_generated=False,
                status="failed",
                message="Wiki generation failed",
                error=task.get("error", "Unknown error occurred during generation"),
            )

        # Check if documentation directory exists and has content
        if os.path.exists(doc_dir):
            # Check if readme.md file exists
            readme_path = os.path.join(doc_dir, "readme.md")
            if os.path.exists(readme_path):
                return IsWikiGeneratedResponse(
                    is_generated=True,
                    status="completed",
                    message="Wiki documentation has been generated",
                )

        # If no documentation found and no active/failed tasks
        return IsWikiGeneratedResponse(
            is_generated=False,
            status="not_started",
            message="Wiki documentation has not been generated yet",
        )

    except HTTPException:
        raise
    except Exception as e:
        return IsWikiGeneratedResponse(
            is_generated=False,
            status="error",
            message="Error checking wiki generation status",
            error=str(e),
        )


@router.post(
    "/repository-docs",
    summary="List repository documentation files",
    description="Lists all documentation files for a specific repository with parsed content.",
    response_description="Structured documentation data for the repository.",
    response_model=RepositoryDocsResponse,
)
async def list_repository_docs(
    current_user: Annotated[User, Depends(require_auth)],
    repo_id: str = Form(
        ..., description="ID of the repository to list documentation files for"
    ),
):
    """List all documentation files for a repository with parsed README content"""
    try:
        # User is already authenticated via middleware
        user = current_user

        # Resolve repository using the same helper as chat
        repo = await find_user_repository(repo_id, user)

        # Get documentation directory
        doc_dir = repo.file_paths.documentation_base_path
        if not os.path.exists(doc_dir):
            return {
                "success": False,
                "data": {
                    "repository": {
                        "id": repo_id,
                        "name": repo.repo_name,
                        "directory": doc_dir,
                    },
                    "analysis": {},
                    "navigation": {"sidebar": [], "total_pages": 0},
                    "content": {},
                    "folder_structure": [],
                },
                "message": "No documentation generated yet",
            }

        # Parse README.md file
        readme_path = os.path.join(doc_dir, "readme.md")
        sidebar = []
        repo_analysis = {}

        if os.path.exists(readme_path):
            with open(readme_path, "r", encoding="utf-8") as f:
                readme_content = f.read()

            # Parse repository analysis section
            repo_analysis = parse_repository_analysis(readme_content)

            # Parse documentation pages (sidebar)
            sidebar = parse_documentation_pages(readme_content)

        # List all markdown files in the directory with their content (including nested)
        files = {}
        folder_structure = []

        for root, dirs, filenames in os.walk(doc_dir):
            for file in filenames:
                if file.endswith(".md"):
                    file_path = os.path.join(root, file)
                    file_size = os.path.getsize(file_path)
                    file_modified = datetime.fromtimestamp(os.path.getmtime(file_path))

                    # Read file content
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    # Create relative path from doc_dir as key
                    relative_path = os.path.relpath(file_path, doc_dir)
                    file_key = relative_path.replace(".md", "").replace(
                        os.path.sep, "/"
                    )
                    directory = (
                        os.path.dirname(relative_path)
                        if os.path.dirname(relative_path)
                        else "/"
                    )

                    files[file_key] = {
                        "metadata": {
                            "filename": file,
                            "relative_path": relative_path,
                            "directory": directory,
                            "size": file_size,
                            "modified": file_modified.isoformat(),
                            "type": "markdown",
                        },
                        "content": content,
                        "preview": (
                            content[:200] + "..." if len(content) > 200 else content
                        ),
                        "word_count": len(content.split()),
                        "read_time": max(1, len(content.split()) // 200),
                    }

        # Build folder structure for frontend
        folder_structure = build_folder_structure(files)

        return {
            "success": True,
            "data": {
                "repository": {
                    "id": repo_id,
                    "name": repo.repo_name,
                    "directory": doc_dir,
                },
                "folder_structure": folder_structure,
                "analysis": repo_analysis,
                "navigation": {"sidebar": sidebar, "total_pages": len(files)},
                "content": files,
            },
            "message": "Documentation loaded successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def build_folder_structure(files: dict) -> list:
    """Build a hierarchical folder structure for frontend display"""
    structure = []
    folders = {}

    for file_key, file_data in files.items():
        path_parts = file_key.split("/")
        current_level = structure
        current_path = ""

        # Navigate/create folder structure
        for i, part in enumerate(path_parts[:-1]):  # Exclude the filename
            current_path = "/".join(path_parts[: i + 1])

            # Find or create folder at current level
            folder = None
            for item in current_level:
                if item["type"] == "folder" and item["name"] == part:
                    folder = item
                    break

            if not folder:
                folder = {
                    "type": "folder",
                    "name": part,
                    "path": current_path,
                    "children": [],
                    "file_count": 0,
                    "is_expanded": False,  # Frontend can use this for collapse/expand
                }
                current_level.append(folder)
                folders[current_path] = folder

            current_level = folder["children"]

        # Add the file
        filename = path_parts[-1]
        file_item = {
            "type": "file",
            "name": filename,
            "path": file_key,
            "filename": file_data["metadata"]["filename"],
            "size": file_data["metadata"]["size"],
            "modified": file_data["metadata"]["modified"],
            "word_count": file_data["word_count"],
            "read_time": file_data["read_time"],
        }
        current_level.append(file_item)

        # Update file count for parent folders
        for folder_path in folders:
            if file_key.startswith(folder_path):
                folders[folder_path]["file_count"] += 1

    # Sort structure: folders first, then files, both alphabetically
    def sort_structure(items):
        items.sort(key=lambda x: (x["type"] == "file", x["name"].lower()))
        for item in items:
            if item["type"] == "folder":
                sort_structure(item["children"])

    sort_structure(structure)
    return structure


def parse_repository_analysis(readme_content: str) -> dict:
    """Parse the repository analysis section from README content"""
    analysis = {}

    # Extract Repository Analysis section
    analysis_match = re.search(
        r"## 📊 Repository Analysis\n\n(.*?)(?=\n##|\n---|\Z)",
        readme_content,
        re.DOTALL,
    )
    if analysis_match:
        analysis_content = analysis_match.group(1)

        # Extract individual metrics
        domain_match = re.search(r"- \*\*Domain Type\*\*: (.+)", analysis_content)
        complexity_match = re.search(
            r"- \*\*Complexity Score\*\*: (.+)", analysis_content
        )
        languages_match = re.search(r"- \*\*Languages\*\*: (.+)", analysis_content)
        frameworks_match = re.search(r"- \*\*Frameworks\*\*: (.+)", analysis_content)
        pages_match = re.search(r"- \*\*Total Pages\*\*: (.+)", analysis_content)

        if domain_match:
            analysis["domain_type"] = domain_match.group(1).strip()
        if complexity_match:
            analysis["complexity_score"] = complexity_match.group(1).strip()
        if languages_match:
            analysis["languages"] = languages_match.group(1).strip()
        if frameworks_match:
            analysis["frameworks"] = frameworks_match.group(1).strip()
        if pages_match:
            analysis["total_pages"] = pages_match.group(1).strip()

    return analysis


def parse_documentation_pages(readme_content: str) -> list:
    """Parse the documentation pages section to create sidebar navigation"""
    sidebar = []

    # Extract Documentation Pages section
    pages_match = re.search(
        r"## 📖 Documentation Pages\n\n(.*?)(?=\n##|\n---|\Z)",
        readme_content,
        re.DOTALL,
    )
    if pages_match:
        pages_content = pages_match.group(1)

        # Find all markdown links
        link_pattern = r"- \[([^\]]+)\]\(([^)]+)\)"
        matches = re.findall(link_pattern, pages_content)

        for title, filename in matches:
            # Extract emoji and clean title
            emoji_match = re.match(r"([^\w\s]+)\s*(.+)", title)
            if emoji_match:
                emoji = emoji_match.group(1).strip()
                clean_title = emoji_match.group(2).strip()
            else:
                emoji = "📄"
                clean_title = title.strip()

            sidebar.append(
                {
                    "title": clean_title,
                    "filename": filename,
                    "emoji": emoji,
                    "url": f"/docs/{filename}",
                }
            )

    return sidebar
