from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routes.repo_routes import router as repo_router
from routes.auth_routes import router as auth_router
from routes.chat_routes import router as chat_router
from routes.documentation_routes import router as documentation_router
from routes.indexed_repos_routes import router as indexed_repos_router
from routes.api_key_routes import router as api_key_router
from routes.github_routes import router as github_router
from utils.observability import initialize_observability
from utils.db import db_instance

import os
from dotenv import load_dotenv

# =====================
# Load environment variables
# =====================
load_dotenv()

if os.getenv("IS_DISABLING_OBSERVABILITY", "false").lower() != "true":
    initialize_observability()

# Initialize the database connection
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database connection
    await db_instance.init_db()

    yield  # Let the application run

    # Clean up resources if needed
    await db_instance.close_db()


app = FastAPI(
    title="gitvizz API",
    description="API for generating text, graphs, and structure from code repositories.",
    lifespan=lifespan,
)

# CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the repository routes
app.include_router(repo_router, prefix="/api", tags=["Repository Operations"])
app.include_router(auth_router, prefix="/api", tags=["Authentication"])
app.include_router(chat_router, prefix="/api", tags=["Chat Operations"])
app.include_router(
    documentation_router, prefix="/api", tags=["Documentation Generation"]
)
app.include_router(indexed_repos_router, prefix="/api", tags=["Indexed Repositories"])
app.include_router(api_key_router, prefix="/api", tags=["API Key Management"])
app.include_router(github_router, prefix="/api", tags=["GitHub Integration"])

# =====================
# Main Entrypoint
# =====================
if __name__ == "__main__":
    import uvicorn

    load_dotenv()
    host = os.getenv("HOST", "0.0.0.0")  # Default to all interfaces
    port = int(os.getenv("PORT", 8003))  # Default port 8003

    uvicorn.run("server:app", host=host, port=port, reload=True)
