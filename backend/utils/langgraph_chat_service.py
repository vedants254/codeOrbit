"""
LangGraph-based Chat Service
Advanced chat system with streaming, memory, and repository context analysis
Uses LangGraph for orchestration and state management
"""

import json
import asyncio
from typing import Dict, List, Any, AsyncGenerator, Optional, TypedDict
from datetime import datetime

# LangGraph imports
try:
    from langgraph.graph import StateGraph, END
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.prebuilt import ToolNode
    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
    from langchain_core.tools import tool
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    print("⚠️ LangGraph not available - using fallback implementation")

# Import our LangChain service
from utils.langchain_llm_service import langchain_service


class ChatState(TypedDict):
    """State for the chat workflow"""
    messages: List[BaseMessage]
    repository_context: str
    user_query: str
    repository_id: str
    context_metadata: Dict[str, Any]
    analysis_type: str
    current_response: str
    streaming_enabled: bool
    provider: str
    model: str
    user_id: str  # Store user ID instead of full user object


class LangGraphChatService:
    """Advanced chat service using LangGraph for orchestration"""
    
    def __init__(self):
        self.langgraph_available = LANGGRAPH_AVAILABLE
        if LANGGRAPH_AVAILABLE:
            self.memory = MemorySaver()
            self.graph = self._build_chat_graph()
        else:
            self.graph = None
    
    def _build_chat_graph(self) -> StateGraph:
        """Build the LangGraph workflow for chat processing"""
        if not LANGGRAPH_AVAILABLE:
            return None
        
        # Create the state graph
        workflow = StateGraph(ChatState)
        
        # Add nodes
        workflow.add_node("analyze_query", self._analyze_query_node)
        workflow.add_node("retrieve_context", self._retrieve_context_node)
        workflow.add_node("generate_response", self._generate_response_node)
        workflow.add_node("stream_response", self._stream_response_node)
        
        # Add edges
        workflow.add_edge("analyze_query", "retrieve_context")
        workflow.add_edge("retrieve_context", "generate_response")
        workflow.add_conditional_edges(
            "generate_response",
            self._should_stream,
            {
                "stream": "stream_response",
                "end": END
            }
        )
        workflow.add_edge("stream_response", END)
        
        # Set entry point
        workflow.set_entry_point("analyze_query")
        
        return workflow.compile(checkpointer=self.memory)
    
    async def _analyze_query_node(self, state: ChatState) -> ChatState:
        """Analyze the user query to determine the best approach"""
        user_query = state["user_query"]
        
        # Simple analysis - in production you'd use an LLM for this
        analysis_type = "general"
        if any(keyword in user_query.lower() for keyword in ["bug", "error", "fix", "debug"]):
            analysis_type = "debugging"
        elif any(keyword in user_query.lower() for keyword in ["architecture", "structure", "design"]):
            analysis_type = "architecture"
        elif any(keyword in user_query.lower() for keyword in ["implement", "add", "create", "build"]):
            analysis_type = "implementation"
        elif any(keyword in user_query.lower() for keyword in ["explain", "how", "what", "why"]):
            analysis_type = "explanation"
        
        state["analysis_type"] = analysis_type
        return state
    
    async def _retrieve_context_node(self, state: ChatState) -> ChatState:
        """Retrieve relevant repository context based on query analysis"""
        # This would integrate with your existing repository context retrieval
        # For now, we'll use a placeholder
        context = f"Repository context for {state['repository_id']} (analysis type: {state['analysis_type']})"
        
        state["repository_context"] = context
        state["context_metadata"] = {
            "analysis_type": state["analysis_type"],
            "context_length": len(context),
            "retrieved_at": datetime.now().isoformat()
        }
        
        return state
    
    async def _generate_response_node(self, state: ChatState) -> ChatState:
        """Generate AI response using the LangChain service"""
        try:
            # Prepare system prompt with context
            system_prompt = f"""You are an AI assistant specialized in code analysis and repository exploration. 

Analysis Type: {state['analysis_type']}
Repository Context: {state['repository_context']}

Provide detailed, accurate responses based on the repository content."""
            
            # Prepare messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": state["user_query"]}
            ]
            
            if not state["streaming_enabled"]:
                # Non-streaming response - we'll need the actual user object here
                # For now, skip this since we need to access the database
                state["current_response"] = "Non-streaming response not implemented yet"
            
            return state
            
        except Exception as e:
            state["current_response"] = f"Error generating response: {str(e)}"
            return state
    
    async def _stream_response_node(self, state: ChatState) -> ChatState:
        """Handle streaming response generation"""
        # This will be handled by the streaming method
        return state
    
    def _should_stream(self, state: ChatState) -> str:
        """Determine if response should be streamed"""
        return "stream" if state["streaming_enabled"] else "end"
    
    async def process_chat_with_graph(
        self,
        user_query: str,
        repository_id: str,
        user: Any,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        streaming: bool = False,
        thread_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Process chat using LangGraph workflow"""
        
        if not self.langgraph_available:
            # Fallback to simple processing
            return await self._fallback_chat_processing(
                user_query, repository_id, user, model, provider, streaming
            )
        
        # Prepare initial state
        initial_state = ChatState(
            messages=[],
            repository_context="",
            user_query=user_query,
            repository_id=repository_id,
            context_metadata={},
            analysis_type="",
            current_response="",
            streaming_enabled=streaming,
            provider=provider,
            model=model,
            user_id=str(user.id)  # Store user ID instead of full object
        )
        
        # Configure thread for memory
        config = {"configurable": {"thread_id": thread_id or "default"}}
        
        try:
            if streaming:
                # For streaming, we'll handle it differently
                return await self._process_streaming_chat(initial_state, config)
            else:
                # Non-streaming processing
                result = await self.graph.ainvoke(initial_state, config)
                return {
                    "success": True,
                    "response": result["current_response"],
                    "analysis_type": result["analysis_type"],
                    "context_metadata": result["context_metadata"]
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "analysis_type": "error"
            }
    
    async def _process_streaming_chat(
        self, 
        initial_state: ChatState, 
        config: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process chat with streaming using LangGraph astream_events"""
        
        try:
            # Use astream_events for detailed streaming
            async for event in self.graph.astream_events(initial_state, config, version="v2"):
                event_type = event.get("event")
                
                if event_type == "on_chat_model_stream":
                    # Stream LLM tokens
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, 'content') and chunk.content:
                        yield {
                            "type": "token",
                            "content": chunk.content,
                            "event": "token"
                        }
                
                elif event_type == "on_chain_end":
                    # Node completion
                    node_name = event.get("name", "")
                    if "analyze_query" in node_name:
                        yield {
                            "type": "progress",
                            "step": "query_analyzed",
                            "event": "progress"
                        }
                    elif "retrieve_context" in node_name:
                        yield {
                            "type": "progress", 
                            "step": "context_retrieved",
                            "event": "progress"
                        }
                    elif "generate_response" in node_name:
                        yield {
                            "type": "progress",
                            "step": "response_generated", 
                            "event": "progress"
                        }
                
                elif event_type == "on_chain_start":
                    # Starting processing
                    node_name = event.get("name", "")
                    yield {
                        "type": "progress",
                        "step": f"starting_{node_name}",
                        "event": "progress"
                    }
            
            # Final completion
            yield {
                "type": "complete",
                "event": "complete"
            }
            
        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "event": "error"
            }
    
    async def stream_chat_response(
        self,
        user_query: str,
        repository_id: str,
        user: Any,
        model: str = "gpt-4o-mini", 
        provider: str = "openai",
        thread_id: Optional[str] = None,
        repository_context: Optional[str] = None,
        context_metadata: Optional[dict] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat response as JSON strings for FastAPI"""
        
        try:
            # Step 1: Analyze query type
            analysis_type = "general"
            if any(keyword in user_query.lower() for keyword in ["bug", "error", "fix", "debug"]):
                analysis_type = "debugging"
            elif any(keyword in user_query.lower() for keyword in ["architecture", "structure", "design"]):
                analysis_type = "architecture"
            elif any(keyword in user_query.lower() for keyword in ["implement", "add", "create", "build"]):
                analysis_type = "implementation"
            elif any(keyword in user_query.lower() for keyword in ["explain", "how", "what", "why"]):
                analysis_type = "explanation"
            
            yield json.dumps({
                "event": "progress",
                "step": "query_analyzed",
                "analysis_type": analysis_type
            }) + "\n"
            
            # Step 2: Use provided context or create placeholder
            if repository_context is None:
                repository_context = f"Repository context for {repository_id} (analysis type: {analysis_type})"
            
            yield json.dumps({
                "event": "progress",
                "step": "context_retrieved", 
                "context_length": len(repository_context),
                "context_metadata": context_metadata
            }) + "\n"
            
            # Step 3: Generate streaming response
            # Check if it's a reasoning model and enable traces
            is_reasoning = langchain_service.is_reasoning_model(
                langchain_service.detect_provider_from_model(model), 
                model
            )
            
            chat_model = await langchain_service.get_chat_model(
                model=model,
                user=user,
                use_user_key=True,  # Try user key first, fallback to local/system
                temperature=0.7,
                enable_reasoning_traces=is_reasoning
            )
            
            # Prepare system prompt with detailed context
            if context_metadata and context_metadata.get("context_type") == "full":
                system_prompt = f"""You are an AI assistant specialized in code analysis and repository exploration.

You have access to the complete repository content including {context_metadata.get('files_included', 0)} source files.

Query Analysis Type: {analysis_type}

Repository Content:
{repository_context}

Please provide detailed, accurate responses based on the complete repository content above. Reference specific files, functions, or code sections when relevant."""
            else:
                system_prompt = f"""You are an AI assistant specialized in code analysis and repository exploration.

Analysis Type: {analysis_type}
Repository Context: {repository_context}

Provide detailed, accurate responses based on the repository content."""
            
            # Prepare messages and handle reasoning models
            if is_reasoning:
                # For reasoning models, convert system message to developer role
                # Use a special developer message or add as additional context
                langchain_messages = [
                    HumanMessage(content=f"[SYSTEM CONTEXT]: {system_prompt}\n\nUser Query: {user_query}")
                ]
            else:
                # For regular models, use normal system message
                langchain_messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_query)
                ]
            
            accumulated_response = ""
            accumulated_reasoning = ""
            
            # Stream the LLM response with reasoning traces support
            async for chunk in chat_model.astream(langchain_messages):
                # Handle reasoning traces for o1/o3 models
                if is_reasoning and hasattr(chunk, 'additional_kwargs'):
                    # Check for reasoning content
                    reasoning_content = chunk.additional_kwargs.get('reasoning', '')
                    if reasoning_content and reasoning_content not in accumulated_reasoning:
                        accumulated_reasoning += reasoning_content
                        yield json.dumps({
                            "event": "reasoning",
                            "reasoning": reasoning_content
                        }) + "\n"
                
                # Handle regular content
                if chunk.content:
                    accumulated_response += chunk.content
                    yield json.dumps({
                        "event": "token",
                        "token": chunk.content
                    }) + "\n"
            
            # Final completion
            yield json.dumps({
                "event": "complete",
                "response": accumulated_response
            }) + "\n"
            
        except Exception as e:
            error_msg = str(e)
            event_data = {"event": "error", "error": error_msg}
            
            # Add specific error handling for quota limits and API keys
            if "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
                event_data["error_type"] = "quota_exceeded"
                event_data["suggestion"] = "API quota limit reached. Please try again later or use your own API key."
            elif "api key" in error_msg.lower() or "unauthorized" in error_msg.lower():
                event_data["error_type"] = "no_api_key"  
                event_data["suggestion"] = "No valid API key found. Please add your API key in settings."
            elif "invalid model" in error_msg.lower():
                event_data["error_type"] = "invalid_model"
                event_data["suggestion"] = "The selected model is not available. Please choose a different model."
            else:
                event_data["error_type"] = "server_error"
                
            yield json.dumps(event_data) + "\n"
    
    async def _fallback_chat_processing(
        self,
        user_query: str,
        repository_id: str, 
        user: Any,
        model: str,
        provider: str,
        streaming: bool
    ) -> Dict[str, Any]:
        """Fallback processing when LangGraph is not available"""
        try:
            response = await langchain_service.simple_chat(
                message=user_query,
                model=model,
                user=user,
                system_prompt="You are a helpful AI assistant for code analysis."
            )
            
            return {
                "success": True,
                "response": response,
                "analysis_type": "general",
                "context_metadata": {"fallback": True}
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _fallback_streaming(
        self,
        user_query: str,
        user: Any,
        model: str,
        provider: str
    ) -> AsyncGenerator[str, None]:
        """Fallback streaming when LangGraph is not available"""
        try:
            # Use simple streaming with LangChain
            chat_model = await langchain_service.get_chat_model(
                model=model,
                user=user,
                temperature=0.7
            )
            
            messages = [HumanMessage(content=user_query)]
            
            async for chunk in chat_model.astream(messages):
                if chunk.content:
                    yield json.dumps({
                        "event": "token",
                        "token": chunk.content
                    }) + "\n"
            
            yield json.dumps({
                "event": "complete"
            }) + "\n"
            
        except Exception as e:
            error_msg = str(e)
            event_data = {"event": "error", "error": error_msg}
            
            # Add specific error handling for quota limits and API keys
            if "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
                event_data["error_type"] = "quota_exceeded"
                event_data["suggestion"] = "API quota limit reached. Please try again later or use your own API key."
            elif "api key" in error_msg.lower() or "unauthorized" in error_msg.lower():
                event_data["error_type"] = "no_api_key"  
                event_data["suggestion"] = "No valid API key found. Please add your API key in settings."
            elif "invalid model" in error_msg.lower():
                event_data["error_type"] = "invalid_model"
                event_data["suggestion"] = "The selected model is not available. Please choose a different model."
            else:
                event_data["error_type"] = "server_error"
                
            yield json.dumps(event_data) + "\n"


# Global instance
langgraph_chat_service = LangGraphChatService()