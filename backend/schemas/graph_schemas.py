# graph_schemas.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime


class GraphNode(BaseModel):
    """Schema for graph node data"""
    id: str
    name: str
    category: Literal["module", "class", "function", "method", "directory", "external_symbol", "next_page_module"]
    file: Optional[str] = None
    start_line: int = 0
    end_line: int = 0
    code: Optional[str] = None
    parent_id: Optional[str] = None
    imports: Optional[List[Dict[str, str]]] = None


class GraphEdge(BaseModel):
    """Schema for graph edge data"""
    source: str
    target: str
    relationship: Literal[
        "defines_class", "defines_function", "defines_method", 
        "inherits", "calls", "imports_module", "imports_symbol", 
        "references_symbol", "contains_directory", "contains_module"
    ]
    file: Optional[str] = None
    line: Optional[int] = None


class GraphData(BaseModel):
    """Complete graph structure"""
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class QueryAnalysis(BaseModel):
    """LLM analysis of user query"""
    intent: Literal["debugging", "explanation", "modification", "general_understanding", "implementation"]
    entities: List[str] = Field(description="Specific code entities mentioned (classes, functions, files)")
    scope: Literal["focused", "moderate", "comprehensive"] = Field(description="Required context scope")
    files_of_interest: List[str] = Field(description="Files that are likely relevant")
    keywords: List[str] = Field(description="Important keywords from the query")
    complexity: Literal["simple", "moderate", "complex"] = Field(description="Query complexity level")


class ContextNode(BaseModel):
    """Node selected for context with metadata"""
    node_id: str
    node_name: str
    node_type: str
    file_path: Optional[str] = None
    relevance_score: float = Field(ge=0.0, le=1.0, description="Relevance score (0-1)")
    inclusion_reason: str = Field(description="Why this node was included")
    code_snippet: Optional[str] = None
    line_range: Optional[str] = None


class ContextMetadata(BaseModel):
    """Metadata about the context selection process"""
    query_analysis: QueryAnalysis
    total_nodes_available: int
    nodes_selected: int
    context_completeness: float = Field(ge=0.0, le=1.0, description="How complete the context is (0-1)")
    token_usage_estimate: int
    selection_strategy: str
    processing_time_ms: int


class SmartContextResult(BaseModel):
    """Result of smart context building"""
    context_text: str
    context_nodes: List[ContextNode]
    metadata: ContextMetadata


class GraphSearchRequest(BaseModel):
    """Request for graph-based context search"""
    repository_id: str
    user_query: str
    max_context_tokens: int = Field(default=4000, description="Maximum tokens to use for context")
    scope_preference: Literal["focused", "moderate", "comprehensive"] = Field(default="moderate")
    include_dependencies: bool = Field(default=True, description="Include related dependencies")
    max_traversal_depth: int = Field(default=2, ge=1, le=3, description="Maximum graph traversal depth")


class GraphFunctionResult(BaseModel):
    """Result from graph function calls"""
    function_name: str
    parameters: Dict[str, Any]
    result: Any
    execution_time_ms: int


class GraphAnalysisSession(BaseModel):
    """Session tracking for multi-step LLM analysis"""
    session_id: str
    repository_id: str
    user_query: str
    analysis_steps: List[GraphFunctionResult] = []
    current_context_nodes: List[str] = []
    total_tokens_used: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Function calling schemas for LLM
class GetNodesByCategoryParams(BaseModel):
    """Parameters for get_nodes_by_category function"""
    category: Literal["module", "class", "function", "method", "directory", "external_symbol"]
    limit: Optional[int] = Field(default=50, ge=1, le=200)


class GetNodesByNamePatternParams(BaseModel):
    """Parameters for get_nodes_by_name_pattern function"""
    pattern: str = Field(description="Name pattern to match (supports wildcards)")
    limit: Optional[int] = Field(default=20, ge=1, le=100)


class GetConnectedNodesParams(BaseModel):
    """Parameters for get_connected_nodes function"""
    node_id: str
    relationship: Optional[str] = Field(default=None, description="Specific relationship type to filter by")
    direction: Literal["incoming", "outgoing", "both"] = Field(default="both")
    limit: Optional[int] = Field(default=20, ge=1, le=100)


class GetFileRelatedNodesParams(BaseModel):
    """Parameters for get_file_related_nodes function"""
    file_path: str
    include_imports: bool = Field(default=True)
    include_exports: bool = Field(default=True)


class TraverseDependenciesParams(BaseModel):
    """Parameters for traverse_dependencies function"""
    node_id: str
    depth: int = Field(default=2, ge=1, le=3)
    follow_relationships: List[str] = Field(
        default=["calls", "inherits", "imports_module", "imports_symbol"],
        description="Which relationships to follow during traversal"
    )


class GraphSearchStats(BaseModel):
    """Statistics about graph search performance"""
    total_queries: int = 0
    average_response_time_ms: float = 0.0
    context_hit_rate: float = 0.0
    user_satisfaction_score: float = 0.0
    most_accessed_nodes: List[str] = []
    most_common_query_types: Dict[str, int] = {}