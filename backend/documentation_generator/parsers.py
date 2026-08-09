from typing import List, Dict, Any
import os
from pathlib import Path
from documentation_generator.structures import Document, RepositoryAnalysis
from documentation_generator.embedders import SemanticEmbedder
from documentation_generator.utils import download_repo, read_documents, chunk_documents, setup_repository_from_zip

class DocumentParser:
    """Document parsing and processing"""

    def __init__(self):
        self.embedder = SemanticEmbedder()
        self.repo_info = {}
        self.documents = []
        self.semantic_index_built = False
        # Add a default progress_callback that does nothing
        self.progress_callback = lambda msg: None
    def process_repository(self, repo_url_or_path: str, local_dir: str = "./temp_repo") -> List[Document]:
        """
        Process repository from a Git URL, local directory, or a .zip file.
        """
        print(f"      Processing repository: {repo_url_or_path}")
        
        # Convert to string to handle Path objects safely
        repo_path_str = str(repo_url_or_path)
        source_path = ""
        
        # Determine the source type (zip, git, or local folder)
        if repo_path_str.lower().endswith('.zip'):
            # NEW: Handle .zip files by unzipping to the local_dir
            self.progress_callback(f"      Unzipping repository from {repo_path_str}...")
            setup_repository_from_zip(repo_path_str, local_dir)
            source_path = local_dir  # The source for reading is now the extraction directory
            self.repo_info = {
                "owner": "local",
                "repo": Path(repo_path_str).stem,
                "url": repo_path_str,
                "type": "zip"
            }
        elif repo_path_str.startswith('http'):
            # Handle Git URLs by cloning to the local_dir
            self.progress_callback(f"      Cloning repository from {repo_path_str}...")
            download_repo(repo_path_str, local_dir)
            source_path = local_dir
            parts = repo_path_str.rstrip('/').split('/')
            self.repo_info = {
                "owner": parts[-2] if len(parts) >= 2 else "unknown",
                "repo": parts[-1].replace('.git', '') if parts else "unknown",
                "url": repo_path_str,
                "type": "github"
            }
        else:
            # Handle a local directory path
            self.progress_callback(f"      Reading from local directory {repo_path_str}...")
            source_path = repo_path_str
            self.repo_info = {
                "owner": "local",
                "repo": os.path.basename(source_path),
                "url": source_path,
                "type": "local"
            }

        
        self.progress_callback(f"      Reading and chunking documents...")
        documents = read_documents(source_path)
        chunked_docs = chunk_documents(documents)
        self.documents = chunked_docs
        
        # Build the semantic index
        repo_name = self.repo_info.get('repo', 'default')
        self.embedder.build_index(chunked_docs, repo_name)
        self.semantic_index_built = True

        self.progress_callback(f"✅ Semantic index built for {repo_name}!")
        self.progress_callback(f"   Processed {len(documents)} files into {len(chunked_docs)} document chunks.")

        # no more relevent after refactoring: print(f"Analysis complete: {len(self.repo_analysis.languages)} languages, {len(self.repo_analysis.frameworks)} frameworks detected")
        return chunked_docs