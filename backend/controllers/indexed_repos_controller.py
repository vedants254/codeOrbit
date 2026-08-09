from fastapi import HTTPException
import os
from models.repository import Repository
from models.user import User
from schemas.response_schemas import IndexedRepository, IndexedRepositoriesResponse


async def get_user_indexed_repositories(
    user: User,
    limit: int = 50,
    offset: int = 0,
) -> IndexedRepositoriesResponse:
    """
    Get all indexed repositories for the current authenticated user.
    Returns clean minimal repository data for frontend display.
    """

    try:
        # Query repositories for the current user with pagination
        repositories = (
            await Repository.find(Repository.user.id == user.id)
            .sort(-Repository.created_at)
            .skip(offset)
            .limit(limit)
            .to_list()
        )

        # Get total count for pagination info
        total_count = await Repository.find(
            Repository.user.id == user.id
        ).count()

        # Transform to response format
        indexed_repos = []
        for repo in repositories:
            # Calculate file size if zip file exists
            file_size_mb = None
            if repo.file_paths.zip and os.path.exists(repo.file_paths.zip):
                try:
                    file_size_bytes = os.path.getsize(repo.file_paths.zip)
                    file_size_mb = round(
                        file_size_bytes / (1024 * 1024), 2
                    )  # Convert to MB
                except OSError:
                    file_size_mb = None

            indexed_repo = IndexedRepository(
                repo_id=str(repo.id),
                repo_name=repo.repo_name,
                branch=repo.branch,
                source=repo.source,
                github_url=repo.github_url,
                commit_sha=repo.commit_sha,
                created_at=repo.created_at,
                updated_at=repo.updated_at,
                file_size_mb=file_size_mb,
            )
            indexed_repos.append(indexed_repo)

        return IndexedRepositoriesResponse(
            repositories=indexed_repos,
            total_count=total_count,
            user_tier=user.user_tier,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch indexed repositories: {str(e)}"
        )
