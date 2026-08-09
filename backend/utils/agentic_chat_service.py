"""
Optimized Agentic LangGraph Chat Service with Reliable Tool Calling
Fixed tool calling issues, improved system prompts, and better error handling
"""

import json
import asyncio
from typing import Dict, List, Any, AsyncGenerator, Optional, TypedDict, Annotated, Literal
from datetime import datetime
from operator import add
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# LangGraph imports
try:
    from langgraph.graph import StateGraph, END
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.prebuilt import ToolNode
    from langchain_core.messages import (
        HumanMessage,
        AIMessage,
        SystemMessage,
        BaseMessage,
        ToolMessage,
    )
    from langchain_core.tools import tool

    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    logger.warning("LangGraph not available - using fallback implementation")

# Import our services
from utils.langchain_llm_service import langchain_service
from utils.gitvizz_tools import gitvizz_tools_service
from models.repository import Repository


class AgenticChatState(TypedDict):
    """Enhanced state for the agentic chat workflow"""
    messages: Annotated[List[BaseMessage], add]
    repository_context: str
    user_query: str
    original_query: str  # Keep original for context
    repository_id: str
    repository_zip_path: str
    context_metadata: Dict[str, Any]
    analysis_type: str
    current_response: str
    streaming_enabled: bool
    provider: str
    model: str
    user_id: str
    tools_used: List[str]
    tool_results: Dict[str, Any]
    conversation_id: Optional[str]
    chat_id: Optional[str]
    # New fields for better control
    force_tool_use: bool
    tool_selection_reasoning: str
    iteration_count: int
    max_iterations: int


class AgenticLangGraphChatService:
    """Agentic chat service with reliable tool calling"""

    def __init__(self):
        self.langgraph_available = LANGGRAPH_AVAILABLE
        if LANGGRAPH_AVAILABLE:
            self.memory = MemorySaver()
            self.graphs = {}
        
        # Tool selection mapping - more specific patterns
        self.tool_patterns = {
            "analyze_code_structure": [
                "architecture", "structure", "organization", "layout", "overview",
                "hierarchy", "modules", "components", "design", "pattern"
            ],
            "search_code_patterns": [
                "find", "search", "locate", "where", "show", "look for", 
                "implementation", "function", "class", "method", "variable"
            ],
            "find_code_quality_issues": [
                "quality", "issues", "problems", "bugs", "errors", "improve",
                "refactor", "cleanup", "best practices", "code smell"
            ],
            "analyze_dependencies_and_flow": [
                "dependency", "dependencies", "flow", "connection", "relates",
                "imports", "uses", "calls", "relationship", "coupling"
            ],
            "find_security_and_testing_insights": [
                "security", "vulnerable", "safe", "risk", "test", "testing",
                "coverage", "unit test", "secure", "vulnerability"
            ],
            "get_repository_statistics": [
                "statistics", "metrics", "stats", "count", "how many", "size",
                "lines", "files", "complexity", "summary"
            ]
        }

    def _build_agentic_chat_graph(self, repository_id: str, zip_file_path: str) -> StateGraph:
        """Build optimized LangGraph workflow"""
        if not LANGGRAPH_AVAILABLE:
            return None

        # Get GitVizz tools for this repository
        gitvizz_tools = gitvizz_tools_service.create_tools(repository_id, zip_file_path)
        tool_node = ToolNode(gitvizz_tools)

        # Create the state graph
        workflow = StateGraph(AgenticChatState)

        # Add nodes
        workflow.add_node("analyze_and_plan", self._analyze_and_plan_node)
        workflow.add_node("force_tool_selection", self._force_tool_selection_node)
        workflow.add_node("agent_with_tools", self._agent_with_tools_node)
        workflow.add_node("tools", tool_node)
        workflow.add_node("synthesize_response", self._synthesize_response_node)

        # Add edges - more controlled flow
        workflow.add_edge("analyze_and_plan", "force_tool_selection")
        workflow.add_edge("force_tool_selection", "agent_with_tools")
        
        workflow.add_conditional_edges(
            "agent_with_tools",
            self._should_use_tools_or_synthesize,
            {
                "use_tools": "tools",
                "synthesize": "synthesize_response",
                "continue_agent": "agent_with_tools"
            }
        )
        workflow.add_edge("tools", "agent_with_tools")
        workflow.add_edge("synthesize_response", END)

        # Set entry point
        workflow.set_entry_point("analyze_and_plan")

        return workflow.compile(checkpointer=self.memory)

    async def _analyze_and_plan_node(self, state: AgenticChatState) -> AgenticChatState:
        """Enhanced query analysis with forced tool selection"""
        user_query = state["user_query"].lower()
        
        # Determine analysis type and required tools
        analysis_type = "general"
        required_tools = []
        
        # More sophisticated pattern matching
        for tool_name, patterns in self.tool_patterns.items():
            if any(pattern in user_query for pattern in patterns):
                required_tools.append(tool_name)
                
        # Default to structure analysis if no specific tool needed
        if not required_tools:
            required_tools = ["analyze_code_structure"]
            analysis_type = "general_exploration"
        elif "structure" in user_query or "architecture" in user_query:
            analysis_type = "architecture"
        elif "find" in user_query or "search" in user_query:
            analysis_type = "search"
        elif "quality" in user_query or "issues" in user_query:
            analysis_type = "quality"
        elif "dependency" in user_query:
            analysis_type = "dependencies"
        elif "security" in user_query or "test" in user_query:
            analysis_type = "security_testing"
        elif "statistic" in user_query or "metric" in user_query:
            analysis_type = "statistics"

        logger.info(f"Analysis type: {analysis_type}, Required tools: {required_tools}")

        return {
            **state,
            "analysis_type": analysis_type,
            "force_tool_use": True,
            "tool_selection_reasoning": f"Based on query analysis, using tools: {', '.join(required_tools)}",
            "iteration_count": 0,
            "max_iterations": 5,
            "original_query": state["user_query"]
        }

    async def _force_tool_selection_node(self, state: AgenticChatState) -> AgenticChatState:
        """Force appropriate tool selection based on query analysis"""
        user_query = state["user_query"].lower()
        
        # Create a tool-forcing message
        tool_instruction = self._generate_tool_instruction(user_query, state["analysis_type"])
        
        # Add the tool instruction as a system message
        tool_message = SystemMessage(content=tool_instruction)
        
        return {
            **state,
            "messages": [tool_message] + state["messages"]
        }

    def _generate_tool_instruction(self, user_query: str, analysis_type: str) -> str:
        """Generate specific tool usage instructions"""
        
        base_instruction = f"""CRITICAL: You MUST use GitVizz tools before responding. This is mandatory.

Query Analysis Type: {analysis_type}
User Query: "{user_query}"

REQUIRED ACTIONS:
"""
        
        # Specific tool instructions based on query type
        if analysis_type == "architecture" or "structure" in user_query:
            base_instruction += "1. MUST call analyze_code_structure first to understand the repository layout\n"
        
        if analysis_type == "search" or any(word in user_query for word in ["find", "search", "locate"]):
            base_instruction += "1. MUST call search_code_patterns to find relevant code\n"
        
        if analysis_type == "quality" or any(word in user_query for word in ["quality", "issues", "problems"]):
            base_instruction += "1. MUST call find_code_quality_issues to identify problems\n"
        
        if analysis_type == "dependencies" or "dependency" in user_query:
            base_instruction += "1. MUST call analyze_dependencies_and_flow to understand relationships\n"
        
        if analysis_type == "security_testing" or any(word in user_query for word in ["security", "test"]):
            base_instruction += "1. MUST call find_security_and_testing_insights for security/testing analysis\n"
        
        if analysis_type == "statistics" or any(word in user_query for word in ["statistic", "metric", "count"]):
            base_instruction += "1. MUST call get_repository_statistics for metrics\n"
        
        # Default fallback
        if analysis_type == "general_exploration":
            base_instruction += "1. MUST call analyze_code_structure to get repository overview\n"

        base_instruction += """
DO NOT provide any textual response until you have called the appropriate tools.
DO NOT explain what you're going to do - just call the tools immediately.
The tools will provide the data you need to answer the user's question properly.
"""
        
        return base_instruction

    async def _agent_with_tools_node(self, state: AgenticChatState) -> AgenticChatState:
        """Enhanced agent node with better tool calling"""
        try:
            # Get tools and model
            gitvizz_tools = gitvizz_tools_service.create_tools(
                state["repository_id"], state["repository_zip_path"]
            )

            chat_model = await langchain_service.get_chat_model(
                model=state["model"],
                user=None,
                use_user_key=True,
                temperature=0.1,  # Lower temperature for more consistent tool calling
            )

            # Bind tools to model
            llm_with_tools = chat_model.bind_tools(gitvizz_tools)

            # Enhanced system message with stronger tool calling guidance
            system_message = SystemMessage(content=f"""You are a code analysis assistant with access to GitVizz tools. 

CRITICAL RULES:
- You MUST use tools before providing any analysis
- If you haven't used tools yet, call them immediately
- Do not provide explanations without tool data
- Tools are your primary source of information about this repository

Repository: {state["repository_id"]}
Available Tools: {[tool.name for tool in gitvizz_tools]}

Current iteration: {state.get('iteration_count', 0)}
Tools used so far: {state.get('tools_used', [])}

If no tools have been used yet, you MUST call the appropriate tool(s) now.""")

            # Prepare messages
            messages = [system_message]
            
            # Add conversation history, but keep it focused
            recent_messages = state["messages"][-10:]  # Only keep recent context
            messages.extend(recent_messages)
            
            # If this is the first iteration and no tools used, be more forceful
            if state.get('iteration_count', 0) == 0 and not state.get('tools_used', []):
                messages.append(HumanMessage(content=f"Use tools to analyze: {state['original_query']}"))

            logger.info(f"Calling LLM with {len(messages)} messages, tools available: {len(gitvizz_tools)}")

            # Get response
            response = await llm_with_tools.ainvoke(messages)
            
            logger.info(f"LLM response - has tool_calls: {hasattr(response, 'tool_calls') and response.tool_calls}")
            if hasattr(response, 'tool_calls') and response.tool_calls:
                logger.info(f"Tool calls: {[tc.get('name', 'unknown') for tc in response.tool_calls]}")

            # Update iteration count
            new_iteration_count = state.get('iteration_count', 0) + 1

            return {
                **state,
                "messages": [response],
                "iteration_count": new_iteration_count
            }

        except Exception as e:
            logger.error(f"Error in agent node: {str(e)}")
            error_response = AIMessage(content=f"I encountered an error: {str(e)}")
            return {**state, "messages": [error_response]}

    async def _synthesize_response_node(self, state: AgenticChatState) -> AgenticChatState:
        """Final synthesis of response with tool results"""
        try:
            # Get the final model without tools for clean response
            chat_model = await langchain_service.get_chat_model(
                model=state["model"],
                user=None,
                use_user_key=True,
                temperature=0.3,
            )

            # Create synthesis prompt
            synthesis_prompt = f"""Based on the tool analysis results, provide a comprehensive answer to the user's question: "{state['original_query']}"

Tools used: {', '.join(state.get('tools_used', []))}
Analysis type: {state['analysis_type']}

Provide a clear, structured response that directly answers the user's question using the tool results."""

            synthesis_message = SystemMessage(content=synthesis_prompt)
            
            # Get recent messages with tool results
            messages = [synthesis_message] + state["messages"][-5:]

            response = await chat_model.ainvoke(messages)

            return {**state, "messages": [response]}

        except Exception as e:
            logger.error(f"Error in synthesis: {str(e)}")
            error_response = AIMessage(content=f"Error synthesizing response: {str(e)}")
            return {**state, "messages": [error_response]}

    def _should_use_tools_or_synthesize(self, state: AgenticChatState) -> Literal["use_tools", "synthesize", "continue_agent"]:
        """Enhanced decision logic for tool usage"""
        messages = state["messages"]
        if not messages:
            return "continue_agent"

        last_message = messages[-1]
        iteration_count = state.get('iteration_count', 0)
        max_iterations = state.get('max_iterations', 5)
        tools_used = state.get('tools_used', [])

        logger.info(f"Decision check - iteration: {iteration_count}, tools_used: {len(tools_used)}")

        # Check for tool calls in the last message
        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            logger.info("→ Using tools (tool calls detected)")
            return "use_tools"

        # If we haven't used any tools yet and haven't exceeded max iterations, continue with agent
        if not tools_used and iteration_count < max_iterations:
            logger.info("→ Continue agent (no tools used yet)")
            return "continue_agent"

        # If we have used tools or exceeded max iterations, synthesize
        if tools_used or iteration_count >= max_iterations:
            logger.info("→ Synthesize (tools used or max iterations reached)")
            return "synthesize"

        # Default: continue with agent
        logger.info("→ Continue agent (default)")
        return "continue_agent"

    async def get_or_create_graph(self, repository_id: str, zip_file_path: str):
        """Get or create graph for the repository with caching"""
        graph_key = f"{repository_id}:{zip_file_path}"

        if graph_key not in self.graphs:
            logger.info(f"Creating new graph for {graph_key}")
            self.graphs[graph_key] = self._build_agentic_chat_graph(repository_id, zip_file_path)

        return self.graphs[graph_key]

    async def stream_agentic_chat_response(
        self,
        user_query: str,
        repository: Repository,
        user: Any,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        thread_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        chat_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Optimized streaming with better error handling"""

        if not self.langgraph_available:
            async for chunk in self._fallback_streaming(user_query, user, model, provider):
                yield chunk
            return

        try:
            zip_file_path = repository.file_paths.zip if repository.file_paths else None
            if not zip_file_path:
                yield json.dumps({
                    "event": "error",
                    "error": "No ZIP file available for GitVizz analysis",
                    "error_type": "no_zip_file"
                }) + "\n"
                return

            graph = await self.get_or_create_graph(str(repository.id), zip_file_path)
            if not graph:
                yield json.dumps({
                    "event": "error",
                    "error": "Unable to create analysis graph",
                    "error_type": "graph_creation_failed"
                }) + "\n"
                return

            # Enhanced initial state
            initial_state = AgenticChatState(
                messages=[HumanMessage(content=user_query)],
                user_query=user_query,
                original_query=user_query,
                repository_id=str(repository.id),
                repository_zip_path=zip_file_path,
                provider=provider,
                model=model,
                user_id=str(user.id),
                repository_context="",
                context_metadata={},
                analysis_type="",
                current_response="",
                streaming_enabled=True,
                tools_used=[],
                tool_results={},
                conversation_id=conversation_id,
                chat_id=chat_id,
                force_tool_use=True,
                tool_selection_reasoning="",
                iteration_count=0,
                max_iterations=5
            )

            config = {"configurable": {"thread_id": thread_id or f"chat_{chat_id}"}}

            yield json.dumps({
                "event": "progress",
                "step": "initializing",
                "message": "Starting enhanced agentic analysis...",
            }) + "\n"

            accumulated_response = ""
            active_tools = set()

            async for event in graph.astream_events(initial_state, config, version="v2"):
                event_type = event.get("event")
                event_name = event.get("name", "")

                if event_type == "on_chain_start":
                    if "analyze_and_plan" in event_name:
                        yield json.dumps({
                            "event": "progress",
                            "step": "planning",
                            "message": "Analyzing query and planning tool usage...",
                        }) + "\n"
                    elif "force_tool_selection" in event_name:
                        yield json.dumps({
                            "event": "progress",
                            "step": "tool_selection",
                            "message": "Selecting appropriate GitVizz tools...",
                        }) + "\n"
                    elif "agent_with_tools" in event_name:
                        yield json.dumps({
                            "event": "progress",
                            "step": "agent_thinking",
                            "message": "Agent analyzing with tools...",
                        }) + "\n"
                    elif "synthesize_response" in event_name:
                        yield json.dumps({
                            "event": "progress",
                            "step": "synthesizing",
                            "message": "Synthesizing final response...",
                        }) + "\n"

                elif event_type == "on_tool_start":
                    tool_name = event.get("name", "unknown_tool")
                    tool_input = event.get("data", {}).get("input", {})
                    active_tools.add(tool_name)

                    yield json.dumps({
                        "event": "function_call",
                        "function_name": tool_name,
                        "arguments": tool_input if isinstance(tool_input, dict) else {"input": str(tool_input)},
                        "status": "started",
                        "message": f"🔧 Analyzing with {tool_name.replace('_', ' ').title()}...",
                    }) + "\n"

                elif event_type == "on_tool_end":
                    # Add delay for better UX
                    await asyncio.sleep(0.7)

                    tool_name = event.get("name", "unknown_tool")
                    tool_output_str = str(event.get("data", {}).get("output", ""))
                    active_tools.discard(tool_name)
                    
                    # Better result truncation
                    if len(tool_output_str) > 300:
                        truncated_result = tool_output_str[:297] + "..."
                    else:
                        truncated_result = tool_output_str

                    yield json.dumps({
                        "event": "function_complete",
                        "function_name": tool_name,
                        "result": truncated_result,
                        "status": "completed",
                        "message": f"✅ Completed {tool_name.replace('_', ' ').title()}",
                    }) + "\n"

                elif event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        accumulated_response += chunk.content
                        yield json.dumps({
                            "event": "token",
                            "token": chunk.content,
                            "chat_id": chat_id,
                            "conversation_id": conversation_id,
                            "provider": provider,
                            "model": model,
                        }) + "\n"

            # Final completion
            yield json.dumps({
                "event": "complete",
                "message": "Enhanced agentic analysis completed",
                "response": accumulated_response,
                "chat_id": chat_id,
                "conversation_id": conversation_id,
                "provider": provider,
                "model": model,
                "usage": {},
            }) + "\n"

        except Exception as e:
            logger.error(f"Streaming error: {str(e)}")
            error_msg = str(e)
            error_type = "server_error"
            
            if "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
                error_type = "quota_exceeded"
            elif "api key" in error_msg.lower() or "unauthorized" in error_msg.lower():
                error_type = "no_api_key"
            elif "gitvizz" in error_msg.lower():
                error_type = "gitvizz_error"

            yield json.dumps({
                "event": "error",
                "error": error_msg,
                "error_type": error_type
            }) + "\n"

    async def _fallback_streaming(
        self, user_query: str, user: Any, model: str, provider: str
    ) -> AsyncGenerator[str, None]:
        """Enhanced fallback streaming"""
        try:
            yield json.dumps({
                "event": "progress",
                "step": "fallback_mode",
                "message": "Using fallback mode - LangGraph not available",
            }) + "\n"

            chat_model = await langchain_service.get_chat_model(
                model=model, user=user, temperature=0.7
            )

            system_msg = SystemMessage(content="""You are a helpful code analysis assistant. 
While GitVizz tools are not available, provide the best analysis you can based on your knowledge.""")
            
            messages = [system_msg, HumanMessage(content=user_query)]

            accumulated = ""
            async for chunk in chat_model.astream(messages):
                if chunk.content:
                    accumulated += chunk.content
                    yield json.dumps({"event": "token", "token": chunk.content}) + "\n"

            yield json.dumps({
                "event": "complete",
                "message": "Fallback analysis completed",
                "response": accumulated
            }) + "\n"

        except Exception as e:
            logger.error(f"Fallback error: {str(e)}")
            yield json.dumps({
                "event": "error",
                "error": str(e),
                "error_type": "fallback_error"
            }) + "\n"


# Global instance
agentic_chat_service = AgenticLangGraphChatService()
