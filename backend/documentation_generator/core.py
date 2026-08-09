from typing import List, Dict, Any, Callable
import time
from datetime import datetime
from pathlib import Path
import shutil
import re 
from documentation_generator.ai_client import LLMClient
from documentation_generator.analyzers import RepositoryAnalyzer
from documentation_generator.parsers import DocumentParser
from documentation_generator.embedders import SemanticEmbedder
from documentation_generator.structures import WikiStructure, WikiPage, Document
from documentation_generator.utils import save_wiki_files

class DocumentationGenerator:
    """Main documentation generator - simplified like GraphGenerator"""
    
    def __init__(self, api_key: str = None, provider: str = "gemini", model: str = None, 
                 temperature: float = 0.7, progress_callback: Callable[[str], None] = None,
                 user = None):
        self.api_key = api_key
        self.provider = provider.lower() 
        self.model = model
        self.temperature = temperature
        self.user = user
        self.ai_client = LLMClient(self.api_key, provider=self.provider, model=self.model, temperature=self.temperature)
        
        self.analyzer = RepositoryAnalyzer()
        self.parser = DocumentParser()
        self.embedder = SemanticEmbedder()
        
        # State management
        self.documents = []
        self.repo_info = {}
        self.repo_analysis = None
        self.progress_callback = progress_callback or self._default_progress_callback
    
    def _default_progress_callback(self, message: str):
        """Default progress callback that prints to console"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {message}")
    
    def generate_complete_wiki(self, repo_url_or_path: str, output_dir: str = "./wiki_output", 
                         language: str = "en", github_token: str = None) -> Dict[str, Any]:
        """Main generation method - COMPLETE VERSION"""
        self.progress_callback(f"🚀 Starting comprehensive wiki generation for: {repo_url_or_path}")
        
        output_dir = Path(output_dir).resolve()  # Make it absolute
        repo_root_parent = output_dir.parent     # Go one level up
        
        # Use a temp working directory for cloning/unzipping
        repo_root = repo_root_parent / "temp_repo"

        # Step 1: Process repository (supports URL, local path, or .zip)
        self.progress_callback("   📥 Processing repository (clone/read/zip setup)...")
        self.documents = self.parser.process_repository(str(repo_url_or_path), str(repo_root))
        self.repo_info = self.parser.repo_info

        # Step 1.2: Clean up existing documents
        if output_dir.exists():
            shutil.rmtree(output_dir)
        
        if not self.documents:
            return {"status": "error", "message": "No documents found"}
        
        # Step 2: Analyze repository
        self.progress_callback("   🔎 Analyzing repository structure and tech stack...")
        self.repo_analysis = self.analyzer.analyze(self.documents)
        
        # Step 3: Build semantic index
        self.progress_callback("   🧠 Building semantic index for retrieval...")
        self._build_semantic_index()
        
        # Step 4: Generate structure
        self.progress_callback("   🏗️ Generating documentation structure...")
        structure = self._generate_wiki_structure(language)
        
        # Step 5: Generate content for all pages with optimized rate limiting
        self.progress_callback("   ✍️ Starting content generation with optimized rate limiting...")
        
        # Use dynamic rate limiting based on provider
        rate_delay = self.ai_client.get_rate_limit_delay() if hasattr(self.ai_client, 'get_rate_limit_delay') else 20
        
        generated_pages = []
        for i, page in enumerate(structure.pages):
            # Check for cancellation (if progress_callback has access to task status)
            if hasattr(self.progress_callback, '__self__') and hasattr(self.progress_callback.__self__, 'cancelled'):
                if self.progress_callback.__self__.cancelled:
                    self.progress_callback("🛑 Generation cancelled")
                    break
                    
            if i > 0:
                self.progress_callback(f"      Brief pause before next page ({i+1}/{len(structure.pages)})...")
                time.sleep(rate_delay)  # Dynamic rate limiting based on provider
            
            self.progress_callback(f"      📝 Generating page {i+1}/{len(structure.pages)}: {page.title}")
            generated_page = self.generate_page_content(page, language)
            generated_pages.append(generated_page)
        
        # Step 6: Save files
        output_dir.mkdir(parents=True, exist_ok=True)
        self.progress_callback("   💾 Saving documentation files...")
        result = save_wiki_files(generated_pages, structure, output_dir, self.repo_analysis)
        
        # Add comprehensive summary
        result.update({
            "repository": repo_url_or_path,
            "wiki_structure": structure,
            "analysis": {
                "languages": dict(self.repo_analysis.languages),
                "frameworks": self.repo_analysis.frameworks,
                "complexity_score": self.repo_analysis.complexity_score,
                "domain_type": self.repo_analysis.domain_type
            }
        })
        
        # Step 7: Cleanup temporary files
        self.progress_callback("      🧹 Cleaning up temporary files...")

        if repo_root.exists():
            shutil.rmtree(repo_root)

        self.progress_callback("      Cleanup complete. Wiki generated successfully!")
        return result
        
    def _build_semantic_index(self):
        """Build semantic search index"""
        repo_name = self.repo_info.get('repo', 'default')
        self.embedder.build_index(self.documents, repo_name)
    
    def _generate_wiki_structure(self, language: str) -> WikiStructure:
        """Generate wiki structure using AI"""
        file_tree = self._get_file_tree_string()
        readme_content = self._get_readme_content()
        
        return self.ai_client.generate_wiki_structure(
            self.repo_analysis, 
            file_tree,
            readme_content,
            self.repo_info,
            language,
            self.progress_callback
        )
    
    def _generate_all_pages(self, structure: WikiStructure, language: str) -> List[WikiPage]:
        """Generate content for all pages"""
        generated_pages = []
        for i, page in enumerate(structure.pages):
            if i > 0:
                time.sleep(120)  # Rate limiting
            
            relevant_docs = self._get_relevant_documents(page)
            page.content = self.ai_client.generate_page_content(page, relevant_docs, language)
            generated_pages.append(page)
        
        return generated_pages
    
    
    
    def _get_readme_content(self) -> str:
        """Get README content"""
        for doc in self.documents:
            if 'readme' in doc.meta_data.get('file_path', '').lower():
                return doc.text
        return "No README found"
    

    def _get_relevant_documents(self, page: WikiPage) -> List[Document]:
        """Get enhanced relevant documents using semantic + keyword search - HYBRID APPROACH"""

        # Semantic search queries
        search_queries = [
            page.title,
            page.id.replace('_', ' ').replace('-', ' ')
        ]
        
        # Add context-specific queries
        page_id = page.id.lower()
        if 'api' in page_id:
            search_queries.extend(['endpoint', 'route', 'handler', 'controller'])
        elif 'architecture' in page_id:
            search_queries.extend(['design', 'pattern', 'structure', 'component'])
        elif 'setup' in page_id:
            search_queries.extend(['install', 'configure', 'environment', 'dependencies'])
        
        # Perform semantic search
        semantic_docs = []
        if hasattr(self.embedder, 'semantic_search'):
            for query in search_queries:
                semantic_docs.extend(self.embedder.semantic_search(query, k=5))
        
        # Keyword search (existing logic)
        page_keywords = page.title.lower().split() + (page.id.split('_') if '_' in page.id else [page.id])
        keyword_docs = []
        
        for doc in self.documents:
            score = 0
            file_path = doc.meta_data.get('file_path', '').lower()
            content_lower = doc.text.lower()
            
            # File path matching (10 points)
            for keyword in page_keywords:
                if keyword in file_path:
                    score += 10
            
            # Keyword frequency (2 points per occurrence)
            for keyword in page_keywords:
                score += content_lower.count(keyword) * 2
            
            # File type relevance (3 points)
            file_type = doc.meta_data.get('type', '')
            if file_type in ['py', 'js', 'ts', 'md']:
                score += 3
            
            if score > 0:
                doc.meta_data['keyword_score'] = score
                keyword_docs.append(doc)
        
        # Combine results
        combined_docs = {}
        
        # Add semantic results (higher priority)
        for doc in semantic_docs:
            doc_key = doc.meta_data.get('file_path', 'unknown')
            semantic_score = doc.meta_data.get('semantic_score', 0.5)
            combined_docs[doc_key] = doc
            combined_docs[doc_key].meta_data['final_score'] = semantic_score * 10 + 5
        
        # Add keyword results
        for doc in keyword_docs:
            doc_key = doc.meta_data.get('file_path', 'unknown')
            keyword_score = doc.meta_data.get('keyword_score', 0)
            if doc_key in combined_docs:
                # Boost existing semantic results
                combined_docs[doc_key].meta_data['final_score'] += keyword_score
            else:
                combined_docs[doc_key] = doc
                combined_docs[doc_key].meta_data['final_score'] = keyword_score
        
        # Sort and return
        final_docs = list(combined_docs.values())
        final_docs.sort(key=lambda x: x.meta_data.get('final_score', 0), reverse=True)
        
        print(f"🔍 Found {len(final_docs)} relevant docs using semantic + keyword search")
        return final_docs[:15]
    
    def _get_file_tree_string(self) -> str:
        """Generate a string representation of the file tree - EXACT SAME"""
        if not self.repo_analysis:
            return "No file structure available"

        file_structure = self.repo_analysis.file_structure
        if isinstance(file_structure, dict):
            tree_lines = []
            for directory, files in list(file_structure.items())[:20]:
                tree_lines.append(f"    {directory}/")
                for file in files[:10]:  # Limit files per directory
                    tree_lines.append(f"       {file}")
                if len(files) > 10:
                    tree_lines.append(f"  ... and {len(files) - 10} more files")
            return '\n'.join(tree_lines)
        elif isinstance(file_structure, list):
            return '\n'.join([f"     {file}" for file in file_structure[:50]])
        else:
            return str(file_structure)

    def _generate_wiki_structure(self, language: str) -> WikiStructure:
        """Generate wiki structure using AI"""
        file_tree = self._get_file_tree_string()
        readme_content = self._get_readme_content()
        
        return self.ai_client.generate_wiki_structure(
            self.repo_analysis, 
            file_tree,
            readme_content,
            self.repo_info,
            language,
            self.progress_callback
        )

    def generate_page_content(self, page: WikiPage, language: str = "en") -> WikiPage:
        """Generate comprehensive page content using AI with AI-generated titles"""
        self.progress_callback(f"      Generating AI content for: {page.title}")

        # Get relevant documents for this page
        relevant_docs = self._get_relevant_documents(page)
        
        # Generate AI-powered title if the current title is generic
        if self._is_generic_title(page.title):
            context = self._build_page_context(relevant_docs)
            ai_title = self.ai_client.generate_ai_title(page.id, context, self.repo_info)
            if ai_title:
                self.progress_callback(f"✨ Generated AI title: {ai_title}")
                page.title = ai_title

        # Generate content using multi-provider AI
        # Unified client
        generated_page = self.ai_client.generate_page_content(
            page, self.repo_analysis, relevant_docs, language, self.progress_callback
        )
        page.content = generated_page.content
        page.mermaid_diagrams = self._extract_mermaid_diagrams(page.content)

        return page
    
    def _is_generic_title(self, title: str) -> bool:
        """Check if title is generic and needs AI enhancement"""
        generic_patterns = [
            'untitled', 'page', 'documentation', 'default',
            'unnamed', 'section', 'chapter', 'part'
        ]
        title_lower = title.lower()
        return any(pattern in title_lower for pattern in generic_patterns) or len(title.strip()) < 5
    
    def _build_page_context(self, relevant_docs: List[Document]) -> str:
        """Build context string from relevant documents for title generation"""
        context_parts = []
        for doc in relevant_docs[:3]:  # Limit to first 3 docs for context
            if doc.text:
                # Extract first few lines or important parts
                lines = doc.text.split('\n')[:5]
                context_parts.append(' '.join(lines))
        
        return ' '.join(context_parts)[:1000]  # Limit context size

    def _extract_mermaid_diagrams(self, content: str) -> List[str]:
        """Extract Mermaid diagrams from content - EXACT SAME"""
        diagrams = []
        pattern = r'```mermaid\n(.*?)\n```'
        matches = re.findall(pattern, content, re.DOTALL)
        for match in matches:
            diagrams.append(match.strip())
        return diagrams
        
