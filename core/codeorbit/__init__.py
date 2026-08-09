"""
CodeOrbit - AI-Powered Codebase Analysis

Navigate the orbit of your codebase with AI assistance.
Supports multiple languages including Python, JavaScript, TypeScript, and React/Next.js.
"""

__version__ = "0.1.1"
__author__ = "CodeOrbit Team"
__email__ = "support@codeorbit.dev"

from .graph_generator import (
    GraphGenerator,
    GraphNodeData,
    GraphEdgeData,
    LanguageParser,
    PythonParser,
    JavaScriptParser,
    ReactParser,
    NextJSParser,
    IPYSIGMA_AVAILABLE,
)

from .custom_ast_parser import CustomTreeSitterParser
from .graph_search_tool import GraphSearchTool

# Modal support (optional)
try:
    from .modal_app import (
        create_modal_app,
        create_modal_function,
        create_modal_batch_function,
        generate_graph,
        generate_graphs_batch,
        MODAL_AVAILABLE,
    )
    MODAL_SUPPORT = True
except ImportError:
    MODAL_SUPPORT = False
    create_modal_app = None
    create_modal_function = None 
    create_modal_batch_function = None
    generate_graph = None
    generate_graphs_batch = None
    MODAL_AVAILABLE = False

__all__ = [
    "GraphGenerator",
    "GraphNodeData", 
    "GraphEdgeData",
    "LanguageParser",
    "PythonParser",
    "JavaScriptParser", 
    "ReactParser",
    "NextJSParser",
    "CustomTreeSitterParser",
    "GraphSearchTool",
    "IPYSIGMA_AVAILABLE",
    # Modal support
    "create_modal_app",
    "create_modal_function",
    "create_modal_batch_function", 
    "generate_graph",
    "generate_graphs_batch",
    "MODAL_AVAILABLE",
    "MODAL_SUPPORT",
]