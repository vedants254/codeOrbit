import modal
# Define the Modal image with FastAPI dependencies

image = (
    modal.Image.debian_slim(python_version="3.12")
    .add_local_dir(
        ".",
        "/root",
        copy=True,
        ignore=[
            "__pycache__",
            "*.pyc",
            "*.pyo",
            "*.pyd",
            ".Python",
            "env",
            "venv",
            ".venv",
            ".env",
            ".git",
            ".gitignore",
            "*.log",
            ".DS_Store",
            "node_modules",
            "*.egg-info",
            "build",
            "dist",
            ".pytest_cache",
            ".coverage",
            "htmlcov",
            ".mypy_cache",
            ".tox",
            "storage/users/*",  # Ignore user storage directory
            "static/*",  # Ignore static files
            "*.sqlite",
            "*.db",
        ],
    )
    .run_commands("apt-get update && apt-get install -y git")
    .run_commands("pip install --upgrade pip")
    .run_commands("pip install uv")
    .run_commands("cd /root && uv pip install . --system")
)
vol = modal.Volume.from_name("omniparse_backend", create_if_missing=True)

# Create a Modal app
app = modal.App("omniparse-code", image=image)


@app.function(
    secrets=[modal.Secret.from_name("omniparse_cloud"), modal.Secret.from_dotenv()],
    # secrets=[modal.Secret.from_dotenv()],
    volumes={"/data": vol},
    min_containers=1,
    max_containers=10,
)
@modal.asgi_app()
def serve_omniparse_backend():
    import sys

    sys.path.append("/root")  # Add the root directory to the Python path
    from server import app as fastapi_app

    return fastapi_app
