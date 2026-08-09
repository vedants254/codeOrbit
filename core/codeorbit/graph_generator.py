import json
import os  # Added for path operations
import re
import ast
import zipfile
import tempfile
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple, Optional, Union
from pathlib import Path
from pyvis.network import Network
import networkx as nx

from tree_sitter import Language  # For Tree-sitter
import tree_sitter_javascript
import tree_sitter_typescript

from .custom_ast_parser import CustomTreeSitterParser  # Import the new parser

try:
    from ipysigma import Sigma
    IPYSIGMA_AVAILABLE = True
except ImportError:
    IPYSIGMA_AVAILABLE = False

# Graph Data Structures
GraphNodeData = Dict[str, Any]  # Detailed below
GraphEdgeData = Dict[str, Any]  # Detailed below

# Expected structure for GraphNodeData:
# {
#     "id": str,  # Fully qualified name, e.g., my.module.MyClass.my_method or my.module
#     "name": str,  # Simple name, e.g., my_method or my_module
#     "category": str,  # 'module', 'class', 'function', 'method', 'import_statement'
#     "file": str,  # File path relative to repo root
#     "start_line": int,
#     "end_line": int,
#     "code": Optional[str],  # Code snippet
#     "parent_id": Optional[str], # ID of the parent node (e.g., class for a method, module for a class/function)
#     "imports": Optional[List[Dict[str,str]]], # For module nodes: [{"name": "os", "alias": "my_os", "source_module": "os"}]
# }

# Expected structure for GraphEdgeData:
# {
#     "source": str,  # Source node_id
#     "target": str,  # Target node_id
#     "relationship": str,  # 'defines_class', 'defines_function', 'defines_method',
#                           # 'inherits', 'calls', 'imports_module', 'imports_symbol', 'references_symbol'
#     "file": Optional[str], # File where the relationship is observed (e.g., a call site)
#     "line": Optional[int]  # Line number of the relationship (e.g., call site line)
# }


def _get_node_end_line(node: ast.AST) -> int:
    """Safely get end_lineno for an AST node."""
    if hasattr(node, "end_lineno") and node.end_lineno is not None:
        return node.end_lineno
    return node.lineno  # Fallback for older Python or nodes without explicit end


class LanguageParser(ABC):
    @abstractmethod
    def parse(
        self, files: List[Dict[str, Any]], all_files_content: Dict[str, str]
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        """
        Parses a list of files of a specific language and extracts graph nodes and edges.
        Each file in the list is a dictionary with at least 'path' and 'content'.
        all_files_content provides content of all files for cross-file analysis if needed.
        """
        pass


class PythonParser(LanguageParser):
    def parse(
        self, files: List[Dict[str, Any]], all_files_content: Dict[str, str]
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        nodes_data: List[GraphNodeData] = []
        edges_data: List[GraphEdgeData] = []

        self.module_imports: Dict[str, Dict[str, str]] = {}
        self.defined_symbols: Dict[str, GraphNodeData] = {}

        for file_data in files:
            file_path = file_data["path"]
            is_notebook = file_path.endswith(".ipynb")
            is_python_file = file_path.endswith(".py")

            if not (is_python_file or is_notebook):
                continue

            file_content_for_parsing = ""
            module_name_from_path = ""
            actual_file_path_for_nodes = file_path  # Store original path for nodes

            if is_notebook:
                file_content_for_parsing = file_data.get(
                    "python_equivalent_content", ""
                )
                # Generate a unique module name for notebooks, e.g., notebook.my_notebook_file
                base_name = Path(file_path).stem
                module_name_from_path = f"notebook.{base_name.replace('/', '.')}"
            elif is_python_file:
                file_content_for_parsing = file_data.get("content", "")
                module_name_from_path = file_path.replace("/", ".").rstrip(".py")

            if not file_content_for_parsing:
                # print(f"Skipping {file_path} due to empty content for parsing.")
                continue

            module_node_id = module_name_from_path
            module_node: GraphNodeData = {
                "id": module_node_id,
                "name": module_name_from_path.split(".")[-1],
                "category": "module",
                "file": actual_file_path_for_nodes,  # Use original path here
                "start_line": 1,
                "end_line": len(file_content_for_parsing.splitlines()),
                "code": None,
                "parent_id": str(Path(actual_file_path_for_nodes).parent),
                "imports": [],
            }
            nodes_data.append(module_node)
            self.defined_symbols[module_node_id] = module_node
            self.module_imports[
                actual_file_path_for_nodes
            ] = {}  # Use actual path for imports key

            try:
                tree = ast.parse(
                    file_content_for_parsing, filename=actual_file_path_for_nodes
                )
                for node in ast.walk(tree):
                    for child in ast.iter_child_nodes(node):
                        setattr(child, "parent_ast_node", node)

                for node in tree.body:
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            imported_name = alias.name
                            as_name = alias.asname or imported_name
                            self.module_imports[actual_file_path_for_nodes][as_name] = (
                                imported_name
                            )
                            if module_node.get("imports"):
                                module_node["imports"].append(
                                    {
                                        "name": imported_name,
                                        "alias": as_name,
                                        "source_module": imported_name,
                                    }
                                )
                    elif isinstance(node, ast.ImportFrom):
                        from_module = node.module or ""
                        for alias in node.names:
                            imported_name = alias.name
                            as_name = alias.asname or imported_name
                            full_imported_name = f"{from_module}.{imported_name}"
                            self.module_imports[actual_file_path_for_nodes][as_name] = (
                                full_imported_name
                            )
                            if module_node.get("imports"):
                                module_node["imports"].append(
                                    {
                                        "name": imported_name,
                                        "alias": as_name,
                                        "source_module": from_module,
                                    }
                                )
                    elif isinstance(node, ast.ClassDef):
                        class_id = f"{module_node_id}.{node.name}"
                        class_node: GraphNodeData = {
                            "id": class_id,
                            "name": node.name,
                            "category": "class",
                            "file": actual_file_path_for_nodes,
                            "start_line": node.lineno,
                            "end_line": _get_node_end_line(node),
                            "code": ast.unparse(node)
                            if hasattr(ast, "unparse")
                            else "Code unavailable",
                            "parent_id": module_node_id,
                        }
                        nodes_data.append(class_node)
                        self.defined_symbols[class_id] = class_node
                        edges_data.append(
                            {
                                "source": module_node_id,
                                "target": class_id,
                                "relationship": "defines_class",
                                "file": actual_file_path_for_nodes,
                                "line": node.lineno,
                            }
                        )
                        for func_node in node.body:
                            if isinstance(func_node, ast.FunctionDef):
                                method_id = f"{class_id}.{func_node.name}"
                                method_node: GraphNodeData = {
                                    "id": method_id,
                                    "name": func_node.name,
                                    "category": "method",
                                    "file": actual_file_path_for_nodes,
                                    "start_line": func_node.lineno,
                                    "end_line": _get_node_end_line(func_node),
                                    "code": ast.unparse(func_node)
                                    if hasattr(ast, "unparse")
                                    else "Code unavailable",
                                    "parent_id": class_id,
                                }
                                nodes_data.append(method_node)
                                self.defined_symbols[method_id] = method_node
                                edges_data.append(
                                    {
                                        "source": class_id,
                                        "target": method_id,
                                        "relationship": "defines_method",
                                        "file": actual_file_path_for_nodes,
                                        "line": func_node.lineno,
                                    }
                                )
                    elif isinstance(node, ast.FunctionDef):
                        func_id = f"{module_node_id}.{node.name}"
                        func_node_data: GraphNodeData = {
                            "id": func_id,
                            "name": node.name,
                            "category": "function",
                            "file": actual_file_path_for_nodes,
                            "start_line": node.lineno,
                            "end_line": _get_node_end_line(node),
                            "code": ast.unparse(node)
                            if hasattr(ast, "unparse")
                            else "Code unavailable",
                            "parent_id": module_node_id,
                        }
                        nodes_data.append(func_node_data)
                        self.defined_symbols[func_id] = func_node_data
                        edges_data.append(
                            {
                                "source": module_node_id,
                                "target": func_id,
                                "relationship": "defines_function",
                                "file": actual_file_path_for_nodes,
                                "line": node.lineno,
                            }
                        )
            except Exception as e:
                print(
                    f"Error parsing Python file/notebook (pass 1) {actual_file_path_for_nodes}: {e}"
                )
                continue

        # Second pass: Resolve calls, inheritance, and other relationships
        for file_data in files:
            file_path = file_data["path"]
            is_notebook = file_path.endswith(".ipynb")
            is_python_file = file_path.endswith(".py")

            if not (is_python_file or is_notebook):
                continue

            actual_file_path_for_nodes = file_path  # Store original path
            file_content_for_parsing = ""
            current_module_id = ""

            if is_notebook:
                file_content_for_parsing = file_data.get(
                    "python_equivalent_content", ""
                )
                base_name = Path(file_path).stem
                current_module_id = f"notebook.{base_name.replace('/', '.')}"
            elif is_python_file:
                file_content_for_parsing = file_data.get("content", "")
                current_module_id = file_path.replace("/", ".").rstrip(".py")

            if not file_content_for_parsing:
                continue

            try:
                tree = ast.parse(
                    file_content_for_parsing, filename=actual_file_path_for_nodes
                )
                for node_walker in ast.walk(tree):
                    for child in ast.iter_child_nodes(node_walker):
                        setattr(child, "parent_ast_node", node_walker)

                for node in ast.walk(tree):
                    # Use actual_file_path_for_nodes for resolving symbols, as imports are keyed by it
                    context_id_for_symbols = self._get_context_id(
                        node, current_module_id
                    )

                    if isinstance(node, ast.ClassDef):
                        class_id = f"{current_module_id}.{node.name}"
                        for base_node in node.bases:
                            base_name = (
                                ast.unparse(base_node)
                                if hasattr(ast, "unparse")
                                else "unknown_base"
                            )
                            resolved_base_id = self._resolve_symbol(
                                base_name, actual_file_path_for_nodes, current_module_id
                            )
                            if resolved_base_id:
                                target_id = resolved_base_id
                            else:
                                target_id = base_name
                            if self.defined_symbols.get(
                                target_id
                            ) or not target_id.startswith(current_module_id):
                                edges_data.append(
                                    {
                                        "source": class_id,
                                        "target": target_id,
                                        "relationship": "inherits",
                                        "file": actual_file_path_for_nodes,
                                        "line": base_node.lineno,
                                    }
                                )
                    elif isinstance(node, ast.Call):
                        if not context_id_for_symbols:
                            continue

                        callee_name_str = ""
                        if isinstance(node.func, ast.Name):
                            callee_name_str = node.func.id
                        elif isinstance(node.func, ast.Attribute):
                            obj_name = (
                                ast.unparse(node.func.value)
                                if hasattr(ast, "unparse")
                                else "unknown_object"
                            )
                            callee_name_str = f"{obj_name}.{node.func.attr}"

                        if callee_name_str:
                            resolved_callee_id = self._resolve_symbol(
                                callee_name_str,
                                actual_file_path_for_nodes,
                                current_module_id,
                            )
                            if resolved_callee_id:
                                target_id = resolved_callee_id
                            else:
                                target_id = callee_name_str

                            if self.defined_symbols.get(target_id) or (
                                "." in target_id
                                and not target_id.startswith(current_module_id)
                            ):
                                edges_data.append(
                                    {
                                        "source": context_id_for_symbols,
                                        "target": target_id,
                                        "relationship": "calls",
                                        "file": actual_file_path_for_nodes,
                                        "line": node.lineno,
                                    }
                                )
            except Exception as e:
                print(
                    f"Error parsing Python file/notebook (pass 2) {actual_file_path_for_nodes}: {e}"
                )
                continue

        return nodes_data, edges_data

    def _get_context_id(self, ast_node: ast.AST, module_id: str) -> Optional[str]:
        """Helper to find the ID of the function/method/class containing the ast_node."""
        node = ast_node
        while node:
            if isinstance(node, ast.FunctionDef):
                parent = getattr(node, "parent_ast_node", None)
                if isinstance(parent, ast.ClassDef):
                    return f"{module_id}.{parent.name}.{node.name}"
                return f"{module_id}.{node.name}"
            elif isinstance(node, ast.ClassDef):
                return f"{module_id}.{node.name}"
            node = getattr(node, "parent_ast_node", None)
        return module_id  # Default to module if not in a specific context

    def _resolve_symbol(
        self, name: str, current_file_path: str, current_module_id: str
    ) -> Optional[str]:
        """Try to resolve a symbol name to its fully qualified ID."""
        # 1. Check if it's a defined symbol in the current module (already fully qualified if so)
        if name in self.defined_symbols:
            return name  # e.g. name is already "module.Class"

        # 2. Check if it's a direct name within the current module's scope
        potential_local_id = f"{current_module_id}.{name}"
        if potential_local_id in self.defined_symbols:
            return potential_local_id

        # 3. Check imports for the current file
        imports = self.module_imports.get(current_file_path, {})
        parts = name.split(".", 1)
        first_part = parts[0]

        if first_part in imports:
            imported_base = imports[
                first_part
            ]  # This could be 'module_x' or 'module_x.SymbolY'
            if len(parts) > 1:  # e.g. name is 'alias.sub_symbol'
                # If imported_base is 'module_x', then target is 'module_x.sub_symbol'
                # If imported_base is 'module_x.SymbolY' (and SymbolY is a class/obj), then this is an attribute access
                # This part needs more robust handling of whether imported_base is a module or a symbol itself
                if (
                    imported_base in self.defined_symbols
                    and self.defined_symbols[imported_base]["category"] == "module"
                ):
                    return f"{imported_base}.{parts[1]}"
                return (
                    f"{imported_base}.{parts[1]}"
                    if "." not in imported_base
                    else imported_base
                )  # Heuristic
            else:  # e.g. name is 'alias'
                return imported_base  # This is the fully_qualified_name of the import

        # 4. Check builtins (simplified) - Python's AST doesn't easily distinguish them without more context
        # if name in __builtins__: return f"builtins.{name}"

        # 5. If it contains '.', assume it might be an already fully qualified name from another module
        if "." in name:
            if name in self.defined_symbols:  # Check if it's a known FQN
                return name
            # It could be an FQN not yet in defined_symbols if it's from a file not yet parsed or an external lib
            # For now, we return it as is, and graph rendering will show it as a distinct node.
            return name

        return None  # Cannot resolve


# --- Tree-sitter Queries (Initial Basic Versions) ---
# These need to be significantly expanded for comprehensive parsing.

JS_JSX_QUERY = """
[
  ; Module-level constructs
  (program . (_) @program_body)

  ; Import statements
  (import_statement
    source: (string) @import.source
    [
      (import_clause
        (identifier) @import.default) ; import D from 'mod'
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.named.name
            alias: (identifier)? @import.named.alias))) ; import { N as A } from 'mod'
      (import_clause
        (namespace_import (identifier) @import.namespace)) ; import * as NS from 'mod'
    ]?
  ) @import.statement

  ; Export statements
  (export_statement
    declaration: [
      (function_declaration name: (identifier) @function.name)
      (class_declaration name: (identifier) @class.name)
      (lexical_declaration (variable_declarator name: (identifier) @variable.name))
    ]
  ) @export.declaration.statement ; export function/class/const foo ...

  (export_statement
    (named_exports
      (export_specifier
        name: (identifier) @export.named.name
        alias: (identifier)? @export.named.alias) @export.specifier
    )
  ) @export.named.statement ; export { foo as bar }

  (export_statement
    value: (_) @export.default.value
  ) @export.default.statement ; export default ...

  ; Function Definitions
  (function_declaration
    name: (identifier) @function.name) @function.definition
  (lexical_declaration
    (variable_declarator
      name: (identifier) @function.name
      value: (arrow_function))) @function.definition ; const foo = () => {}
  (function
    name: (identifier) @function.name) @function.definition ; (function foo() {}) - less common as standalone

  ; Class Definitions
  (class_declaration
    name: (identifier) @class.name
    superclass: [(identifier) (member_expression)]? @class.superclass) @class.definition
  (lexical_declaration
    (variable_declarator
      name: (identifier) @class.name
      value: (class (identifier)? @anonymous.class.name superclass: [(identifier) (member_expression)]? @class.superclass))) @class.definition ; const C = class {}

  ; Methods in Classes
  (method_definition
    name: (property_identifier) @method.name) @method.definition

  ; Variable Declarations (standalone)
  (lexical_declaration
    (variable_declarator
      name: (identifier) @variable.name
      value: (_)?)) @variable.declaration
  (variable_declaration ; var keyword
    (variable_declarator
      name: (identifier) @variable.name
      value: (_)?)) @variable.declaration

  ; JSX Elements (Opening/Self-closing for component name)
  ; Heuristic for component definition: function/class name starts with uppercase
  (function_declaration
    name: (identifier) @component.definition.name (#match? @component.definition.name "^[A-Z]")) @component.definition
  (lexical_declaration
    (variable_declarator
      name: (identifier) @component.definition.name (#match? @component.definition.name "^[A-Z]")
      value: (arrow_function))) @component.definition
  (class_declaration
    name: (identifier) @component.definition.name (#match? @component.definition.name "^[A-Z]")) @component.definition


  (jsx_opening_element
    name: [(identifier) @jsx.component.name (member_expression name: (_) @jsx.component.name)]
  ) @jsx.element.opening
  (jsx_self_closing_element
    name: [(identifier) @jsx.component.name (member_expression name: (_) @jsx.component.name)]
  ) @jsx.element.self_closing

  ; Call Expressions
  (call_expression
    function: [
        (identifier) @call.function_name 
        (member_expression 
            property: (property_identifier) @call.method_name 
            object: (_) @call.object_name)
    ]
    arguments: (arguments)
  ) @call.expression

  ; React Hooks (Heuristic: starts with 'use' and is a call)
  (call_expression
    function: (identifier) @hook.name (#match? @hook.name "^use[A-Z]")
  ) @hook.call
]
"""

TS_TSX_QUERY = (
    JS_JSX_QUERY[:-1]
    + """
  ; TypeScript Specific: Interfaces
  (interface_declaration
    name: (type_identifier) @interface.name) @interface.definition

  ; TypeScript Specific: Type Aliases
  (type_alias_declaration
    name: (type_identifier) @type.alias.name) @type.alias.definition

  ; TypeScript Specific: Enums
  (enum_declaration
    name: (identifier) @enum.name) @enum.definition

  ; More specific function/method captures for TS types (optional, can be detailed)
  (method_definition
    name: (property_identifier) @method.name
    parameters: (formal_parameters) @method.parameters
    return_type: (type_annotation)? @method.return_type_annotation
  ) @method.definition.typescript

  (function_declaration
    name: (identifier) @function.name
    parameters: (formal_parameters) @function.parameters
    return_type: (type_annotation)? @function.return_type_annotation
  ) @function.definition.typescript
]
"""
)


class JavaScriptParser(LanguageParser):  # This is the old regex-based parser
    def __init__(self):
        # Regex for functions, classes, and basic imports/exports.
        # WARNING: Regex-based parsing for JS/TS is very limited and error-prone.
        # A proper AST parser (e.g., esprima, acorn, or tree-sitter) is highly recommended for robust analysis.

        # function funcName(...) or const funcName = (...) => { ... } or let funcName = function(...)
        self.function_pattern = re.compile(
            r"^\s*(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(|"  # function foo()
            r"^\s*(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>|"  # const foo = () =>
            r"^\s*(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*function\s*\(",  # const foo = function()
            re.MULTILINE,
        )

        self.class_pattern = re.compile(
            r"^\s*class\s+([a-zA-Z0-9_]+)(?:\s+extends\s+([a-zA-Z0-9_]+))?",
            re.MULTILINE,
        )

        # import defaultExport from 'module'; import { namedExport } from 'module'; import * as name from 'module';
        self.import_pattern = re.compile(
            r"import\s+(?:(.+?)\s+from\s+)?['\"]([^'\"]+)['\"]", re.MULTILINE
        )
        pass

    def parse(
        self, files_data: List[Dict[str, Any]], all_files_content: Dict[str, str]
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        nodes_data: List[GraphNodeData] = []
        edges_data: List[GraphEdgeData] = []

        for file_data in files_data:
            path = file_data["path"]
            # Ensure the parser only processes files it's supposed to handle,
            # although GraphGenerator._get_parser should already filter.
            if not (path.endswith((".js", ".jsx", ".ts", ".tsx"))):
                continue

            content = file_data["content"]
            # Module ID from path, similar to Python
            module_id = path.replace("/", ".").rsplit(".", 1)[0]
            if (
                Path(path).name == Path(path).stem and "." not in Path(path).stem
            ):  # for files like 'index' without extension in id
                module_id = path.replace("/", ".")

            # Create module node
            module_node: GraphNodeData = {
                "id": module_id,
                "name": Path(path).name,  # Use full filename as name for module
                "category": "module",
                "file": path,
                "start_line": 1,
                "end_line": len(content.splitlines()),
                "code": None,
                "parent_id": str(Path(path).parent),  # Set parent to directory path
                "imports": [],
            }
            nodes_data.append(module_node)

            lines = content.splitlines()
            for lineno_idx, line_content in enumerate(lines):
                lineno = lineno_idx + 1

                # Functions
                for match in self.function_pattern.finditer(line_content):
                    func_name = match.group(1) or match.group(2) or match.group(3)
                    if func_name:
                        node_id = f"{module_id}.{func_name}"
                        nodes_data.append(
                            {
                                "id": node_id,
                                "name": func_name,
                                "category": "function",
                                "file": path,
                                "start_line": lineno,
                                "end_line": lineno,  # Simplified
                                "code": line_content.strip(),
                                "parent_id": module_id,
                            }
                        )
                        edges_data.append(
                            {
                                "source": module_id,
                                "target": node_id,
                                "relationship": "defines_function",
                                "file": path,
                                "line": lineno,
                            }
                        )

                # Classes
                class_match = self.class_pattern.search(line_content)
                if class_match:
                    class_name = class_match.group(1)
                    base_class_name = class_match.group(2)
                    node_id = f"{module_id}.{class_name}"
                    nodes_data.append(
                        {
                            "id": node_id,
                            "name": class_name,
                            "category": "class",
                            "file": path,
                            "start_line": lineno,
                            "end_line": lineno,  # Simplified
                            "code": line_content.strip(),
                            "parent_id": module_id,
                        }
                    )
                    edges_data.append(
                        {
                            "source": module_id,
                            "target": node_id,
                            "relationship": "defines_class",
                            "file": path,
                            "line": lineno,
                        }
                    )
                    if base_class_name:
                        # Simplified: create an edge to a potential external or unresolved base class
                        # Proper resolution would require knowing all class definitions or using _resolve_symbol logic
                        # target_base_id = f"{module_id.rsplit('.',1)[0]}.{base_class_name}" # Guess, might be wrong - Unused
                        # A better target_base_id would be just base_class_name if it's imported, or fully qualified.
                        # For now, we'll use a simple name and let graph generator handle it as potentially external.
                        edges_data.append(
                            {
                                "source": node_id,
                                "target": base_class_name,
                                "relationship": "inherits",
                                "file": path,
                                "line": lineno,
                            }
                        )

                # Imports (very basic)
                for imp_match in self.import_pattern.finditer(line_content):
                    imported_items_str = imp_match.group(
                        1
                    )  # e.g., " D, { A, B as C }" or " * as ns " or " D "
                    source_module_path_raw = imp_match.group(
                        2
                    )  # e.g., './utils', 'react', '../components/Button'

                    target_module_id = ""
                    if source_module_path_raw.startswith("."):  # Relative import
                        try:
                            # base_dir = Path(path).parent # Unused
                            # resolved_path = base_dir.joinpath(source_module_path_raw).resolve() # Unused
                            # found_canonical = None # Unused
                            # normalized_import_path = str((Path(path).parent / source_module_path_raw).resolve()) # Unused
                            target_module_id = (
                                source_module_path_raw  # Fallback to raw path for now
                            )
                        except Exception:
                            target_module_id = source_module_path_raw
                    else:  # Absolute import (e.g. 'react', 'lodash/debounce')
                        target_module_id = source_module_path_raw

                    if module_node.get("imports") is not None:
                        module_node["imports"].append(
                            {  # type: ignore
                                "name": imported_items_str.strip()
                                if imported_items_str
                                else source_module_path_raw,
                                "alias": None,  # Regex doesn't easily parse aliases here
                                "source_module": source_module_path_raw,
                            }
                        )

                    edges_data.append(
                        {
                            "source": module_id,
                            "target": target_module_id,  # This will be treated as an ID
                            "relationship": "imports_module",
                            "file": path,
                            "line": lineno,
                        }
                    )

        # print(f"JS Parser found {len(nodes_data) - len(files_data)} entities in {len(files_data)} JS/TS files (excluding module nodes).")
        return nodes_data, edges_data


class ReactParser(LanguageParser):  # Changed from JavaScriptParser
    def __init__(self, project_root_path: Path):
        self.project_root_path = project_root_path
        # For .js and .jsx files. TSX language can parse JSX.
        # Using TSX for JSX might be more robust if tree_sitter_javascript doesn't handle JSX well.
        # Let's assume tree_sitter_typescript.language_tsx() is good for .jsx
        # and tree_sitter_javascript.language() for .js
        try:
            js_lang = Language(tree_sitter_javascript.language())
            self.js_ts_parser = CustomTreeSitterParser(
                language=js_lang,
                query_string=JS_JSX_QUERY,  # A query that works for JS
                project_root_path=self.project_root_path,
            )
        except Exception as e:
            print(f"Failed to initialize JS TreeSitter parser: {e}")
            self.js_ts_parser = None

        try:
            jsx_lang = Language(
                tree_sitter_typescript.language_tsx()
            )  # TSX lang for .jsx
            self.jsx_ts_parser = CustomTreeSitterParser(
                language=jsx_lang,
                query_string=JS_JSX_QUERY,  # A query that works for JSX
                project_root_path=self.project_root_path,
            )
        except Exception as e:
            print(f"Failed to initialize JSX TreeSitter parser: {e}")
            self.jsx_ts_parser = None

        # Fallback regex parser (optional, or remove if confident in tree-sitter)
        self.regex_parser = JavaScriptParser()  # The old one

    def parse(
        self, files_data: List[Dict[str, Any]], all_files_content: Dict[str, str]
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        all_nodes: List[GraphNodeData] = []
        all_edges: List[GraphEdgeData] = []

        js_files = []
        jsx_files = []
        other_files_for_regex = []

        for file_data in files_data:
            path = file_data["path"]
            if path.endswith(".jsx"):
                jsx_files.append(file_data)
            elif path.endswith(".js"):
                js_files.append(file_data)
            else:  # Should not happen if GraphGenerator filters correctly
                other_files_for_regex.append(file_data)

        if self.jsx_ts_parser and jsx_files:
            print(f"ReactParser: Parsing {len(jsx_files)} .jsx files with Tree-sitter.")
            for file_data in jsx_files:
                try:
                    nodes, edges = self.jsx_ts_parser.parse_file_content(
                        file_data["path"], file_data["content"]
                    )
                    all_nodes.extend(nodes)
                    all_edges.extend(edges)
                except Exception as e:
                    print(
                        f"Error parsing {file_data['path']} with JSX Tree-sitter: {e}. Falling back to regex."
                    )
                    # Fallback for this specific file
                    reg_nodes, reg_edges = self.regex_parser.parse(
                        [file_data], all_files_content
                    )
                    all_nodes.extend(reg_nodes)
                    all_edges.extend(reg_edges)
        elif jsx_files:  # Parser not initialized, use regex
            print(
                f"ReactParser: JSX Tree-sitter not available. Parsing {len(jsx_files)} .jsx files with regex."
            )
            reg_nodes, reg_edges = self.regex_parser.parse(jsx_files, all_files_content)
            all_nodes.extend(reg_nodes)
            all_edges.extend(reg_edges)

        if self.js_ts_parser and js_files:
            print(f"ReactParser: Parsing {len(js_files)} .js files with Tree-sitter.")
            for file_data in js_files:
                try:
                    nodes, edges = self.js_ts_parser.parse_file_content(
                        file_data["path"], file_data["content"]
                    )
                    all_nodes.extend(nodes)
                    all_edges.extend(edges)
                except Exception as e:
                    print(
                        f"Error parsing {file_data['path']} with JS Tree-sitter: {e}. Falling back to regex."
                    )
                    reg_nodes, reg_edges = self.regex_parser.parse(
                        [file_data], all_files_content
                    )
                    all_nodes.extend(reg_nodes)
                    all_edges.extend(reg_edges)
        elif js_files:  # Parser not initialized, use regex
            print(
                f"ReactParser: JS Tree-sitter not available. Parsing {len(js_files)} .js files with regex."
            )
            reg_nodes, reg_edges = self.regex_parser.parse(js_files, all_files_content)
            all_nodes.extend(reg_nodes)
            all_edges.extend(reg_edges)

        if other_files_for_regex:  # Fallback for any other files passed unexpectedly
            reg_nodes, reg_edges = self.regex_parser.parse(
                other_files_for_regex, all_files_content
            )
            all_nodes.extend(reg_nodes)
            all_edges.extend(reg_edges)

        # print(f"ReactParser processed {len(files_data)} files. Nodes: {len(all_nodes)}, Edges: {len(all_edges)}")
        return all_nodes, all_edges


class NextJSParser(ReactParser):
    def __init__(self, project_root_path: Path):
        super().__init__(
            project_root_path
        )  # Initializes JS/JSX parsers from ReactParser

        try:
            ts_lang = Language(tree_sitter_typescript.language_typescript())
            self.ts_parser = CustomTreeSitterParser(
                language=ts_lang,
                query_string=TS_TSX_QUERY,  # Query for .ts files
                project_root_path=self.project_root_path,
            )
        except Exception as e:
            print(f"Failed to initialize TS TreeSitter parser: {e}")
            self.ts_parser = None

        try:
            tsx_lang = Language(tree_sitter_typescript.language_tsx())
            self.tsx_parser = CustomTreeSitterParser(
                language=tsx_lang,
                query_string=TS_TSX_QUERY,  # Query for .tsx files
                project_root_path=self.project_root_path,
            )
        except Exception as e:
            print(f"Failed to initialize TSX TreeSitter parser: {e}")
            self.tsx_parser = None

    def parse(
        self, files_data: List[Dict[str, Any]], all_files_content: Dict[str, str]
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        all_nodes: List[GraphNodeData] = []
        all_edges: List[GraphEdgeData] = []

        js_jsx_files = []
        ts_files = []
        tsx_files = []

        for file_data in files_data:
            path = file_data["path"]
            if path.endswith(".tsx"):
                tsx_files.append(file_data)
            elif path.endswith(".ts"):
                ts_files.append(file_data)
            elif path.endswith((".js", ".jsx")):
                js_jsx_files.append(file_data)
            # Other file types are ignored by this parser

        # Parse .ts files
        if self.ts_parser and ts_files:
            print(f"NextJSParser: Parsing {len(ts_files)} .ts files with Tree-sitter.")
            for file_data in ts_files:
                try:
                    nodes, edges = self.ts_parser.parse_file_content(
                        file_data["path"], file_data["content"]
                    )
                    all_nodes.extend(nodes)
                    all_edges.extend(edges)
                except Exception as e:
                    print(
                        f"Error parsing {file_data['path']} with TS Tree-sitter: {e}."
                    )
                    # No regex fallback for TS, as JavaScriptParser is not suitable
        elif ts_files:
            print(
                f"NextJSParser: TS Tree-sitter not available for {len(ts_files)} .ts files. Skipping."
            )

        # Parse .tsx files
        if self.tsx_parser and tsx_files:
            print(
                f"NextJSParser: Parsing {len(tsx_files)} .tsx files with Tree-sitter."
            )
            for file_data in tsx_files:
                try:
                    nodes, edges = self.tsx_parser.parse_file_content(
                        file_data["path"], file_data["content"]
                    )
                    all_nodes.extend(nodes)
                    all_edges.extend(edges)
                except Exception as e:
                    print(
                        f"Error parsing {file_data['path']} with TSX Tree-sitter: {e}."
                    )
        elif tsx_files:
            print(
                f"NextJSParser: TSX Tree-sitter not available for {len(tsx_files)} .tsx files. Skipping."
            )

        # Parse .js/.jsx files using ReactParser's logic (which includes its own Tree-sitter or regex fallback)
        if js_jsx_files:
            print(
                f"NextJSParser: Delegating {len(js_jsx_files)} .js/.jsx files to ReactParser logic."
            )
            # Temporarily create a ReactParser instance or call super().parse directly
            # For simplicity, let's assume super().parse can be called if structured well.
            # However, super().parse expects all files to be js/jsx. We need to filter.
            # This part needs careful handling of how super().parse is invoked.
            # Let's call the base ReactParser's parse method with the filtered list.
            # This means ReactParser.parse should be designed to handle only its relevant files.
            # The current ReactParser.parse filters for .js and .jsx, so this should be okay.
            react_nodes, react_edges = super().parse(js_jsx_files, all_files_content)
            all_nodes.extend(react_nodes)
            all_edges.extend(react_edges)

        # Next.js specific post-processing (e.g., identifying page modules)
        for node in all_nodes:
            if node["category"] == "module" and node.get("file"):
                file_path = node["file"]
                # Simplified check for Next.js pages/app routes
                if (
                    file_path.startswith("pages/")
                    or file_path.startswith("app/")
                    or file_path.startswith(str(Path("src") / "pages"))
                    or file_path.startswith(str(Path("src") / "app"))
                ):
                    node["category"] = "next_page_module"
                    # print(f"NextJSParser: Re-categorized {node['id']} as next_page_module")

        # print(f"NextJSParser processed {len(files_data)} files. Nodes: {len(all_nodes)}, Edges: {len(all_edges)}")
        return all_nodes, all_edges


class GraphGenerator:
    def __init__(
        self, files: List[Dict[str, Any]], output_html_path: Optional[str] = None
    ):
        self.files = files
        self.output_html_path = output_html_path
        self.all_files_content: Dict[str, str] = {}

        # Populate all_files_content, preferring python_equivalent_content for notebooks
        for file_data in self.files:
            path = file_data.get("path")
            if not path:
                continue
            if path.endswith(".ipynb"):
                self.all_files_content[path] = file_data.get(
                    "python_equivalent_content", file_data.get("content", "")
                )
            else:
                self.all_files_content[path] = file_data.get("content", "")

        # Determine project_root_path
        if self.files and "full_path" in self.files[0] and self.files[0]["full_path"]:
            all_full_paths = [
                Path(f["full_path"]).resolve() for f in self.files if f.get("full_path")
            ]
            if all_full_paths:
                # Find common path. os.path.commonpath might not work if paths are on different drives (Windows)
                # or if there's no commonality. A simpler approach for POSIX might be:
                # self.project_root_path = Path(os.path.commonpath([str(p) for p in all_full_paths]))
                # For robustness, let's find the longest common prefix of parent directories.
                if len(all_full_paths) == 1:
                    self.project_root_path = all_full_paths[0].parent
                else:
                    common_path = Path(
                        os.path.commonprefix([str(p) for p in all_full_paths])
                    )
                    # commonprefix gives character-wise commonality, ensure it's a directory
                    while (
                        not common_path.is_dir() and common_path != common_path.parent
                    ):
                        common_path = common_path.parent
                    self.project_root_path = common_path

            else:  # No full_paths provided or they are empty
                self.project_root_path = Path(
                    "."
                ).resolve()  # Fallback to current working directory
        else:  # No files or no full_path info
            self.project_root_path = Path(".").resolve()
        print(f"GraphGenerator: Determined project root: {self.project_root_path}")

        self.parsers: Dict[str, LanguageParser] = {
            ".py": PythonParser(),
            ".ipynb": PythonParser(),  # Route .ipynb to PythonParser
            # Default JS parser is regex-based for non-React/Next projects or fallback
            ".js": JavaScriptParser(),
            ".jsx": JavaScriptParser(),
            ".ts": JavaScriptParser(),  # Basic regex parser won't handle TS well
            ".tsx": JavaScriptParser(),
        }
        self.all_nodes_data: List[GraphNodeData] = []
        self.all_edges_data: List[GraphEdgeData] = []
        self.node_details_map: Dict[str, GraphNodeData] = {}

        self.project_type: str = "unknown"
        self._identify_project_type()
        self._update_parsers_based_on_project_type()

    def _identify_project_type(self):
        """Identifies the project type based on file structure and package.json."""
        file_paths = [f["path"] for f in self.files]
        file_contents = {f["path"]: f["content"] for f in self.files}

        package_json_path = None
        for p in ["package.json", "frontend/package.json"]:  # Common locations
            if p in file_paths:
                package_json_path = p
                break

        has_package_json = package_json_path is not None
        package_json_content: Dict[str, Any] = {}

        if has_package_json and package_json_path:
            try:
                package_json_content = json.loads(file_contents[package_json_path])
            except json.JSONDecodeError:
                print(f"Warning: Could not parse {package_json_path}")
                package_json_content = {}
            except KeyError:
                print(
                    f"Warning: Content for {package_json_path} not found in file_contents."
                )
                package_json_content = {}

        dependencies = package_json_content.get("dependencies", {})
        dev_dependencies = package_json_content.get("devDependencies", {})
        all_deps = {**dependencies, **dev_dependencies}

        # Check for Next.js
        is_nextjs = False
        if "next" in all_deps:
            is_nextjs = True

        # Check for Next.js specific directories/files, strengthens Next.js detection
        # Common Next.js files/dirs relative to where package.json might be or project root
        next_indicators = ["next.config.js", "next.config.mjs", "pages/", "app/"]
        # Adjust paths if package.json is in a subdirectory like 'frontend/'
        base_path_for_next_check = ""
        if package_json_path and Path(package_json_path).parent != Path("."):
            base_path_for_next_check = str(Path(package_json_path).parent) + "/"

        if any(
            (base_path_for_next_check + indicator) in file_paths
            or any(
                p.startswith(base_path_for_next_check + indicator)
                for p in file_paths
                if indicator.endswith("/")
            )
            for indicator in next_indicators
        ):
            if is_nextjs:  # Already confirmed by deps
                pass
            elif (
                has_package_json
            ):  # Found structure, and there is a package.json, good chance it's Next.js
                is_nextjs = True

        if is_nextjs:
            self.project_type = "nextjs"
            print(f"Identified project type: {self.project_type}")
            return

        # Check for React (if not Next.js)
        is_react = False
        if "react" in all_deps:
            is_react = True

        if (
            not is_react and has_package_json
        ):  # Check for JSX/TSX if react not in deps but package.json exists
            # Check for .jsx/.tsx files, considering base_path_for_next_check as potential root for frontend projects
            if any(
                f.startswith(base_path_for_next_check) and f.endswith((".jsx", ".tsx"))
                for f in file_paths
            ):
                is_react = True

        if is_react:
            self.project_type = "react"
            print(f"Identified project type: {self.project_type}")
            return

        if has_package_json:  # If package.json exists but not specifically React/Next
            self.project_type = "javascript"
            print(f"Identified project type: {self.project_type}")
            return

        # Check for Python (if no JavaScript project type identified)
        py_files_count = sum(1 for f in file_paths if f.endswith(".py"))
        # Common Python project indicators
        python_indicators = [
            "requirements.txt",
            "setup.py",
            "manage.py",
            "app.py",
            "main.py",
        ]
        has_python_indicator_file = any(
            indicator in file_paths for indicator in python_indicators
        )

        if py_files_count > 0 and (
            has_python_indicator_file or py_files_count > 3
        ):  # Heuristic
            self.project_type = "python"
            print(f"Identified project type: {self.project_type}")
            return

        self.project_type = "unknown"  # Default if no specific type identified
        print(f"Identified project type: {self.project_type}")

    def _update_parsers_based_on_project_type(self):
        """Updates the self.parsers mapping based on the identified project type."""
        if self.project_type == "nextjs":
            print("Updating parsers for Next.js project.")
            # Pass the determined project_root_path
            next_parser = NextJSParser(project_root_path=self.project_root_path)
            for ext in [".js", ".jsx", ".ts", ".tsx"]:  # NextParser handles all these
                self.parsers[ext] = next_parser
        elif self.project_type == "react":
            print("Updating parsers for React project.")
            react_parser = ReactParser(project_root_path=self.project_root_path)
            for ext in [".js", ".jsx"]:  # ReactParser handles these
                self.parsers[ext] = react_parser
            # For .ts, .tsx in a React project not identified as Next.js,
            # we might still want a TS-aware parser if available, or fallback.
            # For now, ReactParser only explicitly handles .js, .jsx with Tree-sitter.
            # Default regex parser will be used for .ts, .tsx if not Next.js.
        # If 'python', 'javascript', or 'unknown', the default parsers assigned in __init__ remain.
        # JavaScriptParser is the default for .js, .jsx, etc.
        # PythonParser is the default for .py.

    def _add_directory_nodes_to_list(self):
        """Creates directory nodes and adds them to all_nodes_data and node_details_map."""
        unique_dirs = set()

        for file_data in self.files:
            file_path_obj = Path(file_data["path"])
            # Add all parent directories
            for parent_dir in reversed(file_path_obj.parents):
                if str(parent_dir) == ".":  # Skip current dir reference
                    continue
                unique_dirs.add(str(parent_dir))

        sorted_dirs = sorted(list(unique_dirs))  # Sort to process parent dirs first

        for dir_path_str in sorted_dirs:
            dir_path_obj = Path(dir_path_str)
            dir_node_id = dir_path_str
            parent_dir_id = (
                str(dir_path_obj.parent) if dir_path_obj.parent != Path(".") else None
            )

            if dir_node_id not in self.node_details_map:
                dir_node: GraphNodeData = {
                    "id": dir_node_id,
                    "name": dir_path_obj.name,
                    "category": "directory",
                    "file": dir_path_str,  # The directory path itself
                    "start_line": 0,
                    "end_line": 0,
                    "code": None,
                    "parent_id": parent_dir_id if parent_dir_id else None,
                }
                self.all_nodes_data.append(dir_node)
                self.node_details_map[dir_node_id] = dir_node
                # Add edge from parent directory to this directory
                if parent_dir_id and parent_dir_id in self.node_details_map:
                    self.all_edges_data.append(
                        {
                            "source": parent_dir_id,
                            "target": dir_node_id,
                            "relationship": "contains_directory",
                        }
                    )

    def _get_parser(self, file_path: str) -> Optional[LanguageParser]:
        extension = Path(file_path).suffix.lower()
        return self.parsers.get(extension)

    def _generate_graph_elements(self):
        self.all_nodes_data = []
        self.all_edges_data = []
        self.node_details_map = {}

        # 1. Add directory nodes first
        self._add_directory_nodes_to_list()

        # 2. Group files by parser
        grouped_files_by_parser: Dict[LanguageParser, List[Dict[str, Any]]] = {}
        all_files_content = {
            file_data["path"]: file_data["content"] for file_data in self.files
        }

        for file_data in self.files:
            parser = self._get_parser(file_data["path"])
            if parser:
                if parser not in grouped_files_by_parser:
                    grouped_files_by_parser[parser] = []
                grouped_files_by_parser[parser].append(file_data)

        # 3. Parse files using appropriate parsers
        parsed_nodes_from_all_parsers: List[GraphNodeData] = []
        parsed_edges_from_all_parsers: List[GraphEdgeData] = []

        for parser, lang_files in grouped_files_by_parser.items():
            try:
                nodes, edges = parser.parse(lang_files, all_files_content)
                parsed_nodes_from_all_parsers.extend(nodes)
                parsed_edges_from_all_parsers.extend(edges)
            except Exception as e:
                print(f"Error during parsing with {type(parser).__name__}: {e}")

        # 4. Process and deduplicate nodes, establish module-directory links
        for node_data in parsed_nodes_from_all_parsers:
            node_id = node_data["id"]
            if node_id not in self.node_details_map:
                self.all_nodes_data.append(node_data)
                self.node_details_map[node_id] = node_data

                # If it's a module node, ensure its parent_id (directory path) exists as a directory node
                # and add an edge from the directory to the module.
                if node_data["category"] == "module":
                    module_parent_dir_id = node_data.get("parent_id")
                    if (
                        module_parent_dir_id
                        and module_parent_dir_id in self.node_details_map
                    ):
                        # Check if directory node exists (it should have been created by _add_directory_nodes_to_list)
                        if (
                            self.node_details_map[module_parent_dir_id]["category"]
                            == "directory"
                        ):
                            self.all_edges_data.append(
                                {
                                    "source": module_parent_dir_id,
                                    "target": node_id,
                                    "relationship": "contains_module",
                                    "file": node_data["file"],  # module file path
                                }
                            )
                    # else:
                    # print(f"Warning: Module '{node_id}' has parent_id '{module_parent_dir_id}' but no such directory node found.")

        # 5. Process edges, create external_symbol nodes if needed
        for edge_data in parsed_edges_from_all_parsers:
            source_id = edge_data["source"]
            target_id = edge_data["target"]

            # Ensure source node exists
            if source_id not in self.node_details_map:
                # print(f"Warning: Edge source '{source_id}' not found. Skipping edge: {edge_data}")
                continue

            # Ensure target node exists, or create an external symbol node for it
            if target_id not in self.node_details_map:
                # Heuristic: if target_id contains '.' and is not a file path, it might be an FQN
                # or if it's a path-like string for JS imports from external modules
                is_potential_fqn = (
                    "." in target_id and not Path(target_id).suffix
                )  # Avoid matching file paths as FQN
                is_js_external_module = (
                    target_id
                    and not target_id.startswith(".")
                    and not Path(target_id).is_absolute()
                    and not any(
                        target_id.endswith(ext)
                        for ext in [".js", ".ts", ".jsx", ".tsx"]
                    )
                )

                if (
                    is_potential_fqn
                    or is_js_external_module
                    or edge_data["relationship"] == "imports_module"
                ):  # Treat unresolved imports as external
                    # Create an external_symbol node
                    external_node: GraphNodeData = {
                        "id": target_id,
                        "name": target_id.split(".")[-1],
                        "category": "external_symbol",
                        "file": None,  # External, so no specific file in the project
                        "start_line": 0,
                        "end_line": 0,
                        "code": None,
                        "parent_id": None,
                    }
                    if target_id not in self.node_details_map:  # Add only if truly new
                        self.all_nodes_data.append(external_node)
                        self.node_details_map[target_id] = external_node
                    # print(f"Info: Created external_symbol node for '{target_id}'.")
                # else:
                # print(f"Warning: Edge target '{target_id}' not found and not treated as external. Skipping edge: {edge_data}")
                # continue # Skip if target is not found and not considered external

            # Add the edge if both source and (original or newly created external) target exist
            if (
                source_id in self.node_details_map
                and target_id in self.node_details_map
            ):
                self.all_edges_data.append(edge_data)
            # else:
            # print(f"Final Warning: Edge from '{source_id}' to '{target_id}' skipped due to missing target even after external check.")

        # print(f"Total nodes: {len(self.all_nodes_data)}, Total edges: {len(self.all_edges_data)}")
        # print(f"Node map size: {len(self.node_details_map)}")

    def _render_html_graph(self) -> str:
        net = Network(
            height="750px",
            width="100%",
            directed=True,
            bgcolor="#ffffff",
            font_color="black",
            notebook=False,
            # Improved physics for larger graphs
            # options='{"physics": {"barnesHut": {"gravitationalConstant": -30000, "centralGravity": 0.1, "springLength": 150, "springConstant": 0.05, "damping": 0.09, "avoidOverlap": 0.1}}}'
        )
        # net.show_buttons(filter_=['physics']) # If you want physics controls

        for node_data in self.all_nodes_data:  # Use the processed list
            node_id = node_data["id"]
            details = node_data  # self.node_details_map[node_id]

            label = details.get("name", node_id.split(".")[-1])
            category = details.get("category", "unknown")
            file_info = details.get("file", "N/A")
            start_line_info = details.get("start_line", "N/A")
            end_line_info = details.get("end_line", "N/A")
            code_snippet = (details.get("code", "") or "")[:200]  # Ensure not None

            color_map = {
                "module": "#10b981",  # Emerald
                "class": "#0ea5e9",  # Sky blue
                "method": "#f59e0b",  # Amber
                "function": "#f97316",  # Orange
                "import_statement": "#6366f1",  # Indigo
                "external_symbol": "#a3a3a3",  # Stone
                "directory": "grey",  # Grey for directories
                "default": "#6b7280",  # Gray
            }
            color = color_map.get(category, color_map["default"])

            title_parts = [
                f"ID: {node_id}",
                f"Type: {category}",
                f"File: {file_info} (Lines: {start_line_info}-{end_line_info})",
            ]
            if code_snippet:
                title_parts.append(f"Code: {code_snippet}...")
            title = "\\n".join(title_parts)

            shape_map = {
                "module": "box",
                "class": "ellipse",
                "method": "dot",
                "function": "dot",
                "external_symbol": "diamond",
                "directory": "diamond",  # Shape for directories
                "default": "ellipse",
            }
            shape = shape_map.get(category, shape_map["default"])
            size = 15 if category in ["method", "function"] else 25

            net.add_node(
                node_id,
                label=label,
                title=title,
                color=color,
                category=category,
                shape=shape,
                size=size,
            )

        for edge in self.all_edges_data:  # Use the processed list
            src, dst, rel = (
                edge.get("source"),
                edge.get("target"),
                edge.get("relationship", "related"),
            )
            # Source and target should exist due to pre-filtering in _generate_graph_elements

            edge_color_map = {
                "defines_class": "#059669",
                "defines_function": "#059669",
                "defines_method": "#059669",  # Darker Emerald
                "inherits": "#0284c7",  # Sky (darker)
                "calls": "#7c3aed",  # Violet (darker)
                "imports_module": "#db2777",  # Pink
                "imports_symbol": "#db2777",
                "references_symbol": "#eab308",  # Yellow
                "default": "#6b7280",  # Gray
            }
            edge_color = edge_color_map.get(rel, edge_color_map["default"])

            edge_title = f"{rel}\\nFile: {edge.get('file', 'N/A')}\\nLine: {edge.get('line', 'N/A')}"

            net.add_edge(
                src, dst, title=edge_title, label=rel, color=edge_color
            )  # Added label to edge for visibility

        net.write_html(self.output_html_path)
        return "/static/" + Path(self.output_html_path).name

    def generate(self) -> Dict[str, Any]:
        self._generate_graph_elements()  # This now populates self.all_nodes_data and self.all_edges_data

        result = {
            "nodes": self.all_nodes_data,  # Return the processed lists
            "edges": self.all_edges_data,
        }

        if self.output_html_path:
            html_url = self._render_html_graph()
            result["html_url"] = html_url

        return result

    def to_networkx(self) -> nx.DiGraph:
        """Convert the graph to a NetworkX DiGraph."""
        if not self.all_nodes_data:
            self._generate_graph_elements()
        
        G = nx.DiGraph()
        
        # Add nodes with attributes
        for node_data in self.all_nodes_data:
            node_id = node_data["id"]
            # Add all node attributes to NetworkX
            G.add_node(node_id, **node_data)
        
        # Add edges with attributes
        # NetworkX doesn't support multiple edges between the same nodes in DiGraph
        # If there are multiple edges, they will be merged and only the last one's attributes kept
        edge_keys_seen = set()
        for edge_data in self.all_edges_data:
            source = edge_data["source"]
            target = edge_data["target"]
            
            # Skip edges where source or target nodes don't exist
            if source not in G.nodes() or target not in G.nodes():
                continue
                
            edge_key = (source, target)
            if edge_key in edge_keys_seen:
                # This is a duplicate edge - NetworkX will overwrite the previous one
                # You might want to handle this differently based on your needs
                pass
            edge_keys_seen.add(edge_key)
            
            # Add edge attributes (excluding source/target which are handled separately)
            edge_attrs = {k: v for k, v in edge_data.items() if k not in ["source", "target"]}
            G.add_edge(source, target, **edge_attrs)
        
        return G

    def from_networkx(self, G: nx.DiGraph) -> None:
        """Load graph data from a NetworkX DiGraph."""
        self.all_nodes_data = []
        self.all_edges_data = []
        self.node_details_map = {}
        
        # Extract nodes
        for node_id, node_attrs in G.nodes(data=True):
            node_data = dict(node_attrs)
            # Ensure required fields exist
            if "id" not in node_data:
                node_data["id"] = node_id
            if "name" not in node_data:
                node_data["name"] = str(node_id).split(".")[-1]
            if "category" not in node_data:
                node_data["category"] = "unknown"
            
            self.all_nodes_data.append(node_data)
            self.node_details_map[node_id] = node_data
        
        # Extract edges
        for source, target, edge_attrs in G.edges(data=True):
            edge_data = dict(edge_attrs)
            edge_data["source"] = source
            edge_data["target"] = target
            if "relationship" not in edge_data:
                edge_data["relationship"] = "related"
            
            self.all_edges_data.append(edge_data)

    def save_json(self, file_path: str) -> None:
        """Save the graph to a JSON file."""
        if not self.all_nodes_data:
            self._generate_graph_elements()
        
        graph_data = {
            "nodes": self.all_nodes_data,
            "edges": self.all_edges_data,
            "metadata": {
                "project_type": getattr(self, "project_type", "unknown"),
                "total_files": len(self.files),
                "node_count": len(self.all_nodes_data),
                "edge_count": len(self.all_edges_data)
            }
        }
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, indent=2, ensure_ascii=False)

    def load_json(self, file_path: str) -> None:
        """Load graph data from a JSON file."""
        with open(file_path, "r", encoding="utf-8") as f:
            graph_data = json.load(f)
        
        self.all_nodes_data = graph_data.get("nodes", [])
        self.all_edges_data = graph_data.get("edges", [])
        
        # Rebuild node_details_map
        self.node_details_map = {}
        for node_data in self.all_nodes_data:
            self.node_details_map[node_data["id"]] = node_data
        
        # Update project metadata if available
        metadata = graph_data.get("metadata", {})
        if "project_type" in metadata:
            self.project_type = metadata["project_type"]

    def save_graphml(self, file_path: str) -> None:
        """Save the graph to a GraphML file using NetworkX."""
        G = self.to_networkx()
        
        # GraphML only supports basic types, so serialize complex types to JSON
        def serialize_attr(value):
            if value is None:
                return "null"
            elif isinstance(value, (list, dict)):
                return json.dumps(value)
            elif isinstance(value, (str, int, float, bool)):
                return value
            else:
                return str(value)
        
        # Process node attributes
        for node_id in G.nodes():
            for attr_key, attr_value in list(G.nodes[node_id].items()):
                G.nodes[node_id][attr_key] = serialize_attr(attr_value)
        
        # Process edge attributes
        for source, target in G.edges():
            for attr_key, attr_value in list(G.edges[source, target].items()):
                G.edges[source, target][attr_key] = serialize_attr(attr_value)
        
        nx.write_graphml(G, file_path, encoding="utf-8", prettyprint=True)

    def load_graphml(self, file_path: str) -> None:
        """Load graph data from a GraphML file using NetworkX."""
        G = nx.read_graphml(file_path)
        
        # Deserialize attributes back to original types
        def deserialize_attr(value):
            if value == "null":
                return None
            elif isinstance(value, str):
                # Try to parse as JSON for lists/dicts
                if value.startswith(('[', '{')):
                    try:
                        return json.loads(value)
                    except json.JSONDecodeError:
                        return value
                else:
                    return value
            else:
                return value
        
        # Process node attributes
        for node_id in G.nodes():
            for attr_key, attr_value in list(G.nodes[node_id].items()):
                G.nodes[node_id][attr_key] = deserialize_attr(attr_value)
        
        # Process edge attributes
        for source, target in G.edges():
            for attr_key, attr_value in list(G.edges[source, target].items()):
                G.edges[source, target][attr_key] = deserialize_attr(attr_value)
        
        self.from_networkx(G)

    def visualize(self, **kwargs) -> 'Sigma':
        """
        Visualize the graph in Jupyter notebook using ipysigma.
        
        Args:
            **kwargs: Additional arguments passed to Sigma constructor.
                     Common options include:
                     - node_size: attribute name or dict mapping node IDs to sizes
                     - node_color: attribute name or dict mapping node IDs to colors
                     - edge_size: attribute name or dict mapping edge IDs to sizes
                     - height: height of the visualization in pixels (default: 600)
                     - background_color: CSS color for background (default: "white")
                     - start_layout: automatically start layout algorithm
        
        Returns:
            Sigma widget for Jupyter notebook display
            
        Raises:
            ImportError: If ipysigma is not available
        """
        if not IPYSIGMA_AVAILABLE:
            raise ImportError(
                "ipysigma is not available. Install it with: pip install ipysigma"
            )
        
        G = self.to_networkx()
        
        # Set default visualization parameters (only valid Sigma parameters)
        default_kwargs = {
            "node_size": "category",  # Use category for default sizing
            "node_color": "category",  # Use category for default coloring
            "height": 600
        }
        
        # Override defaults with user-provided kwargs, but handle legacy 'width' parameter
        viz_kwargs = {**default_kwargs, **kwargs}
        
        # Remove 'width' if provided (not supported by ipysigma)
        if "width" in viz_kwargs:
            viz_kwargs.pop("width")
        
        # Handle node_size based on category if using default
        if viz_kwargs.get("node_size") == "category":
            category_sizes = {
                "directory": 5,
                "module": 10,
                "class": 15,
                "function": 8,
                "method": 6,
                "external_symbol": 4,
                "next_page_module": 12,
                "unknown": 7
            }
            for node_id in G.nodes():
                category = G.nodes[node_id].get("category", "unknown")
                G.nodes[node_id]["size"] = category_sizes.get(category, 7)
            viz_kwargs["node_size"] = "size"
        
        # Handle node_color based on category if using default
        if viz_kwargs.get("node_color") == "category":
            category_colors = {
                "directory": "#6b7280",      # Gray
                "module": "#10b981",         # Emerald
                "class": "#0ea5e9",          # Sky blue
                "function": "#f97316",       # Orange
                "method": "#f59e0b",         # Amber
                "external_symbol": "#a3a3a3", # Stone
                "next_page_module": "#8b5cf6", # Violet
                "unknown": "#6b7280"         # Gray
            }
            for node_id in G.nodes():
                category = G.nodes[node_id].get("category", "unknown")
                G.nodes[node_id]["color"] = category_colors.get(category, "#6b7280")
            viz_kwargs["node_color"] = "color"
        
        return Sigma(G, **viz_kwargs)

    @classmethod
    def from_source(
        cls, 
        source_path: Union[str, Path], 
        file_extensions: List[str] = None,
        max_files: Optional[int] = None,
        encoding: str = 'utf-8',
        ignore_patterns: List[str] = None
    ) -> 'GraphGenerator':
        """
        Create a GraphGenerator directly from a ZIP file or folder.
        
        Args:
            source_path: Path to ZIP file or directory
            file_extensions: List of file extensions to include (default: ['.py', '.js', '.jsx', '.ts', '.tsx', '.ipynb'])
            max_files: Maximum number of files to process (None for unlimited)
            encoding: Text encoding for reading files (default: 'utf-8')
            ignore_patterns: List of glob patterns to ignore (e.g., ['**/test_*', '**/__pycache__/**'])
        
        Returns:
            GraphGenerator instance ready for analysis
        
        Raises:
            FileNotFoundError: If source_path doesn't exist
            ValueError: If source_path is neither a file nor directory
        """
        source_path = Path(source_path)
        
        if not source_path.exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")
        
        # Set default file extensions if not provided
        if file_extensions is None:
            file_extensions = ['.py', '.js', '.jsx', '.ts', '.tsx', '.ipynb']
        
        # Set default ignore patterns if not provided
        if ignore_patterns is None:
            ignore_patterns = [
                '**/.*',  # Hidden files/dirs
                '**/__pycache__/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/*.min.js',
                '**/*.map',
                '**/coverage/**',
                '**/.git/**'
            ]
        
        files_data = []
        
        if source_path.is_file() and source_path.suffix.lower() == '.zip':
            # Handle ZIP file
            files_data = cls._extract_files_from_zip(
                source_path, file_extensions, max_files, encoding, ignore_patterns
            )
        elif source_path.is_dir():
            # Handle directory
            files_data = cls._extract_files_from_directory(
                source_path, file_extensions, max_files, encoding, ignore_patterns
            )
        else:
            raise ValueError(f"Source path must be a ZIP file or directory: {source_path}")
        
        print(f"Loaded {len(files_data)} files from {source_path}")
        return cls(files_data)
    
    @staticmethod
    def _extract_files_from_zip(
        zip_path: Path,
        file_extensions: List[str],
        max_files: Optional[int],
        encoding: str,
        ignore_patterns: List[str]
    ) -> List[Dict[str, Any]]:
        """Extract files from ZIP archive."""
        files_data = []
        
        with zipfile.ZipFile(zip_path, 'r') as zip_file:
            file_list = zip_file.namelist()
            
            for zip_info in zip_file.infolist():
                # Skip directories
                if zip_info.is_dir():
                    continue
                
                file_path = Path(zip_info.filename)
                
                # Check file extension
                if not any(file_path.name.lower().endswith(ext.lower()) for ext in file_extensions):
                    continue
                
                # Check ignore patterns
                if GraphGenerator._should_ignore_file(file_path, ignore_patterns):
                    continue
                
                # Check max files limit
                if max_files and len(files_data) >= max_files:
                    break
                
                try:
                    # Read file content
                    with zip_file.open(zip_info) as file:
                        content = file.read().decode(encoding, errors='ignore')
                    
                    # Normalize path separators for cross-platform compatibility
                    normalized_path = str(file_path).replace('\\', '/')
                    
                    # Handle special processing for Jupyter notebooks
                    file_data = {
                        'path': normalized_path,
                        'content': content,
                        'full_path': str(zip_path / file_path)
                    }
                    
                    # Special handling for .ipynb files
                    if file_path.suffix.lower() == '.ipynb':
                        python_content = GraphGenerator._extract_python_from_notebook(content)
                        if python_content:
                            file_data['python_equivalent_content'] = python_content
                    
                    files_data.append(file_data)
                    
                except Exception as e:
                    print(f"Warning: Could not read {zip_info.filename}: {e}")
                    continue
        
        return files_data
    
    @staticmethod
    def _extract_files_from_directory(
        dir_path: Path,
        file_extensions: List[str],
        max_files: Optional[int],
        encoding: str,
        ignore_patterns: List[str]
    ) -> List[Dict[str, Any]]:
        """Extract files from directory."""
        files_data = []
        
        # Use rglob to recursively find all files
        for file_path in dir_path.rglob('*'):
            if file_path.is_dir():
                continue
            
            # Check file extension
            if not any(file_path.name.lower().endswith(ext.lower()) for ext in file_extensions):
                continue
            
            # Get relative path from the base directory
            try:
                relative_path = file_path.relative_to(dir_path)
            except ValueError:
                continue  # Skip if can't get relative path
            
            # Check ignore patterns using relative path
            if GraphGenerator._should_ignore_file(relative_path, ignore_patterns):
                continue
            
            # Check max files limit
            if max_files and len(files_data) >= max_files:
                break
            
            try:
                # Read file content
                with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                    content = f.read()
                
                # Create file data entry
                file_data = {
                    'path': str(relative_path).replace('\\', '/'),  # Normalize path separators
                    'content': content,
                    'full_path': str(file_path.absolute())
                }
                
                # Special handling for .ipynb files
                if file_path.suffix.lower() == '.ipynb':
                    python_content = GraphGenerator._extract_python_from_notebook(content)
                    if python_content:
                        file_data['python_equivalent_content'] = python_content
                
                files_data.append(file_data)
                
            except Exception as e:
                print(f"Warning: Could not read {file_path}: {e}")
                continue
        
        return files_data
    
    @staticmethod
    def _should_ignore_file(file_path: Path, ignore_patterns: List[str]) -> bool:
        """Check if a file should be ignored based on patterns."""
        import fnmatch
        
        file_path_str = str(file_path).replace('\\', '/')
        
        for pattern in ignore_patterns:
            if fnmatch.fnmatch(file_path_str, pattern):
                return True
            # Also check just the filename for patterns like '*.min.js'
            if fnmatch.fnmatch(file_path.name, pattern):
                return True
        
        return False
    
    @staticmethod
    def _extract_python_from_notebook(notebook_content: str) -> str:
        """Extract Python code from Jupyter notebook JSON."""
        try:
            import json
            notebook = json.loads(notebook_content)
            
            python_lines = []
            
            for cell in notebook.get('cells', []):
                if cell.get('cell_type') == 'code':
                    source = cell.get('source', [])
                    if isinstance(source, list):
                        python_lines.extend(source)
                    elif isinstance(source, str):
                        python_lines.append(source)
            
            return ''.join(python_lines)
            
        except Exception as e:
            print(f"Warning: Could not extract Python from notebook: {e}")
            return ""
