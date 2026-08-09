from fastapi import APIRouter, Depends, HTTPException, status
from typing import Annotated
from middleware.auth_middleware import require_auth
from models.user import User
from controllers.github_controller import (
    get_user_installations,
    get_installation_repositories
)
from schemas.github_schemas import (
    GitHubInstallationsResponse,
    GitHubRepositoriesResponse
)

router = APIRouter(prefix="/github", tags=["GitHub"])


@router.post("/installations", response_model=GitHubInstallationsResponse)
async def get_github_installations(
    current_user: Annotated[User, Depends(require_auth)]
):
    """
    Get GitHub App installations for the authenticated user
    """
    try:
        user_id = str(current_user.id)
        return await get_user_installations(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch GitHub installations: {str(e)}"
        )


@router.post("/installations/{installation_id}/repositories", response_model=GitHubRepositoriesResponse)
async def get_github_installation_repositories(
    installation_id: int,
    current_user: Annotated[User, Depends(require_auth)]
):
    """
    Get repositories accessible to a GitHub App installation that the user also has access to
    """
    try:
        user_id = str(current_user.id)
        return await get_installation_repositories(installation_id, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch GitHub repositories: {str(e)}"
        )