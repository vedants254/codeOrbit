"""
Custom Tree-sitter based parser for code graph generation.
Adapted from the archived tree_sitter_parser.py.
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

from tree_sitter import Parser, Language, Node as TSNode  # Renamed to avoid conflict

# Graph Data Structures (assuming they are defined elsewhere, e.g., in graph_generator.py)
# from graph_generator import GraphNodeData, GraphEdgeData
# For now, let's define placeholders if not directly importable
GraphNodeData = Dict[str, Any]
GraphEdgeData = Dict[str, Any]


class CustomTreeSitterParser:
    """
    Parser that uses tree-sitter to extract code structure.
    Can be configured for different languages.
    """

    def __init__(
        self, language: Language, query_string: str, project_root_path: str = "."
    ):
        """
        Initialize the Tree-sitter parser.

        Args:
            language: The tree-sitter Language object (e.g., from tree_sitter_javascript).
            query_string: The tree-sitter query string for capturing relevant code constructs.
            project_root_path: The absolute path to the root of the project.
        """
        self.parser = Parser()
        self.parser.language = language
        self.ts_language = language  # Store the language object
        self.query = self.ts_language.query(query_string)
        self.project_root_path = (
            Path(project_root_path)
            if isinstance(project_root_path, str)
            else project_root_path
        )

    def _node_text(self, node: TSNode, source_bytes: bytes) -> str:
        """Helper to get text from a tree-sitter node."""
        return source_bytes[node.start_byte : node.end_byte].decode("utf-8")

    def _get_node_full_code(self, node: TSNode, source_bytes: bytes) -> str:
        """Extracts the full code snippet for a given AST node."""
        return self._node_text(node, source_bytes)

    def _get_line_number(self, node: TSNode) -> int:
        """Returns the 1-based start line number of a node.
        Returns -1 if line number cannot be determined.
        """
        try:
            # tree-sitter row is 0-indexed, node.start_point is (row, column)
            # Ensure the node, its start_point, and the row value are not None
            if node and node.start_point and node.start_point[0] is not None:
                return node.start_point[0] + 1
            return -1  # Default for undetermined line
        except (AttributeError, IndexError, TypeError):
            # AttributeError: node is None, or node.start_point is missing.
            # IndexError: node.start_point is not a tuple with at least one element.
            # TypeError: node.start_point[0] is None or not a number (already checked by 'is not None').
            return -1  # Default for undetermined line

    def _get_end_line_number(self, node: TSNode) -> int:
        """Returns the 1-based end line number of a node.
        Returns -1 if line number cannot be determined.
        """
        try:
            # tree-sitter row is 0-indexed, node.end_point is (row, column)
            # Ensure the node, its end_point, and the row value are not None
            if node and node.end_point and node.end_point[0] is not None:
                return node.end_point[0] + 1
            return -1  # Default for undetermined line
        except (AttributeError, IndexError, TypeError):
            return -1  # Default for undetermined line

    def _get_module_id_from_file_path(self, relative_file_path: str) -> str:
        """
        Generates a module ID from a file path already relative to the project root.
        Example: src/components/Button.js -> src.components.Button
        """
        p = Path(relative_file_path)
        # Remove extension and replace path separators with dots
        module_id = str(p.with_suffix("")).replace(os.sep, ".")
        return module_id

    def parse_file_content(
        self, relative_file_path: str, file_content: str
    ) -> Tuple[List[GraphNodeData], List[GraphEdgeData]]:
        """
        Parses the given file content using tree-sitter.
        Args:
            relative_file_path: The path to the file, relative to the project root.
            file_content: The actual content of the file.
        Returns:
            A tuple containing a list of nodes and a list of edges.
        """
        nodes_data: List[GraphNodeData] = []
        edges_data: List[GraphEdgeData] = []

        source_bytes = bytes(file_content, "utf8")
        try:
            tree = self.parser.parse(source_bytes)
        except Exception as e:
            print(
                f"Error parsing {relative_file_path} with Tree-sitter during tree construction: {e}"
            )
            return nodes_data, edges_data

        module_id = self._get_module_id_from_file_path(relative_file_path)
        module_name = Path(relative_file_path).name

        # Create module node
        module_node: GraphNodeData = {
            "id": module_id,
            "name": module_name,
            "category": "module",
            "file": relative_file_path,
            "start_line": 1,
            "end_line": len(file_content.splitlines()),
            "code": None,  # Could be added if needed
            "parent_id": str(Path(relative_file_path).parent),  # Directory path string
            "imports": [],
        }
        nodes_data.append(module_node)

        # --- Process captures ---
        # This is where the detailed, language-specific parsing logic will go.
        # The following is a very basic illustration.

        # Store defined symbols locally for context resolution within this file
        # This would be more complex, involving scopes.
        local_definitions: Dict[str, GraphNodeData] = {module_id: module_node}

        try:
            captures = self.query.captures(tree.root_node)
        except Exception as e:
            print(f"Error obtaining captures for {relative_file_path}: {e}")
            return nodes_data, edges_data  # Return module node at least

        for captured_node, capture_name in captures:
            try:
                node_text = self._node_text(captured_node, source_bytes)
                start_line = self._get_line_number(captured_node)
                end_line = self._get_end_line_number(captured_node)  # pylint: disable=unused-variable

                current_scope_id = module_id  # Default, will be refined # pylint: disable=unused-variable
                # TODO: Implement robust scope determination (e.g., _get_parent_scope_id(captured_node, local_definitions))

                # --- Import Processing ---
                if capture_name == "import.source":
                    source_module_raw = self._node_text(
                        captured_node, source_bytes
                    ).strip("'\"")  # Corrected string stripping
                    # The full import statement is captured_node.parent (or .parent.parent depending on query structure)
                    import_statement_node = captured_node
                    while (
                        import_statement_node
                        and import_statement_node.type != "import_statement"
                    ):
                        import_statement_node = import_statement_node.parent

                    imported_items = []
                    if import_statement_node:
                        for sub_capture_node, sub_capture_name in self.query.captures(
                            import_statement_node
                        ):
                            sub_node_text = self._node_text(
                                sub_capture_node, source_bytes
                            )
                            if sub_capture_name == "import.default":
                                imported_items.append(
                                    {
                                        "name": sub_node_text,
                                        "alias": sub_node_text,
                                        "type": "default",
                                    }
                                )
                            elif sub_capture_name == "import.named.name":
                                # Need to find its alias if present
                                alias = sub_node_text  # Default if no alias
                                # This requires looking at the import_specifier node for an alias child
                                parent_specifier = sub_capture_node.parent
                                if (
                                    parent_specifier
                                    and parent_specifier.type == "import_specifier"
                                ):
                                    alias_node = parent_specifier.child_by_field_name(
                                        "alias"
                                    )
                                    if alias_node:
                                        alias = self._node_text(
                                            alias_node, source_bytes
                                        )
                                imported_items.append(
                                    {
                                        "name": sub_node_text,
                                        "alias": alias,
                                        "type": "named",
                                    }
                                )
                            elif sub_capture_name == "import.namespace":
                                imported_items.append(
                                    {
                                        "name": "*",
                                        "alias": sub_node_text,
                                        "type": "namespace",
                                    }
                                )

                    if (
                        not imported_items and source_module_raw
                    ):  # e.g. import 'styles.css'
                        imported_items.append(
                            {
                                "name": source_module_raw,
                                "alias": None,
                                "type": "side-effect",
                            }
                        )

                    if module_node.get("imports") is not None:
                        for item in imported_items:
                            module_node["imports"].append(
                                {  # type: ignore
                                    "name": item["name"],
                                    "alias": item["alias"],
                                    "source_module": source_module_raw,
                                    "type": item["type"],
                                }
                            )
                            # Edge for symbol import (more granular)
                            # Target for symbol import would be source_module_raw + "." + item["name"]
                            # This needs resolution logic similar to Python's _resolve_symbol
                            # For now, module-level import edge is created below.

                    edges_data.append(
                        {
                            "source": module_id,
                            "target": source_module_raw,  # Target needs resolution
                            "relationship": "imports_module",
                            "file": relative_file_path,
                            "line": start_line,
                            "imported_items": imported_items,  # Add detail to edge
                        }
                    )

                # --- Export Processing ---
                elif capture_name == "export.declaration.statement":
                    pass  # Handled by specific definition captures + marking as exported

                elif capture_name == "export.named.name":
                    exported_name = node_text  # pylint: disable=unused-variable
                    alias = exported_name  # pylint: disable=unused-variable
                    specifier_node = captured_node.parent
                    if specifier_node and specifier_node.type == "export_specifier":
                        alias_node = specifier_node.child_by_field_name("alias")
                        if alias_node:
                            alias = self._node_text(alias_node, source_bytes)
                    pass  # Requires symbol resolution first

                elif capture_name == "export.default.statement":
                    pass

                # --- Function/Component Definition ---
                elif capture_name in ["function.name", "component.definition.name"]:
                    func_name = node_text
                    parent_definition_node = captured_node.parent
                    while (
                        parent_definition_node
                        and parent_definition_node.type
                        not in [
                            "function_declaration",
                            "lexical_declaration",
                            "method_definition",
                            "class_declaration",
                        ]
                    ):
                        parent_definition_node = parent_definition_node.parent
                    if not parent_definition_node:
                        continue

                    parent_scope_id = module_id
                    parent_ast_node_for_scope = parent_definition_node.parent
                    temp_scope_search = parent_ast_node_for_scope
                    while temp_scope_search:
                        if temp_scope_search.type == "class_declaration":
                            class_name_node = temp_scope_search.child_by_field_name(
                                "name"
                            )
                            if class_name_node:
                                parent_scope_id = f"{module_id}.{self._node_text(class_name_node, source_bytes)}"
                            break
                        elif temp_scope_search.type == "method_definition":
                            break
                        temp_scope_search = temp_scope_search.parent

                    is_method = parent_definition_node.type == "method_definition"
                    category = (
                        "method"
                        if is_method
                        else (
                            "component"
                            if capture_name == "component.definition.name"
                            else "function"
                        )
                    )

                    if is_method:
                        continue

                    func_id = f"{parent_scope_id}.{func_name}"
                    func_node_data: GraphNodeData = {
                        "id": func_id,
                        "name": func_name,
                        "category": category,
                        "file": relative_file_path,
                        "start_line": self._get_line_number(parent_definition_node),
                        "end_line": self._get_end_line_number(parent_definition_node),
                        "code": self._get_node_full_code(
                            parent_definition_node, source_bytes
                        ),
                        "parent_id": parent_scope_id,
                        "exported": False,
                    }
                    if func_id not in local_definitions:
                        nodes_data.append(func_node_data)
                        local_definitions[func_id] = func_node_data
                        edges_data.append(
                            {
                                "source": parent_scope_id,
                                "target": func_id,
                                "relationship": "defines_method"
                                if category == "method"
                                else (
                                    "defines_component"
                                    if category == "component"
                                    else "defines_function"
                                ),
                                "file": relative_file_path,
                                "line": self._get_line_number(parent_definition_node),
                            }
                        )

                # --- Method Definition ---
                elif capture_name == "method.name":
                    method_name = node_text
                    method_definition_node = captured_node.parent
                    parent_class_id = None
                    temp_class_search = method_definition_node.parent
                    if temp_class_search:
                        temp_class_search = temp_class_search.parent

                    if (
                        temp_class_search
                        and temp_class_search.type == "class_declaration"
                    ):
                        class_name_node = temp_class_search.child_by_field_name("name")
                        if class_name_node:
                            parent_class_id = f"{module_id}.{self._node_text(class_name_node, source_bytes)}"

                    if not parent_class_id:
                        continue

                    method_id = f"{parent_class_id}.{method_name}"
                    method_node_data: GraphNodeData = {
                        "id": method_id,
                        "name": method_name,
                        "category": "method",
                        "file": relative_file_path,
                        "start_line": self._get_line_number(method_definition_node),
                        "end_line": self._get_end_line_number(method_definition_node),
                        "code": self._get_node_full_code(
                            method_definition_node, source_bytes
                        ),
                        "parent_id": parent_class_id,
                        "exported": False,
                    }
                    if method_id not in local_definitions:
                        nodes_data.append(method_node_data)
                        local_definitions[method_id] = method_node_data
                        edges_data.append(
                            {
                                "source": parent_class_id,
                                "target": method_id,
                                "relationship": "defines_method",
                                "file": relative_file_path,
                                "line": self._get_line_number(method_definition_node),
                            }
                        )

                # --- Class Definition ---
                elif capture_name == "class.name":
                    class_name = node_text
                    class_id = f"{module_id}.{class_name}"
                    parent_definition_node = captured_node.parent
                    superclass_name_str = None
                    superclass_node = parent_definition_node.child_by_field_name(
                        "superclass"
                    )
                    if superclass_node:
                        superclass_name_str = self._node_text(
                            superclass_node, source_bytes
                        )

                    class_node_data: GraphNodeData = {
                        "id": class_id,
                        "name": class_name,
                        "category": "class",
                        "file": relative_file_path,
                        "start_line": self._get_line_number(parent_definition_node),
                        "end_line": self._get_end_line_number(parent_definition_node),
                        "code": self._get_node_full_code(
                            parent_definition_node, source_bytes
                        ),
                        "parent_id": module_id,
                        "superclass": superclass_name_str,
                        "exported": False,
                    }
                    if class_id not in local_definitions:
                        nodes_data.append(class_node_data)
                        local_definitions[class_id] = class_node_data
                        edges_data.append(
                            {
                                "source": module_id,
                                "target": class_id,
                                "relationship": "defines_class",
                                "file": relative_file_path,
                                "line": start_line,
                            }
                        )

                # --- Variable Declaration ---
                elif capture_name == "variable.name":
                    var_name = node_text
                    var_id = f"{module_id}.{var_name}"
                    var_decl_node = captured_node.parent
                    if var_decl_node:
                        var_decl_node = var_decl_node.parent

                    if not var_decl_node:
                        continue

                    is_func_or_class_decl = False
                    value_node = captured_node.parent.child_by_field_name("value")
                    if value_node and value_node.type in [
                        "arrow_function",
                        "function",
                        "class",
                    ]:
                        is_func_or_class_decl = True

                    if not is_func_or_class_decl and var_id not in local_definitions:
                        var_node_data: GraphNodeData = {
                            "id": var_id,
                            "name": var_name,
                            "category": "variable",
                            "file": relative_file_path,
                            "start_line": self._get_line_number(var_decl_node),
                            "end_line": self._get_end_line_number(var_decl_node),
                            "code": self._get_node_full_code(
                                var_decl_node, source_bytes
                            ),
                            "parent_id": module_id,
                            "exported": False,
                        }
                        nodes_data.append(var_node_data)
                        local_definitions[var_id] = var_node_data

                # --- Call Expression ---
                elif (
                    capture_name == "call.function_name"
                    or capture_name == "call.method_name"
                ):
                    call_expr_node = captured_node
                    while call_expr_node and call_expr_node.type != "call_expression":
                        call_expr_node = call_expr_node.parent
                    if not call_expr_node:
                        continue

                    caller_id = module_id  # pylint: disable=unused-variable
                    callee_name_str = ""  # pylint: disable=unused-variable

                    if capture_name == "call.function_name":
                        callee_name_str = node_text
                    elif capture_name == "call.method_name":
                        obj_text = ""
                        function_node_of_call = call_expr_node.child_by_field_name(
                            "function"
                        )
                        if function_node_of_call:
                            for sub_node, sub_name in self.query.captures(
                                call_expr_node
                            ):
                                if sub_name == "call.object_name":
                                    if (
                                        sub_node.parent
                                        and sub_node.parent == function_node_of_call
                                    ):
                                        obj_text = self._node_text(
                                            sub_node, source_bytes
                                        )
                                        break
                        callee_name_str = (
                            f"{obj_text}.{node_text}" if obj_text else node_text
                        )
                    pass  # Placeholder for call graph logic

                # --- JSX Element Usage (not definition) ---
                elif capture_name == "jsx.component.name":
                    component_name_str = node_text  # pylint: disable=unused-variable
                    if (
                        captured_node.parent
                        and captured_node.parent.type == "member_expression"
                        and captured_node.parent.child_by_field_name("property")
                        == captured_node
                    ):
                        obj_node = captured_node.parent.child_by_field_name("object")
                        if obj_node:
                            component_name_str = (
                                f"{self._node_text(obj_node, source_bytes)}.{node_text}"
                            )
                    pass

                # --- React Hook Call ---
                elif capture_name == "hook.name":
                    hook_name = node_text  # pylint: disable=unused-variable
                    pass

                # --- Interface, Type Alias, Enum (TS specific) ---
                elif capture_name in ["interface.name", "type.alias.name", "enum.name"]:
                    item_name = node_text
                    item_id = f"{module_id}.{item_name}"
                    category_map = {
                        "interface.name": "interface",
                        "type.alias.name": "type_alias",
                        "enum.name": "enum",
                    }
                    category = category_map[capture_name]
                    definition_node = captured_node.parent

                    item_node_data: GraphNodeData = {
                        "id": item_id,
                        "name": item_name,
                        "category": category,
                        "file": relative_file_path,
                        "start_line": self._get_line_number(definition_node),
                        "end_line": self._get_end_line_number(definition_node),
                        "code": self._get_node_full_code(definition_node, source_bytes),
                        "parent_id": module_id,
                        "exported": False,
                    }
                    if item_id not in local_definitions:
                        nodes_data.append(item_node_data)
                        local_definitions[item_id] = item_node_data
                        edges_data.append(
                            {
                                "source": module_id,
                                "target": item_id,
                                "relationship": f"defines_{category}",
                                "file": relative_file_path,
                                "line": self._get_line_number(definition_node),
                            }
                        )

            except Exception as e:
                print(
                    f"Error processing capture '{capture_name}' in {relative_file_path} (line {captured_node.start_point[0] + 1}): {e}"
                )
                # Continue to next capture

        # print(f"CustomTreeSitterParser: Parsed {relative_file_path}. Nodes: {len(nodes_data)}, Edges: {len(edges_data)}")
        return nodes_data, edges_data

    # Placeholder for language-specific parsing logic that would be called by parse_file_content
    # Or, parse_file_content itself would become much more complex.

    # --- Helper methods from the original TreeSitterParser (may need adaptation) ---

    def _extract_docstring(
        self, node: TSNode, source_code: str
    ) -> str:  # Kept for potential use
        body_node = None
        for child in node.children:
            if (
                child.type == "block" or child.type == "statement_block"
            ):  # Common block types
                body_node = child
                break

        if not body_node or not body_node.children:
            return ""

        # In Python, docstring is an expression_statement with a string child.
        # In JS/TS, it might be a comment or not formally defined.
        # This needs to be language-specific. For now, a simplified check.
        first_expr_node = None
        if body_node.children[0].type == "expression_statement":  # Python-like
            first_expr_node = body_node.children[0]
        elif body_node.children[0].type == "comment":  # JS/TS block comment
            # This needs more robust comment parsing
            comment_text = self._node_text(
                body_node.children[0], bytes(source_code, "utf8")
            )
            if (
                comment_text.startswith("/**") and "@" not in comment_text
            ):  # Basic JSDoc check
                return comment_text.strip("/**").strip("*/").strip()

        if (
            first_expr_node
            and first_expr_node.children
            and first_expr_node.children[0].type == "string"
        ):
            string_node = first_expr_node.children[0]
            docstring = self._node_text(string_node, bytes(source_code, "utf8"))
            # Remove quotes - this is also somewhat language-specific
            if docstring.startswith('"""') and docstring.endswith('"""'):
                return docstring[3:-3].strip()
            if docstring.startswith("'''") and docstring.endswith("'''"):
                return docstring[3:-3].strip()
            if docstring.startswith('"') and docstring.endswith('"'):
                return docstring[1:-1].strip()
            if docstring.startswith("'") and docstring.endswith("'"):
                return docstring[1:-1].strip()
            return docstring  # Raw string if no standard quotes detected

        return ""

    def _get_parent_by_type(
        self, start_node: TSNode, target_type: str, source_bytes: bytes
    ) -> Optional[Tuple[TSNode, str]]:
        """Helper to find a parent AST node of a specific type and get its name if applicable."""
        current = start_node.parent
        while current:
            if current.type == target_type:
                name_node = None
                if target_type in [
                    "function_definition",
                    "class_definition",
                    "lexical_declaration",
                ]:
                    for child in current.children:
                        if child.type == "identifier":
                            name_node = child
                            break
                        if child.type == "variable_declarator":
                            for sub_child in child.children:
                                if sub_child.type == "identifier":
                                    name_node = sub_child
                                    break
                            if name_node:
                                break

                name = (
                    self._node_text(name_node, source_bytes)
                    if name_node
                    else "<anonymous>"
                )
                return current, name
            current = current.parent
        return None
