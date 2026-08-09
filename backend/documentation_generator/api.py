#for endpoints 
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import time
import asyncio
from typing import Optional, Dict, Any
from documentation_generator.core import DocumentationGenerator


app = FastAPI(title="Documentation Generator API")

class WikiGenerationRequest(BaseModel):
    repository_url: str
    output_dir: Optional[str] = "./wiki_output"
    language: Optional[str] = "en"
    comprehensive: Optional[bool] = True

class WikiGenerationResponse(BaseModel):
    status: str
    message: str
    task_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

@app.post("/generate-wiki", response_model=WikiGenerationResponse)
async def generate_wiki(request: WikiGenerationRequest, background_tasks: BackgroundTasks):
    """Generate wiki documentation for a repository"""
    try:
        generator = DocumentationGenerator()
        
        # Run in background for long-running tasks
        task_id = f"wiki_{hash(request.repository_url)}_{int(time.time())}"
        background_tasks.add_task(
            _generate_wiki_background,
            task_id,
            generator,
            request.repository_url,
            request.output_dir,
            request.language,
            request.comprehensive
        )
        
        return WikiGenerationResponse(
            status="accepted",
            message="Wiki generation started",
            task_id=task_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _generate_wiki_background(task_id: str, generator, repo_url: str, output_dir: str, language: str, comprehensive: bool):
    """Background task for wiki generation"""
    try:
        result = generator.generate_complete_wiki(
            repo_url_or_path=repo_url,
            output_dir=output_dir,
            language=language
        )
        # Store result somewhere (Redis, database, etc.)
        
    except Exception as e:
        # Store error result
        pass

@app.get("/wiki-status/{task_id}")
async def get_wiki_status(task_id: str):
    """Get the status of a wiki generation task"""
    # Retrieve status from storage
    pass