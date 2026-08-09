from fastapi import APIRouter, Depends, BackgroundTasks, Form, File, UploadFile
from typing import Annotated, Optional
from schemas.response_schemas import (
    TextResponse,
    ErrorResponse,
    GraphResponse,
    StructureResponse
)
from middleware.auth_middleware import optional_auth
from models.user import User

from controllers.repo_controller import (
    generate_text_endpoint,
    generate_graph_endpoint,
    generate_structure_endpoint,
    generate_subgraph_endpoint
)

router = APIRouter(prefix='/repo')

# Generating LLM-friendly text from a code repository or ZIP file
@router.post(
    "/generate-text",
    response_model=TextResponse,
    summary="Generates LLM-friendly text from a code repository with smart caching.",
    description="""
    Generates LLM-friendly text from a code repository or ZIP file.
    """,
    response_description="A JSON object containing repository structure, content, and a suggested filename. Returns cached data if available and up-to-date.",
    responses={
        200: {"description": "Repository content as JSON (cached or newly generated).", "model": TextResponse},
        400: {
            "model": ErrorResponse,
            "description": "Invalid input (e.g., no URL or ZIP provided).",
        },
        401: {
            "model": ErrorResponse,
            "description": "Invalid or expired JWT token.",
        },
        404: {
            "model": ErrorResponse,
            "description": "Could not download repository or no suitable files found.",
        },
        500: {"model": ErrorResponse, "description": "Server error during processing."},
    },
)
async def generate_text_route(
    current_user: Annotated[Optional[User], Depends(optional_auth)],
    background_tasks: BackgroundTasks,
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
):
    return await generate_text_endpoint(background_tasks, current_user, repo_url, branch, zip_file, access_token)

# Generating a graph representation of the repository structure
@router.post(
    "/generate-graph",
    response_model=GraphResponse,
    summary="Generates a dependency graph from a code repository with smart caching.",
    description="""
    Generates a dependency graph representation from a code repository or ZIP file.
    """,
    response_description="JSON containing graph nodes, edges, and metadata. Returns cached data if available and up-to-date.",
    responses={
        200: {"description": "Dependency graph data as JSON (cached or newly generated).", "model": GraphResponse},
        400: {"model": ErrorResponse, "description": "Invalid input (e.g., no URL or ZIP provided)."},
        401: {
            "model": ErrorResponse,
            "description": "Invalid or expired JWT token.",
        },
        404: {"model": ErrorResponse, "description": "Repository not found or no suitable files for graph generation."},
        500: {"model": ErrorResponse, "description": "Server error during graph generation."},
    },
)
async def generate_graph_route(
    current_user: Annotated[Optional[User], Depends(optional_auth)],
    background_tasks: BackgroundTasks,
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
):
    return await generate_graph_endpoint(background_tasks, current_user, repo_url, branch, zip_file, access_token)

# Generate a subgraph (ego network or filtered view) for large graphs
@router.post(
    "/generate-subgraph",
    response_model=GraphResponse,
    summary="Generates a subgraph (ego network or filtered subset) for large repositories.",
    description="""
    Returns a subset of the repository graph, centered at a node (ego network) and/or filtered by
    categories, file paths, or relationship types. Uses cached full graph if available.
    """,
    response_description="JSON containing subgraph nodes and edges.",
    responses={
        200: {"description": "Subgraph data as JSON.", "model": GraphResponse},
        400: {"model": ErrorResponse, "description": "Invalid input."},
        401: {"model": ErrorResponse, "description": "Invalid or expired JWT token."},
        404: {"model": ErrorResponse, "description": "Repository not found or no graph available."},
        500: {"model": ErrorResponse, "description": "Server error during subgraph generation."},
    },
)
async def generate_subgraph_route(
    current_user: Annotated[Optional[User], Depends(optional_auth)],
    background_tasks: BackgroundTasks,
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
):
    return await generate_subgraph_endpoint(background_tasks, current_user, repo_url, branch, access_token, center_node_id, depth, categories, directories, relationship_types, min_degree, limit)

@router.post(
    "/generate-structure",
    response_model=StructureResponse,
    summary="Generates the file structure and content of a code repository with smart caching.",
    description="""
    Generates the complete file structure and content of a code repository or ZIP file.
    """,
    response_description="JSON containing the repository's directory tree and file contents. Returns cached data if available and up-to-date.",
    responses={
        200: {
            "description": "Repository structure and content as JSON (cached or newly generated).",
            "model": StructureResponse,
        },
        400: {"model": ErrorResponse, "description": "Invalid input (e.g., no URL or ZIP provided)."},
        401: {
            "model": ErrorResponse,
            "description": "Invalid or expired JWT token.",
        },
        404: {"model": ErrorResponse, "description": "Repository not found or no suitable files after filtering."},
        500: {"model": ErrorResponse, "description": "Server error during structure generation."},
    },
)
async def generate_structure_route(
    current_user: Annotated[Optional[User], Depends(optional_auth)],
    background_tasks: BackgroundTasks,
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
):
    return await generate_structure_endpoint(background_tasks, current_user, repo_url, branch, zip_file, access_token)

