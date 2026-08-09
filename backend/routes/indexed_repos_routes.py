from fastapi import APIRouter, Depends, Form
from typing import Annotated
from schemas.response_schemas import IndexedRepositoriesResponse, ErrorResponse
from controllers.indexed_repos_controller import get_user_indexed_repositories
from middleware.auth_middleware import require_auth
from models.user import User

router = APIRouter(prefix="/indexed-repos")


# Get user's indexed repositories
@router.post(
    "/",
    response_model=IndexedRepositoriesResponse,
    summary="Get user's indexed repositories",
    description="""
    Retrieve all repositories that have been previously indexed/analyzed by the authenticated user.
    Returns clean, minimal repository data for frontend display including:
    - Repository name and branch
    - Source (GitHub or ZIP)  
    - Creation/update timestamps
    - File sizes
    - User tier information
    """,
    response_description="List of indexed repositories with metadata",
    responses={
        200: {
            "description": "Successfully retrieved indexed repositories",
            "model": IndexedRepositoriesResponse,
        },
        401: {
            "model": ErrorResponse,
            "description": "Authentication required - missing or invalid JWT token",
        },
        500: {
            "model": ErrorResponse,
            "description": "Server error while fetching repositories",
        },
    },
)
async def get_indexed_repositories(
    current_user: Annotated[User, Depends(require_auth)],
    limit: Annotated[
        int, Form(description="Maximum number of repositories to return")
    ] = 50,
    offset: Annotated[int, Form(description="Number of repositories to skip")] = 0,
):
    return await get_user_indexed_repositories(user=current_user, limit=limit, offset=offset)
