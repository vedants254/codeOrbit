#wikip
"""Data classes and structures"""
# ADD proper field defaults to avoid runtime errors:
from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class WikiPage:
    id: str
    title: str
    content: str = ""
    file_paths: List[str] = field(default_factory=list) 
    importance: int = 1
    related_pages: List[str] = field(default_factory=list)  
    mermaid_diagrams: List[str] = field(default_factory=list)  

@dataclass
class WikiSection:
    id: str
    title: str
    pages: List[str] = field(default_factory=list)  
    subsections: List[str] = field(default_factory=list)  

@dataclass
class WikiStructure:
    title: str = ""
    description: str = ""
    pages: List[WikiPage] = field(default_factory=list)
    sections: List[WikiSection] = field(default_factory=list)
    root_sections: List[str] = field(default_factory=list)  

@dataclass 
class RepositoryAnalysis:
    languages: Dict[str, int] = field(default_factory=dict)
    frameworks: List[str] = field(default_factory=list)
    architecture_patterns: List[str] = field(default_factory=list)
    key_files: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    file_structure: Dict[str, List[str]] = field(default_factory=dict)
    complexity_score: int = 1
    domain_type: str = "General Software"
    tech_stack: List[str] = field(default_factory=list)
    entry_points: List[str] = field(default_factory=list)
    config_files: List[str] = field(default_factory=list)
    documentation_files: List[str] = field(default_factory=list)
    test_files: List[str] = field(default_factory=list)

class Document:
    def __init__(self, text: str, meta_data: Dict[str, Any] = None):
        self.text = text
        self.meta_data = meta_data or {}
        self.vector = None
