from fastapi import BackgroundTasks, HTTPException, Form, File, UploadFile
from typing import Optional, List, Dict, Any, Set
from datetime import datetime
import os
from pathlib import Path
import io
import requests

from schemas.response_schemas import (
    TextResponse,
    GraphResponse,
    StructureResponse,
    FileData,
)
from utils.repo_utils import (
    _process_input,
    smart_filter_files,
    format_repo_contents,
    cleanup_temp_files,
    parse_repo_url,
    format_repo_structure,
)
from utils.file_utils import (
    save_repository_files,
    generate_repo_identifier,
    file_manager,
)
from gitvizz import GraphGenerator
from models.repository import Repository
from models.user import User


"""
Controller module for handling repository-related operations.

Includes endpoints for:
- Generating LLM-friendly text from a code repository or ZIP file (/api/generate-text)
- Generating a graph representation of the repository structure (/api/generate-graph)
- Generating the file structure and content of a code repository (/api/generate-structure)

These endpoints process uploaded ZIP files or remote GitHub/repo URLs,
extract code content, and return structured output suitable for further analysis.
Supports user-based caching when JWT token is provided.

Used by: routes/repo_routes.py
"""


async def get_repository_default_branch(
    repo_url: str, access_token: Optional[str] = None
) -> str:
    """Get the default branch for a GitHub repository."""
    try:
        repo_info = parse_repo_url(repo_url)
        if repo_info["owner"] == "unknown":
            return "main"  # fallback

        api_url = (
            f"https://api.github.com/repos/{repo_info['owner']}/{repo_info['repo']}"
        )
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": os.getenv("GITHUB_USER_AGENT", "fastapi-app"),
        }

        if access_token and access_token.strip() and access_token != "string":
            headers["Authorization"] = f"token {access_token}"

        response = requests.get(api_url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json().get("default_branch", "main")
        else:
            print(
                f"Could not fetch default branch for {repo_url}, using 'main' as fallback"
            )
            return "main"
    except Exception as e:
        print(f"Error getting default branch for {repo_url}: {str(e)}")
        return "main"


async def validate_branch_exists(
    repo_url: str, branch: str, access_token: Optional[str] = None
) -> bool:
    """Check if a specific branch exists in the repository."""
    try:
        repo_info = parse_repo_url(repo_url)
        if repo_info["owner"] == "unknown":
            return False

        api_url = f"https://api.github.com/repos/{repo_info['owner']}/{repo_info['repo']}/branches/{branch}"
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": os.getenv("GITHUB_USER_AGENT", "fastapi-app"),
        }

        if access_token and access_token.strip() and access_token != "string":
            headers["Authorization"] = f"token {access_token}"

        response = requests.get(api_url, headers=headers, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"Error validating branch {branch} for {repo_url}: {str(e)}")
        return False


async def resolve_branch(
    repo_url: str, requested_branch: Optional[str], access_token: Optional[str] = None
) -> str:
    """
    Resolve the branch to use for a repository.

    Priority:
    1. If requested_branch is provided and exists, use it
    2. If requested_branch is provided but doesn't exist, fall back to default branch
    3. If no requested_branch, use repository's default branch
    """
    if not repo_url or "github.com" not in repo_url:
        return requested_branch or "main"

    try:
        # If a specific branch was requested, check if it exists
        if requested_branch and requested_branch not in ["main", ""]:
            branch_exists = await validate_branch_exists(
                repo_url, requested_branch, access_token
            )
            if branch_exists:
                print(f"Using requested branch '{requested_branch}' for {repo_url}")
                return requested_branch
            else:
                print(
                    f"Requested branch '{requested_branch}' not found, falling back to default branch"
                )

        # Get the repository's default branch
        default_branch = await get_repository_default_branch(repo_url, access_token)
        print(f"Using default branch '{default_branch}' for {repo_url}")
        return default_branch

    except Exception as e:
        print(f"Error resolving branch for {repo_url}: {str(e)}")
        return requested_branch or "main"


async def get_latest_commit_sha(
    repo_url: str, branch: str = "main", access_token: Optional[str] = None
) -> Optional[str]:
    """Get the latest commit SHA for a GitHub repository branch."""
    try:
        repo_info = parse_repo_url(repo_url)
        if repo_info["owner"] == "unknown":
            return None

        # Resolve the actual branch to use
        resolved_branch = await resolve_branch(repo_url, branch, access_token)

        api_url = f"https://api.github.com/repos/{repo_info['owner']}/{repo_info['repo']}/branches/{resolved_branch}"
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": os.getenv("GITHUB_USER_AGENT", "fastapi-app"),
        }

        # Only add authorization header if we have a valid access token
        if access_token and access_token.strip() and access_token != "string":
            headers["Authorization"] = f"token {access_token}"

        response = requests.get(api_url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()["commit"]["sha"]
        elif response.status_code == 401 and access_token:
            # If we got 401 with a token, the token might be invalid
            print(
                f"Warning: GitHub API returned 401 with provided token for {repo_url}"
            )
            return None
        # For public repos without token, we might still get commit info from other sources
        # but for now, we'll return None and let the system work without commit tracking
        return None
    except Exception as e:
        print(f"Error getting commit SHA for {repo_url} branch {branch}: {str(e)}")
        return None


def is_valid_access_token(access_token: Optional[str]) -> bool:
    """Check if the access token is valid and not a placeholder."""
    return (
        access_token
        and access_token.strip()
        and access_token != "string"
        and len(access_token.strip()) > 10
    )


async def check_existing_repository(
    user: User, repo_identifier: str, commit_sha: Optional[str] = None
) -> Optional[Repository]:
    """Check if repository already exists for user and if it's up to date."""

    try:
        existing_repo = await Repository.find_one(
            Repository.user.id == user.id, Repository.repo_name == repo_identifier
        )

        if not existing_repo:
            return None

        # If we have a commit SHA and it's different, repo is outdated
        if commit_sha and existing_repo.commit_sha != commit_sha:
            return None

        # Validate that files still exist
        validation_result = await file_manager.validate_file_paths(
            existing_repo.file_paths
        )
        if not all(validation_result.values()):
            return None

        return existing_repo

    except Exception as e:
        print(f"Error in check_existing_repository: {e}")
        return None


async def get_zip_content_from_processing(
    repo_url: Optional[str],
    branch: str,
    zip_file: Optional[UploadFile],
    access_token: Optional[str],
) -> Optional[bytes]:
    """Extract ZIP content during processing for caching."""
    if zip_file:
        # If uploaded ZIP file, read its content
        zip_content = await zip_file.read()
        await zip_file.seek(0)  # Reset file pointer for later use
        return zip_content

    elif repo_url:
        # If GitHub URL, download the ZIP content
        try:
            actual_zip_url = repo_url  # fallback
            headers = {}

            if "github.com" in repo_url:
                repo_info = parse_repo_url(repo_url)
                owner, repo_name_from_url = repo_info["owner"], repo_info["repo"]

                if owner != "unknown":
                    # Resolve the actual branch to use
                    resolved_branch = await resolve_branch(
                        repo_url, branch, access_token
                    )

                    # Use GitHub API zipball URL with resolved branch
                    actual_zip_url = f"https://api.github.com/repos/{owner}/{repo_name_from_url}/zipball/{resolved_branch}"
                    headers = {
                        "Authorization": f"token {access_token}"
                        if access_token
                        and access_token.strip()
                        and access_token != "string"
                        else "",
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": os.getenv("GITHUB_USER_AGENT", "fastapi-app"),
                    }

                    # Remove empty Authorization header
                    if not headers["Authorization"]:
                        del headers["Authorization"]

            response = requests.get(
                actual_zip_url, stream=True, timeout=60, headers=headers
            )
            if response.status_code == 200:
                return response.content
            else:
                print(
                    f"Failed to download ZIP. Status: {response.status_code} URL: {actual_zip_url}"
                )

        except Exception as e:
            print(f"Error downloading ZIP content for caching: {e}")

    return None


async def save_and_cache_repository(
    user: User,
    repo_identifier: str,
    branch: str,
    commit_sha: Optional[str],
    repo_url: Optional[str],
    formatted_text: str,
    graph_data: Optional[dict] = None,
    structure_data: Optional[dict] = None,
    zip_content: Optional[bytes] = None,
) -> None:
    """Save repository data and create/update database record."""

    # Save files to storage
    file_paths = await save_repository_files(
        str(user.id),
        repo_identifier,
        formatted_text,
        graph_data=graph_data,
        structure_data=structure_data,
        zip_content=zip_content,
    )

    # Create or update repository record
    repo_data = {
        "user": user,
        "repo_name": repo_identifier,
        "branch": branch,
        "commit_sha": commit_sha,
        "source": "github" if repo_url else "zip",
        "github_url": repo_url,
        "file_paths": file_paths,
        "updated_at": datetime.utcnow(),
    }

    # Try to update existing or create new
    existing_repo = await Repository.find_one(
        Repository.user.id == user.id, Repository.repo_name == repo_identifier
    )

    if existing_repo:
        for key, value in repo_data.items():
            if key != "user":  # Don't update the user field
                setattr(existing_repo, key, value)
        await existing_repo.save()
        return existing_repo
    else:
        new_repo = Repository(**repo_data)
        await new_repo.save()
        return new_repo


async def generate_text_endpoint(
    background_tasks: BackgroundTasks,
    current_user: Optional[User],
    repo_url: Optional[str] = Form(
        None,
        description="URL to a downloadable ZIP of the repository (e.g., GitHub archive link).",
    ),
    branch: Optional[str] = Form(
        None,
        description="Branch to use if repo_url is a GitHub repository link. If not specified, uses the repository's default branch.",
    ),
    zip_file: Optional[UploadFile] = File(
        None, description="A ZIP file of the repository."
    ),
    access_token: Optional[str] = Form(
        None,
        description="Optional GitHub token for accessing private repositories.",
        example="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ),
) -> TextResponse:
    if not repo_url and not zip_file:
        raise HTTPException(
            status_code=400, detail="Either repo_url or zip_file must be provided."
        )

    if repo_url:
        repo_url = repo_url.lower()

    # User is already authenticated via middleware
    user = current_user

    # Resolve the actual branch to use
    resolved_branch = branch or "main"  # Default fallback
    if repo_url and "github.com" in repo_url:
        valid_token = access_token if is_valid_access_token(access_token) else None
        resolved_branch = await resolve_branch(repo_url, branch, valid_token)

    # Generate repository identifier with resolved branch
    repo_identifier = generate_repo_identifier(
        repo_url, zip_file.filename if zip_file else None, resolved_branch
    )

    # Get commit SHA if it's a GitHub repo AND we have a valid access token
    commit_sha = None
    if repo_url and "github.com" in repo_url and is_valid_access_token(access_token):
        commit_sha = await get_latest_commit_sha(
            repo_url, resolved_branch, access_token
        )

    # Check if user has this repository cached
    if user:
        existing_repo = await check_existing_repository(
            user, repo_identifier, commit_sha
        )
        if existing_repo:
            # Return cached content
            cached_content = await file_manager.load_text_content(
                existing_repo.file_paths.text
            )
            if cached_content:
                return TextResponse(
                    text_content=cached_content,
                    filename_suggestion=f"{repo_identifier}_content.txt",
                    repo_id=str(existing_repo.id),
                )

    temp_dirs_to_cleanup = []
    zip_content = None
    processed_zip_file = None

    try:
        # Handle zip file by creating a copy we can read multiple times
        if zip_file:
            zip_content = await zip_file.read()
            # Create a new UploadFile-like object from the bytes
            processed_zip_file = UploadFile(
                filename=zip_file.filename,
                file=io.BytesIO(zip_content),
                headers=zip_file.headers,
            )

        # Only pass access_token if it's valid
        valid_token = access_token if is_valid_access_token(access_token) else None

        extracted_files, temp_extract_dir, temp_dirs_created = await _process_input(
            repo_url,
            resolved_branch,  # Use resolved branch instead of branch
            processed_zip_file,  # Use our processed version
            access_token=valid_token,
        )
        temp_dirs_to_cleanup.extend(temp_dirs_created)

        if not extracted_files:
            raise HTTPException(
                status_code=404,
                detail="No files found in the provided repository source.",
            )

        filtered_files = smart_filter_files(extracted_files, temp_extract_dir)
        if not filtered_files:
            raise HTTPException(
                status_code=404,
                detail="No suitable source files found after filtering.",
            )

        formatted_text = format_repo_contents(filtered_files)

        # Save to database if user is authenticated
        if user:
            # We already have zip_content from the uploaded file or can get it from URL
            if not zip_content and repo_url:
                zip_content = await get_zip_content_from_processing(
                    repo_url, resolved_branch, None, valid_token
                )

            saved_repo = await save_and_cache_repository(
                user=user,
                repo_identifier=repo_identifier,
                branch=resolved_branch,  # Use resolved branch
                commit_sha=commit_sha,
                repo_url=repo_url,
                formatted_text=formatted_text,
                zip_content=zip_content,
            )

        filename_base = repo_identifier
        if repo_url:
            repo_info = parse_repo_url(repo_url)
            if repo_info.get("repo") and repo_info["repo"] != "repository":
                filename_base = f"{repo_info['owner']}_{repo_info['repo']}_{resolved_branch}_content"  # Use resolved branch
        elif zip_file and zip_file.filename:
            filename_base = f"{Path(zip_file.filename).stem}_content"

        background_tasks.add_task(cleanup_temp_files, temp_dirs_to_cleanup)
        return TextResponse(
            text_content=formatted_text,
            filename_suggestion=f"{filename_base}.txt",
            repo_id=str(saved_repo.id) if user else "",
        )

    except HTTPException as he:
        cleanup_temp_files(temp_dirs_to_cleanup)
        raise he
    except Exception as e:
        cleanup_temp_files(temp_dirs_to_cleanup)
        print(f"Error in generate_text_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating text: {str(e)}")
    finally:
        # Clean up the processed zip file
        if processed_zip_file and hasattr(processed_zip_file.file, "close"):
            processed_zip_file.file.close()


async def generate_graph_endpoint(
    background_tasks: BackgroundTasks,
    current_user: Optional[User],
    repo_url: Optional[str] = Form(
        None, description="URL to a downloadable ZIP of the repository."
    ),
    branch: Optional[str] = Form(
        None,
        description="Branch for GitHub repo URL. If not specified, uses the repository's default branch.",
    ),
    zip_file: Optional[UploadFile] = File(
        None, description="A ZIP file of the repository."
    ),
    access_token: Optional[str] = Form(
        None,
        description="Optional GitHub token for accessing private repositories.",
        example="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ),
) -> GraphResponse:
    if not repo_url and not zip_file:
        raise HTTPException(
            status_code=400, detail="Either repo_url or zip_file must be provided."
        )

    if repo_url:
        repo_url = repo_url.lower()

    # User is already authenticated via middleware
    user = current_user

    # Resolve the actual branch to use
    resolved_branch = branch or "main"  # Default fallback
    if repo_url and "github.com" in repo_url:
        valid_token = access_token if is_valid_access_token(access_token) else None
        resolved_branch = await resolve_branch(repo_url, branch, valid_token)

    # Generate repository identifier with resolved branch
    repo_identifier = generate_repo_identifier(
        repo_url, zip_file.filename if zip_file else None, resolved_branch
    )

    # Get commit SHA if it's a GitHub repo AND we have a valid access token
    commit_sha = None
    if repo_url and "github.com" in repo_url and is_valid_access_token(access_token):
        commit_sha = await get_latest_commit_sha(
            repo_url, resolved_branch, access_token
        )

    # Check if user has this repository cached
    if user:
        existing_repo = await check_existing_repository(
            user, repo_identifier, commit_sha
        )
        if existing_repo:
            # Return cached graph data
            cached_data = await file_manager.load_json_data(
                existing_repo.file_paths.json_file
            )
            if cached_data and "graph" in cached_data:
                return GraphResponse(**cached_data["graph"])

    temp_dirs_to_cleanup = []
    zip_content = None
    processed_zip_file = None

    try:
        # Handle zip file by reading content first and creating a reusable copy
        if zip_file:
            zip_content = await zip_file.read()
            # Create a new UploadFile-like object from the bytes
            processed_zip_file = UploadFile(
                filename=zip_file.filename,
                file=io.BytesIO(zip_content),
                headers=zip_file.headers,
            )

        # Only pass access_token if it's valid
        valid_token = access_token if is_valid_access_token(access_token) else None

        extracted_files, temp_extract_dir, temp_dirs_created = await _process_input(
            repo_url,
            resolved_branch,
            processed_zip_file,
            access_token=valid_token,  # Use resolved_branch
        )
        temp_dirs_to_cleanup.extend(temp_dirs_created)

        if not extracted_files:
            raise HTTPException(
                status_code=404,
                detail="No files found in the provided repository source.",
            )

        filtered_files = smart_filter_files(extracted_files, temp_extract_dir)
        if not filtered_files:
            raise HTTPException(
                status_code=404,
                detail="No suitable files for graph generation after filtering.",
            )

        # Generate graph data using the new from_source() method
        if zip_file:
            # For uploaded ZIP files, save to temp file and use from_source
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_zip:
                temp_zip.write(zip_content)
                temp_zip_path = temp_zip.name
            
            try:
                generator = GraphGenerator.from_source(
                    temp_zip_path,
                    file_extensions=['.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.go', '.rs', '.cpp', '.c'],
                    max_files=1000,  # Reasonable limit for backend processing
                    ignore_patterns=[
                        '**/node_modules/**', 
                        '**/__pycache__/**',
                        '**/dist/**',
                        '**/build/**',
                        '**/.git/**',
                        '**/coverage/**',
                        '**/*.min.js',
                        '**/*.map'
                    ]
                )
                graph_data = generator.generate()
            finally:
                # Cleanup temp ZIP file
                if os.path.exists(temp_zip_path):
                    os.unlink(temp_zip_path)
        
        elif repo_url:
            # For GitHub URLs, from_source can handle ZIP downloads directly
            try:
                # Build GitHub archive URL
                if "github.com" in repo_url:
                    repo_info = parse_repo_url(repo_url)
                    if repo_info["owner"] != "unknown":
                        zip_url = f"https://github.com/{repo_info['owner']}/{repo_info['repo']}/archive/refs/heads/{resolved_branch}.zip"
                    else:
                        zip_url = repo_url
                else:
                    zip_url = repo_url
                
                # Use from_source with URL - it will handle the download
                generator = GraphGenerator.from_source(
                    zip_url,
                    file_extensions=['.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.go', '.rs', '.cpp', '.c'],
                    max_files=1000,
                    ignore_patterns=[
                        '**/node_modules/**',
                        '**/__pycache__/**', 
                        '**/dist/**',
                        '**/build/**',
                        '**/.git/**',
                        '**/coverage/**',
                        '**/*.min.js',
                        '**/*.map'
                    ]
                )
                graph_data = generator.generate()
            except Exception as e:
                print(f"from_source failed for URL {repo_url}, falling back to traditional method: {e}")
                # Fallback to traditional method if from_source fails
                generator = GraphGenerator(files=filtered_files, output_html_path=None)
                graph_data = generator.generate()
        else:
            # Fallback to traditional method
            generator = GraphGenerator(files=filtered_files, output_html_path=None)
            graph_data = generator.generate()

        # Save to database if user is authenticated
        if user:
            formatted_text = format_repo_contents(
                filtered_files
            )  # Also generate text for storage

            # Use the zip_content we already read instead of calling get_zip_content_from_processing
            if not zip_content and repo_url:
                # Only fetch zip content if we don't have it and it's from a URL
                zip_content = await get_zip_content_from_processing(
                    repo_url, resolved_branch, None, valid_token
                )  # Use resolved_branch

            await save_and_cache_repository(
                user=user,
                repo_identifier=repo_identifier,
                branch=resolved_branch,  # Use resolved_branch
                commit_sha=commit_sha,
                repo_url=repo_url,
                formatted_text=formatted_text,
                graph_data=graph_data,
                zip_content=zip_content,
            )

        background_tasks.add_task(cleanup_temp_files, temp_dirs_to_cleanup)
        return GraphResponse(**graph_data)

    except HTTPException as he:
        cleanup_temp_files(temp_dirs_to_cleanup)
        raise he
    except Exception as e:
        cleanup_temp_files(temp_dirs_to_cleanup)
        raise HTTPException(status_code=500, detail=f"Error generating graph: {str(e)}")
    finally:
        # Clean up the processed zip file
        if processed_zip_file and hasattr(processed_zip_file.file, "close"):
            processed_zip_file.file.close()


async def generate_structure_endpoint(
    background_tasks: BackgroundTasks,
    current_user: Optional[User],
    repo_url: Optional[str] = Form(
        None, description="URL to a downloadable ZIP of the repository."
    ),
    branch: Optional[str] = Form(
        None,
        description="Branch for GitHub repo URL. If not specified, uses the repository's default branch.",
    ),
    zip_file: Optional[UploadFile] = File(
        None, description="A ZIP file of the repository."
    ),
    access_token: Optional[str] = Form(
        None,
        description="Optional GitHub token for accessing private repositories.",
        example="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ),
) -> StructureResponse:
    if not repo_url and not zip_file:
        raise HTTPException(
            status_code=400, detail="Either repo_url or zip_file must be provided."
        )

    if repo_url:
        repo_url = repo_url.lower()

    # User is already authenticated via middleware
    user = current_user

    # Resolve the actual branch to use
    resolved_branch = branch or "main"  # Default fallback
    if repo_url and "github.com" in repo_url:
        valid_token = access_token if is_valid_access_token(access_token) else None
        resolved_branch = await resolve_branch(repo_url, branch, valid_token)

    # Generate repository identifier with resolved branch
    repo_identifier = generate_repo_identifier(
        repo_url, zip_file.filename if zip_file else None, resolved_branch
    )

    # Get commit SHA if it's a GitHub repo AND we have a valid access token
    commit_sha = None
    if repo_url and "github.com" in repo_url and is_valid_access_token(access_token):
        commit_sha = await get_latest_commit_sha(
            repo_url, resolved_branch, access_token
        )

    # Check if user has this repository cached
    if user:
        existing_repo = await check_existing_repository(
            user, repo_identifier, commit_sha
        )
        if existing_repo:
            # Return cached structure data
            cached_data = await file_manager.load_json_data(
                existing_repo.file_paths.json_file
            )
            if cached_data and "structure" in cached_data:
                return StructureResponse(**cached_data["structure"])

    temp_dirs_to_cleanup = []
    try:
        # Only pass access_token if it's valid
        valid_token = access_token if is_valid_access_token(access_token) else None

        extracted_files, temp_extract_dir, temp_dirs_created = await _process_input(
            repo_url,
            resolved_branch,
            zip_file,
            access_token=valid_token,  # Use resolved_branch
        )
        temp_dirs_to_cleanup.extend(temp_dirs_created)

        if not extracted_files:
            raise HTTPException(
                status_code=404,
                detail="No files found in the provided repository source.",
            )

        relevant_files_for_structure = smart_filter_files(
            extracted_files, temp_extract_dir
        )

        if not relevant_files_for_structure:
            raise HTTPException(
                status_code=404,
                detail="No relevant files found for structure after filtering.",
            )

        directory_tree_string = format_repo_structure(relevant_files_for_structure)

        files_data_list: List[FileData] = []
        for file_info in relevant_files_for_structure:
            files_data_list.append(
                FileData(path=file_info["path"], content=file_info.get("content", ""))
            )

        structure_data = {
            "directory_tree": directory_tree_string,
            "files": [{"path": f.path, "content": f.content} for f in files_data_list],
        }

        # Save to database if user is authenticated
        if user:
            formatted_text = format_repo_contents(relevant_files_for_structure)
            zip_content = await get_zip_content_from_processing(
                repo_url, resolved_branch, zip_file, valid_token
            )  # Use resolved_branch

            await save_and_cache_repository(
                user=user,
                repo_identifier=repo_identifier,
                branch=resolved_branch,  # Use resolved_branch
                commit_sha=commit_sha,
                repo_url=repo_url,
                formatted_text=formatted_text,
                structure_data=structure_data,
                zip_content=zip_content,
            )

        background_tasks.add_task(cleanup_temp_files, temp_dirs_to_cleanup)
        return StructureResponse(
            directory_tree=directory_tree_string, files=files_data_list
        )

    except HTTPException as he:
        cleanup_temp_files(temp_dirs_to_cleanup)
        raise he
    except Exception as e:
        cleanup_temp_files(temp_dirs_to_cleanup)
        raise HTTPException(
            status_code=500, detail=f"Error generating structure and content: {str(e)}"
        )


def _build_id_index(nodes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {n["id"]: n for n in nodes}


def _ego_subgraph(
    full_nodes: List[Dict[str, Any]],
    full_edges: List[Dict[str, Any]],
    center_id: str,
    depth: int,
    rel_types: Optional[Set[str]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    id_to_node = _build_id_index(full_nodes)
    if center_id not in id_to_node:
        return {"nodes": [], "edges": []}

    # Build adjacency (both directions) with relationship filtering
    outgoing: Dict[str, List[Dict[str, Any]]] = {}
    incoming: Dict[str, List[Dict[str, Any]]] = {}
    for e in full_edges:
        if rel_types and e.get("relationship") not in rel_types:
            continue
        s = e["source"]
        t = e["target"]
        outgoing.setdefault(s, []).append(e)
        incoming.setdefault(t, []).append(e)

    visited: Set[str] = set()
    frontier: List[tuple[str, int]] = [(center_id, 0)]
    sub_nodes: Set[str] = set([center_id])
    sub_edges: List[Dict[str, Any]] = []

    while frontier:
        nid, d = frontier.pop(0)
        if nid in visited or d > depth:
            continue
        visited.add(nid)
        for e in outgoing.get(nid, []):
            sub_edges.append(e)
            sub_nodes.add(e["target"])
            if e["target"] not in visited and d + 1 <= depth:
                frontier.append((e["target"], d + 1))
        for e in incoming.get(nid, []):
            sub_edges.append(e)
            sub_nodes.add(e["source"])
            if e["source"] not in visited and d + 1 <= depth:
                frontier.append((e["source"], d + 1))

    unique_edges = []
    seen = set()
    for e in sub_edges:
        key = (e["source"], e["target"], e.get("relationship"))
        if key not in seen:
            seen.add(key)
            unique_edges.append(e)

    return {
        "nodes": [id_to_node[nid] for nid in sub_nodes if nid in id_to_node],
        "edges": unique_edges,
    }


def _filter_subgraph(
    full_nodes: List[Dict[str, Any]],
    full_edges: List[Dict[str, Any]],
    categories: Optional[Set[str]] = None,
    directories: Optional[List[str]] = None,
    rel_types: Optional[Set[str]] = None,
    min_degree: Optional[int] = None,
    limit: Optional[int] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    # Filter nodes first
    selected_nodes = []
    degrees: Dict[str, int] = {}
    for e in full_edges:
        if rel_types and e.get("relationship") not in rel_types:
            continue
        degrees[e["source"]] = degrees.get(e["source"], 0) + 1
        degrees[e["target"]] = degrees.get(e["target"], 0) + 1

    for n in full_nodes:
        if categories and (n.get("category") not in categories):
            continue
        if directories and n.get("file"):
            dirpath = n["file"].rsplit("/", 1)[0] if "/" in n["file"] else ""
            if not any(dirpath.startswith(d) for d in directories):
                continue
        if min_degree is not None and degrees.get(n["id"], 0) < min_degree:
            continue
        selected_nodes.append(n)
    selected_ids = {n["id"] for n in selected_nodes}

    filtered_edges = [
        e
        for e in full_edges
        if (not rel_types or e.get("relationship") in rel_types)
        and e["source"] in selected_ids
        and e["target"] in selected_ids
    ]

    if limit and len(selected_nodes) > limit:
        selected_nodes = selected_nodes[:limit]
        selected_ids = {n["id"] for n in selected_nodes}
        filtered_edges = [
            e
            for e in filtered_edges
            if e["source"] in selected_ids and e["target"] in selected_ids
        ]

    return {"nodes": selected_nodes, "edges": filtered_edges}


async def generate_subgraph_endpoint(
    background_tasks: BackgroundTasks,
    current_user: Optional[User],
    repo_url: Optional[str] = Form(
        None, description="URL to a downloadable ZIP of the repository."
    ),
    branch: Optional[str] = Form("main", description="Branch for GitHub repo URL."),
    access_token: Optional[str] = Form(None, description="Optional GitHub token."),
    # Subgraph params
    center_node_id: Optional[str] = Form(
        None, description="Center node id for ego network."
    ),
    depth: Optional[int] = Form(1, description="Traversal depth for ego network."),
    categories: Optional[str] = Form(
        None, description="Comma-separated categories filter."
    ),
    directories: Optional[str] = Form(
        None, description="Comma-separated directory prefixes filter."
    ),
    relationship_types: Optional[str] = Form(
        None, description="Comma-separated relationship types filter."
    ),
    min_degree: Optional[int] = Form(None, description="Minimum degree for nodes."),
    limit: Optional[int] = Form(500, description="Max nodes in subgraph."),
) -> GraphResponse:
    if not repo_url:
        raise HTTPException(
            status_code=400, detail="repo_url must be provided for subgraph generation."
        )

    repo_url = repo_url.lower()
    
    # User is already authenticated via middleware
    user = current_user

    repo_identifier = generate_repo_identifier(repo_url, None, branch)
    commit_sha = None
    if "github.com" in repo_url and is_valid_access_token(access_token):
        commit_sha = await get_latest_commit_sha(repo_url, branch, access_token)

    # Load cached graph
    if user:
        existing_repo = await check_existing_repository(
            user, repo_identifier, commit_sha
        )
        if existing_repo:
            cached_data = await file_manager.load_json_data(
                existing_repo.file_paths.json_file
            )
            if cached_data and "graph" in cached_data:
                full = cached_data["graph"]
                full_nodes: List[Dict[str, Any]] = full.get("nodes", [])  # type: ignore
                full_edges: List[Dict[str, Any]] = full.get("edges", [])  # type: ignore

                rel_types = (
                    set([s.strip() for s in relationship_types.split(",")])
                    if relationship_types
                    else None
                )
                cat_set = (
                    set([s.strip() for s in categories.split(",")])
                    if categories
                    else None
                )
                dirs = (
                    [s.strip() for s in directories.split(",")] if directories else None
                )

                subgraph: Dict[str, List[Dict[str, Any]]]
                if center_node_id:
                    subgraph = _ego_subgraph(
                        full_nodes,
                        full_edges,
                        center_node_id,
                        max(0, int(depth or 1)),
                        rel_types,
                    )
                    # Optional additional filtering on the ego result
                    if (
                        cat_set
                        or dirs
                        or rel_types
                        or min_degree is not None
                        or limit is not None
                    ):
                        subgraph = _filter_subgraph(
                            subgraph["nodes"],
                            subgraph["edges"],
                            categories=cat_set,
                            directories=dirs,
                            rel_types=rel_types,
                            min_degree=min_degree,
                            limit=limit,
                        )
                else:
                    subgraph = _filter_subgraph(
                        full_nodes,
                        full_edges,
                        categories=cat_set,
                        directories=dirs,
                        rel_types=rel_types,
                        min_degree=min_degree,
                        limit=limit,
                    )

                return GraphResponse(
                    html_url=full.get("html_url"),
                    nodes=subgraph["nodes"],
                    edges=subgraph["edges"],
                )

    raise HTTPException(
        status_code=404,
        detail="No cached graph available. Generate the full graph first.",
    )
