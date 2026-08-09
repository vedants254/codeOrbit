import httpx
import logging
from fastapi import HTTPException, status
from beanie import PydanticObjectId
from models.user import User
from schemas.github_schemas import (
    GitHubInstallationsResponse,
    GitHubRepositoriesResponse,
    GitHubInstallation,
    GitHubRepository
)

# Set up logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


async def get_user_installations(user_id: str) -> GitHubInstallationsResponse:
    """
    Get GitHub App installations for the authenticated user
    """
    try:
        print("[PROD DEBUG] Environment check")
        print(f"[PROD DEBUG] Python version: {__import__('sys').version}")
        print(f"[PROD DEBUG] Running in Modal: {'MODAL_ENVIRONMENT' in __import__('os').environ}")
        print(f"[PROD DEBUG] Current working directory: {__import__('os').getcwd()}")
        print(f"[PROD DEBUG] Fetching GitHub installations for user_id: {user_id}")
        
        # Get user from database
        try:
            user = await User.get(PydanticObjectId(user_id))
            print(f"[PROD DEBUG] User lookup successful: {bool(user)}")
            if user:
                print(f"[PROD DEBUG] User data check - Has token: {bool(user.github_access_token)}, Username: {user.username}")
        except Exception as e:
            print(f"[PROD DEBUG] User lookup error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}"
            )
            
        if not user:
            print(f"[PROD DEBUG] User not found in database: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found in database"
            )
        
        if not user.github_access_token:
            print(f"GitHub access token missing for user: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="GitHub access token missing"
            )

        access_token = user.github_access_token
        
        # Enhanced token validation
        if not access_token or not access_token.strip():
            print(f"[PROD DEBUG] GitHub token is empty or whitespace for user: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="GitHub token is empty"
            )
            
        # Log token length and format (safely)
        token_length = len(access_token)
        token_prefix = access_token[:7] + "..." if token_length > 10 else "..."
        print("[PROD DEBUG] Token validation")
        print(f"[PROD DEBUG] - Length: {token_length}")
        print(f"[PROD DEBUG] - Prefix: {token_prefix}")
        print(f"[PROD DEBUG] - Format valid: {any(access_token.startswith(prefix) for prefix in ['ghu_', 'ghp_', 'gho_', 'ghs_', 'github_pat_'])}")
        
        # Validate token format
        if not any(access_token.startswith(prefix) for prefix in ['ghu_', 'ghp_', 'gho_', 'ghs_', 'github_pat_']):
            print("[PROD DEBUG] Warning: Token doesn't match expected GitHub token formats")
            
        # GitHub user tokens (ghu_) use 'token' auth type, not 'Bearer'
        auth_type = "token" if access_token.startswith(("ghu_", "ghp_", "gho_", "ghs_", "github_pat_")) else "Bearer"
        headers = {
            "Authorization": f"{auth_type} {access_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "GitVizz-Backend/1.0"  # Adding User-Agent as GitHub requires it
        }
        print("[PROD DEBUG] Request setup")
        print(f"[PROD DEBUG] - Auth type: {auth_type}")
        print(f"[PROD DEBUG] - Token prefix: {access_token[:4]}")
        print(f"[PROD DEBUG] - Headers: {dict(headers)}")

        async with httpx.AsyncClient() as client:
            # Get the current authenticated user's information
            print("Fetching GitHub user information")
            user_res = await client.get("https://api.github.com/user", headers=headers)
            
            print(f"[PROD DEBUG] GitHub API Response - Status: {user_res.status_code}")
            
            if user_res.status_code != 200:
                error_data = user_res.json() if user_res.content else {}
                error_message = error_data.get("message", "Unknown error")
                
                print("[PROD DEBUG] GitHub API Error Details")
                print(f"[PROD DEBUG] - Status code: {user_res.status_code}")
                print(f"[PROD DEBUG] - Error message: {error_message}")
                print(f"[PROD DEBUG] - Full response: {error_data}")
                print(f"[PROD DEBUG] - Request URL: {user_res.request.url}")
                print(f"[PROD DEBUG] - Request method: {user_res.request.method}")
                print(f"[PROD DEBUG] - Request headers: {dict(user_res.request.headers)}")
                
                if 'X-RateLimit-Remaining' in user_res.headers:
                    print("[PROD DEBUG] Rate Limits")
                    print(f"[PROD DEBUG] - Remaining: {user_res.headers.get('X-RateLimit-Remaining')}")
                    print(f"[PROD DEBUG] - Reset at: {user_res.headers.get('X-RateLimit-Reset')}")
                
                # Check specific error cases
                if error_message == "Bad credentials":
                    print("[PROD DEBUG] Token validation failed - token might be expired or invalid")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="GitHub token is invalid or expired. Please re-authenticate."
                    )
                elif user_res.status_code == 403:
                    if "rate limit" in error_message.lower():
                        print("[PROD DEBUG] Rate limit exceeded")
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="GitHub API rate limit exceeded. Please try again later."
                        )
                    else:
                        print("[PROD DEBUG] Permission issue detected")
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"GitHub API access forbidden: {error_message}"
                        )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=f"Invalid GitHub token: {error_message}"
                    )

            github_user = user_res.json()

            # Get user installations
            print("Fetching GitHub user installations")
            installations_res = await client.get(
                "https://api.github.com/user/installations", 
                headers=headers
            )
            
            if installations_res.status_code != 200:
                error_data = installations_res.json() if installations_res.content else {}
                error_message = error_data.get("message", "Unknown error")
                print(f"GitHub installations API failed with status {installations_res.status_code}: {error_message}")
                print(f"GitHub API Response: {error_data}")
                print(f"Request headers: {headers}")
                raise HTTPException(
                    status_code=installations_res.status_code,
                    detail=f"Failed to fetch installations: {installations_res.status_code}: {error_message}"
                )

            installations_data = installations_res.json()

            # Filter installations to only include those where the app is installed on the user's account
            user_installations = []
            for installation in installations_data.get("installations", []):
                # Check if the installation is on the user's personal account
                if installation["account"]["id"] == github_user["id"]:
                    user_installations.append(GitHubInstallation(**installation))
                # Include organization installations
                elif installation.get("target_type") == "Organization":
                    user_installations.append(GitHubInstallation(**installation))

            response = GitHubInstallationsResponse(
                installations=user_installations,
                user_id=github_user["id"],
                user_login=github_user["login"]
            )
            print(f"Successfully fetched {len(user_installations)} GitHub installations for user {github_user['login']}")
            return response

    except HTTPException:
        raise
    except Exception as error:
        logger.exception(f"Unexpected error in get_user_installations for user_id {user_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(error)}"
        )


async def get_installation_repositories(
    installation_id: int, 
    user_id: str
) -> GitHubRepositoriesResponse:
    """
    Get repositories accessible to a GitHub App installation that the user also has access to
    """
    try:
        # Get user from database
        user = await User.get(PydanticObjectId(user_id))
        if not user or not user.github_access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or GitHub access token missing"
            )

        # Get GitHub App credentials from environment
        import os
        github_app_id = os.getenv("GITHUB_APP_ID")
        github_private_key = os.getenv("GITHUB_PRIVATE_KEY")
        github_client_id = os.getenv("GITHUB_CLIENT_ID")
        github_client_secret = os.getenv("GITHUB_CLIENT_SECRET")

        if not all([github_app_id, github_private_key, github_client_id, github_client_secret]):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GitHub App credentials not configured"
            )

        # Create GitHub App authentication for installation access
        from cryptography.hazmat.primitives import serialization
        from jose import jwt
        import time

        # Parse the private key
        try:
            # Handle different private key formats
            if github_private_key.startswith('"') and github_private_key.endswith('"'):
                # Remove quotes if present
                private_key_content = github_private_key[1:-1]
            else:
                private_key_content = github_private_key
            
            # Replace escaped newlines with actual newlines
            private_key_formatted = private_key_content.replace('\\n', '\n')
            
            # Ensure proper PEM format
            if not private_key_formatted.startswith('-----BEGIN'):
                raise ValueError("Private key must start with -----BEGIN")
            
            private_key = serialization.load_pem_private_key(
                private_key_formatted.encode('utf-8'),
                password=None
            )
            print("[DEBUG] Successfully parsed private key")
        except Exception as e:
            print(f"[DEBUG] Private key parsing error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to parse GitHub private key: {str(e)}"
            )

        # Create JWT for GitHub App authentication
        now = int(time.time())
        payload = {
            'iat': now - 60,  # 1 minute ago to account for clock skew
            'exp': now + 600,  # 10 minutes from now (GitHub allows max 10 minutes)
            'iss': github_app_id  # Keep as string, GitHub accepts both
        }
        
        try:
            # Use RS256 algorithm as required by GitHub
            jwt_token = jwt.encode(payload, private_key, algorithm='RS256')
            print(f"[DEBUG] Created JWT for GitHub App {github_app_id}, installation {installation_id}")
            print(f"[DEBUG] JWT payload: {payload}")
            print(f"[DEBUG] JWT token (first 50 chars): {jwt_token[:50]}")
        except Exception as e:
            print(f"[DEBUG] JWT creation error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create GitHub App JWT: {str(e)}"
            )

        async with httpx.AsyncClient() as client:
            # Get installation token
            installation_token_res = await client.post(
                f"https://api.github.com/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {jwt_token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "GitVizz-Backend/1.0",
                }
            )

            if installation_token_res.status_code != 201:
                error_detail = "Failed to get installation token"
                try:
                    error_response = installation_token_res.json()
                    error_detail = f"GitHub API Error: {error_response.get('message', 'Unknown error')}"
                    print(f"[DEBUG] GitHub API error response: {error_response}")
                except Exception:
                    error_detail = f"GitHub API HTTP Error: {installation_token_res.status_code}"
                    print(f"[DEBUG] Raw response text: {installation_token_res.text}")
                
                print(f"[DEBUG] Installation token request failed with status {installation_token_res.status_code}")
                print(f"[DEBUG] Request URL: https://api.github.com/app/installations/{installation_id}/access_tokens")
                
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=error_detail
                )

            installation_token = installation_token_res.json()["token"]

            # Fetch installation repositories (all repositories accessible to the GitHub App)
            installation_repositories = []
            page = 1
            per_page = 100

            while True:
                repos_res = await client.get(
                    "https://api.github.com/installation/repositories",
                    headers={
                        "Authorization": f"token {installation_token}",
                        "Accept": "application/vnd.github+json",
                    },
                    params={"per_page": per_page, "page": page}
                )

                if repos_res.status_code != 200:
                    break

                repos_data = repos_res.json()
                repositories = repos_data.get("repositories", [])
                
                if not repositories:
                    break

                installation_repositories.extend(repositories)
                
                # Check if there are more pages
                if len(repositories) < per_page:
                    break
                    
                page += 1

            # Fetch user repositories (repositories the authenticated user has access to)
            user_repositories = []
            page = 1

            while True:
                user_repos_res = await client.get(
                    "https://api.github.com/user/repos",
                    headers={
                        "Authorization": f"Bearer {user.github_access_token}",
                        "Accept": "application/vnd.github+json",
                    },
                    params={"per_page": per_page, "page": page}
                )

                if user_repos_res.status_code != 200:
                    break

                repositories = user_repos_res.json()
                
                if not repositories:
                    break

                user_repositories.extend(repositories)
                
                # Check if there are more pages
                if len(repositories) < per_page:
                    break
                    
                page += 1

            # Filter repositories: only return installation repositories that the user has access to
            user_repo_ids = {repo["id"] for repo in user_repositories}
            
            filtered_repositories = [
                repo for repo in installation_repositories 
                if repo["id"] in user_repo_ids
            ]

            # Sort repositories by updated_at in descending order (most recent first)
            filtered_repositories.sort(
                key=lambda x: x.get("updated_at", ""), 
                reverse=True
            )

            # Convert to schema objects
            github_repos = []
            for repo in filtered_repositories:
                github_repo = GitHubRepository(
                    id=repo["id"],
                    name=repo["name"],
                    full_name=repo["full_name"],
                    description=repo.get("description"),  # Allow None, frontend will handle fallback
                    private=repo["private"],
                    html_url=repo["html_url"],
                    language=repo.get("language"),
                    stargazers_count=repo.get("stargazers_count", 0),
                    forks_count=repo.get("forks_count", 0),
                    default_branch=repo.get("default_branch", "main"),
                    updated_at=repo.get("updated_at")
                )
                github_repos.append(github_repo)

            return GitHubRepositoriesResponse(
                repositories=github_repos,
                total_count=len(github_repos)
            )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(error)}"
        )