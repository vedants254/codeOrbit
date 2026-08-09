import os
import re
import tempfile
import shutil
import zipfile
import json
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from fastapi import UploadFile, HTTPException
import requests
from urllib.parse import urlparse
from config import CONFIG
from beanie import BeanieObjectId
from models.repository import Repository
from models.user import User

# =====================
# Utility Functions
# =====================

"""
Repository utilities for efficient lookup and management
"""


async def find_user_repository(repo_id: str, user: User, branch: Optional[str] = None) -> Repository:
    """
    Find repository by ID using ObjectId or repository identifier
    
    Args:
        repo_id: Repository ObjectId, identifier (format: owner/repo/branch or owner_repo_branch), or owner/repo format
        user: User object for access control
        branch: Optional branch name for more precise matching when repo_id is in owner/repo format
        
    Returns:
        Repository object
        
    Raises:
        HTTPException: If repository not found or access denied
    """
    # Validate repository_id is not empty or None
    if not repo_id or repo_id.strip() == "":
        raise HTTPException(
            status_code=400, 
            detail="Repository ID cannot be empty"
        )
    
    repo_id = repo_id.strip()  # Remove any leading/trailing whitespace
    
    try:
        # Try ObjectId format first (most efficient for database lookups)
        if len(repo_id) == 24:
            repository = await Repository.find_one(
                Repository.id == BeanieObjectId(repo_id),
                Repository.user.id == user.id
            )
            if repository:
                return repository
    except (ValueError, TypeError):
        # Invalid ObjectId format, continue with identifier lookup
        pass
    
    # Try exact repo_name match (for identifiers like "owner/repo/branch" or legacy "owner_repo_branch")
    repository = await Repository.find_one(
        Repository.repo_name == repo_id,
        Repository.user.id == user.id
    )
    
    # If not found by exact match, try parsing and reconstructing the identifier
    if not repository:
        from utils.file_utils import parse_repo_identifier
        parsed = parse_repo_identifier(repo_id)
        
        # If we successfully parsed it, try different formats
        if parsed["owner"] != "unknown":
            owner = parsed["owner"]
            repo_name = parsed["repo"]
            parsed_branch = parsed["branch"]
            
            # Try the new forward slash format first
            if branch:
                # Use provided branch parameter
                new_format_id = f"{owner}/{repo_name}/{branch}"
            else:
                # Use parsed branch or default
                new_format_id = f"{owner}/{repo_name}/{parsed_branch}"
            
            repository = await Repository.find_one(
                Repository.repo_name == new_format_id,
                Repository.user.id == user.id
            )
            
            # If not found with new format, try legacy underscore format for backward compatibility
            if not repository:
                if branch:
                    legacy_format_id = f"{owner}_{repo_name}_{branch}"
                else:
                    legacy_format_id = f"{owner}_{repo_name}_{parsed_branch}"
                
                repository = await Repository.find_one(
                    Repository.repo_name == legacy_format_id,
                    Repository.user.id == user.id
                )
            
            # If still not found, try common branches with both formats
            if not repository:
                for fallback_branch in ["main", "master", "develop"]:
                    # Skip the branch we already tried
                    if (branch and fallback_branch == branch) or fallback_branch == parsed_branch:
                        continue
                    
                    # Try new format
                    fallback_new_id = f"{owner}/{repo_name}/{fallback_branch}"
                    repository = await Repository.find_one(
                        Repository.repo_name == fallback_new_id,
                        Repository.user.id == user.id
                    )
                    if repository:
                        break
                    
                    # Try legacy format
                    fallback_legacy_id = f"{owner}_{repo_name}_{fallback_branch}"
                    repository = await Repository.find_one(
                        Repository.repo_name == fallback_legacy_id,
                        Repository.user.id == user.id
                    )
                    if repository:
                        break
    
    if not repository:
        raise HTTPException(
            status_code=404, 
            detail=f"Repository '{repo_id}' not found"
        )
        
    return repository


async def get_user_repositories(user: User, limit: int = 50) -> List[Repository]:
    """Get all repositories for a user"""
    return await Repository.find(
        Repository.user.id == user.id
    ).sort(-Repository.updated_at).limit(limit).to_list()


async def check_repository_access(repo_id: str, user: User) -> bool:
    """Check if user has access to repository without returning it"""
    try:
        await find_user_repository(repo_id, user)
        return True
    except HTTPException:
        return False

def parse_repo_url(repo_url: str) -> Dict[str, str]:
    """Parse GitHub repository URL into owner, repo, and optional branch/path."""
    pattern = r"github.com[:/](?P<owner>[^/]+)/(?P<repo>[^/#]+)(?:/(tree|blob)/(?P<last_string>.+))?"
    m = re.search(pattern, repo_url)
    if not m:
        return {
            "owner": "unknown",
            "repo": "repository",
            "last_string": "",
        }  # Default for non-matching URLs
    return m.groupdict(default="")

async def _process_input(
    repo_url: Optional[str],
    branch: Optional[str],
    zip_file: Optional[UploadFile],
    access_token: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], str, List[str]]:
    temp_zip_file_path: Optional[str] = None
    created_dirs_for_rmtree: List[str] = []
    headers = {}

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip_obj:
            temp_zip_file_path = temp_zip_obj.name

            if repo_url:
                parsed = urlparse(repo_url)
                if "github.com" in parsed.netloc.lower():
                    # Normalize repo URL
                    path_parts = parsed.path.strip("/").split("/")
                    if len(path_parts) < 2:
                        raise HTTPException(
                            status_code=400,
                            detail="Invalid GitHub repo URL format. Expected 'https://github.com/owner/repo'.",
                        )

                    owner, repo = path_parts[:2]
                    safe_branch = branch or "main"

                    actual_zip_url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{safe_branch}"

                    headers = {
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": os.getenv("GITHUB_USER_AGENT", "fastapi-app")
                    }
                    if access_token:
                        headers["Authorization"] = f"Bearer {access_token}"
                else:
                    # Direct ZIP link or unknown host
                    actual_zip_url = repo_url

                # Download ZIP
                r = requests.get(actual_zip_url, stream=True, timeout=60, headers=headers)
                if r.status_code != 200:
                    raise HTTPException(
                        status_code=r.status_code,
                        detail=f"Failed to download ZIP. Status: {r.status_code} URL: {actual_zip_url}"
                    )

                for chunk in r.iter_content(chunk_size=8192):
                    temp_zip_obj.write(chunk)

            elif zip_file:
                content = await zip_file.read()
                temp_zip_obj.write(content)
                await zip_file.close()

            else:
                raise HTTPException(
                    status_code=400,
                    detail="Either 'repo_url' or 'zip_file' must be provided."
                )

        # Extract
        extracted_files, temp_extract_dir_path = extract_zip_contents(temp_zip_file_path)
        created_dirs_for_rmtree.append(temp_extract_dir_path)

        return extracted_files, temp_extract_dir_path, created_dirs_for_rmtree

    except HTTPException:
        raise  # Pass through expected errors
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing input: {str(e)}"
        )
    finally:
        if temp_zip_file_path and os.path.exists(temp_zip_file_path):
            os.unlink(temp_zip_file_path)
  
                     

def extract_zip_contents(zip_file_path: str) -> tuple[List[dict], str]:
    """Extract files from a ZIP archive and return file list with paths."""
    temp_dir = tempfile.mkdtemp()
    files = []
    try:
        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
            zip_ref.extractall(temp_dir)
            for root, _, filenames in os.walk(temp_dir):
                for fname in filenames:
                    full_path = os.path.join(root, fname)
                    # Ensure rel_path is POSIX-style for consistency
                    rel_path = Path(os.path.relpath(full_path, temp_dir)).as_posix()
                    files.append({"path": rel_path, "full_path": full_path})
    except zipfile.BadZipFile:
        shutil.rmtree(temp_dir)  # Clean up extraction dir if zip is bad
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
    except Exception as e:
        shutil.rmtree(temp_dir)  # Clean up extraction dir on other errors
        raise HTTPException(status_code=500, detail=f"Failed to extract ZIP: {str(e)}")
    return files, temp_dir


def smart_filter_files(file_list: List[dict], temp_dir: str) -> List[dict]:
    """Filter files to include only source code and exclude images, binaries, etc.
    For .ipynb files, content is extracted from cells.
    """
    common_extensions = [
        ".py",
        ".js",
        ".ts",
        ".java",
        ".cpp",
        ".c",
        ".h",
        ".hpp",
        ".cs",
        ".go",
        ".rs",
        ".php",
        ".rb",
        ".swift",
        ".html",
        ".css",
        ".scss",
        ".json",
        ".yaml",
        ".yml",
        ".md",
        ".txt",
        ".xml",
        ".ini",
        ".conf",
        ".sh",
        ".bat",
        ".pl",
        ".toml",
        ".jsx",
        ".tsx",
        ".ipynb",
    ]
    blacklist_ext = [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".bmp",
        ".svg",
        ".ico",
        ".webp",
        ".tiff",
        ".mp3",
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".wav",
        ".flac",
        ".exe",
        ".dll",
        ".so",
        ".bin",
        ".obj",
        ".o",
        ".a",
        ".lib",
        ".class",
        ".jar",
        ".pdf",
        ".zip",  # Exclude .zip from content processing
    ]
    filtered_files = []
    for file_info in file_list:
        ext = Path(file_info["path"]).suffix.lower()

        # full_path should already be correct from extract_zip_contents
        full_path = file_info["full_path"]

        if not os.path.exists(
            full_path
        ):  # Should not happen if extract_zip_contents is robust
            continue

        if (
            ext in common_extensions
            and ext not in blacklist_ext
            and not any(
                part.startswith(".")
                for part in Path(file_info["path"]).parts
                if part != Path(file_info["path"]).name
            )  # Allow hidden files, but not in hidden dirs
            and os.path.getsize(full_path) <= CONFIG["max_file_size"]
            and os.path.getsize(full_path) > 0  # Exclude empty files
        ):
            try:
                if ext == ".ipynb":
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        notebook_json_content = f.read()

                    parsed_notebook = json.loads(notebook_json_content)
                    all_cell_content_for_text_dump = []
                    python_code_for_graphing = []

                    for cell_idx, cell in enumerate(parsed_notebook.get("cells", [])):
                        cell_type = cell.get("cell_type")
                        source_list = cell.get("source", [])
                        cell_source_text = "".join(source_list)
                        all_cell_content_for_text_dump.append(
                            f"# CELL {cell_idx + 1}: {cell_type}\n{cell_source_text}\n"
                        )
                        if cell_type == "code":
                            # Basic check for python magic before adding to python_equivalent_content
                            lines = cell_source_text.splitlines()
                            if not any(
                                line.strip().startswith("%")
                                or line.strip().startswith("!")
                                for line in lines
                            ):
                                python_code_for_graphing.append(cell_source_text + "\n")

                    file_info["content"] = "\n".join(all_cell_content_for_text_dump)
                    file_info["python_equivalent_content"] = "".join(
                        python_code_for_graphing
                    )
                else:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        file_info["content"] = f.read()

                filtered_files.append(file_info)
            except json.JSONDecodeError:
                # print(f"Skipping file {file_info['path']} due to JSON decode error (likely invalid .ipynb).")
                continue
            except Exception:
                # print(f"Skipping file {file_info['path']} due to error during content processing: {e}")
                continue
    return filtered_files


def format_repo_structure(files: List[dict]) -> str:
    """Format repository directory structure into text."""
    text = "Directory Structure:\n\n"
    tree = {}
    for file_item in files:  # Renamed 'file' to 'file_item' to avoid conflict
        parts = file_item["path"].split("/")
        current_level = tree
        for i, part in enumerate(parts):
            if part not in current_level:
                current_level[part] = {} if i < len(parts) - 1 else None
            current_level = current_level[part] if i < len(parts) - 1 else current_level

    def build_index(node, prefix="", depth=0):
        result = ""
        # Sort entries: folders first, then files, all alphabetically
        entries = sorted(node.items(), key=lambda x: (x[1] is None, x[0].lower()))
        for i, (name, subnode) in enumerate(entries):
            is_last = i == len(entries) - 1
            line_prefix = "└── " if is_last else "├── "
            child_prefix = "    " if is_last else "│   "
            result += (
                f"{prefix}{line_prefix}{name}{'/' if subnode is not None else ''}\n"
            )
            if subnode is not None:
                result += build_index(subnode, f"{prefix}{child_prefix}", depth + 1)
        return result

    text += build_index(tree)
    return text


def format_repo_contents(files: List[dict]) -> str:
    """Format repository contents into LLM-friendly text with directory structure."""
    structure_text = format_repo_structure(files)
    content_text = "\n\nFile Contents:\n"
    for file_item in sorted(
        files, key=lambda x: x["path"]
    ):  # Renamed 'file' to 'file_item'
        content_text += f"\n---\nFile: {file_item['path']}\n---\n{file_item.get('content', 'Error reading content or binary file.')}\n"
    return structure_text + content_text


def cleanup_temp_files(temp_dirs: List[str]):
    """Clean up temporary directories."""
    for temp_dir in temp_dirs:
        if temp_dir and os.path.exists(
            temp_dir
        ):  # Check if temp_dir is not None or empty
            shutil.rmtree(temp_dir, ignore_errors=True)