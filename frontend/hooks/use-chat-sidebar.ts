'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  getConversationHistory,
  getAvailableModels,
  getUserChatSessions,
  type AvailableModelsResponse,
  type ChatSessionListItem,
} from '@/utils/api';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';
import {
  createStreamingChatRequest,
  parseStreamingResponse,
  type StreamingChatRequest,
} from '@/lib/streaming-chat';
import type { DailyUsage } from '@/api-client/types.gen';
import { showToast } from '@/components/toaster';
import { fetchModelConfig, type ModelConfig } from '@/utils/model-config';

interface ContextSettings {
  scope: 'focused' | 'moderate' | 'comprehensive';
  includeFullContext: boolean;
  maxTokens: number;
  includeDependencies: boolean;
  traversalDepth: number;
  relevanceThreshold: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  context_used?: string | null;
  metadata?: Record<string, any> | null;
  context_metadata?: Record<string, any> | null;
  function_calls?: Array<{
    name: string;
    status: 'calling' | 'complete' | 'error';
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentChatId?: string;
  currentConversationId?: string;
}

interface ModelApiState {
  provider: string;
  model: string;
  temperature: number;
}

type ModelState = Partial<ModelApiState>;

export function useChatSidebar(
  repositoryIdentifier: string,
  userKeyPreferences: Record<string, boolean>,
  options?: { autoLoad?: boolean; repositoryBranch?: string },
) {
  const { data: session } = useSession();
  const router = useRouter();
  const { autoLoad = true } = options ?? {};

  // Wrap API calls with auth handling
  const getUserChatSessionsWithAuth = useApiWithAuth(getUserChatSessions);
  const getConversationHistoryWithAuth = useApiWithAuth(getConversationHistory);
  const getAvailableModelsWithAuth = useApiWithAuth(getAvailableModels);
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isLoading: false,
  });
  const [modelState, setModelState] = useState<ModelState>({});
  const [availableModels, setAvailableModels] = useState<AvailableModelsResponse>({
    providers: {},
    current_limits: {},
    user_has_keys: [],
  });
  const [chatHistory, setChatHistory] = useState<ChatSessionListItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentModelConfig, setCurrentModelConfig] = useState<ModelConfig | null>(null);
  const [isLoadingModelConfig, setIsLoadingModelConfig] = useState(false);

  const [useUserKeys, setUseUserKeys] = useState<Record<string, boolean>>(userKeyPreferences);
  const [contextSettings, setContextSettings] = useState<ContextSettings>({
    scope: 'moderate',
    includeFullContext: false,
    maxTokens: 4000,
    includeDependencies: true,
    traversalDepth: 2,
    relevanceThreshold: 0.3,
  });

  // Refs to prevent duplicate loads in React Strict Mode/dev and to avoid concurrent calls
  const isFetchingHistoryRef = useRef(false);
  const lastHistoryKeyRef = useRef<string | null>(null);
  const lastModelsTokenRef = useRef<string | null>(null);

  useEffect(() => {
    setUseUserKeys(userKeyPreferences);
  }, [userKeyPreferences]);

  // Load available models and chat history on mount or when auth/repo changes (with guards)
  useEffect(() => {
    if (!autoLoad) return;
    if (!session?.jwt_token) return;
    if (!repositoryIdentifier || repositoryIdentifier.trim() === '') {
      console.log('Skipping chat initialization: No repository identifier provided');
      return;
    }

    // Validate repository identifier format
    // For GitHub repos: should be owner/repo/branch format
    // For ZIP files: can be just the repository ID
    if (!repositoryIdentifier.includes('/') && repositoryIdentifier.length !== 24) {
      // If it's not a GitHub format (owner/repo/branch) and not a 24-char ObjectId,
      // we might still want to allow it for ZIP files or other sources
      console.log(
        'Repository identifier format:',
        repositoryIdentifier,
        '(non-GitHub format, proceeding anyway)',
      );
    }

    // Models: only load once per token
    if (lastModelsTokenRef.current !== session.jwt_token) {
      lastModelsTokenRef.current = session.jwt_token;
      loadAvailableModels();
    }

    // History: only load once per token+repository pair
    const historyKey = `${session.jwt_token}:${repositoryIdentifier}`;
    if (lastHistoryKeyRef.current !== historyKey) {
      lastHistoryKeyRef.current = historyKey;
      void loadChatHistory();
    }
  }, [autoLoad, session?.jwt_token, repositoryIdentifier]);

  const loadModelConfig = async (provider?: string, model?: string) => {
    const targetProvider = provider || modelState.provider;
    const targetModel = model || modelState.model;

    if (!targetProvider || !targetModel) return;

    setIsLoadingModelConfig(true);
    try {
      const config = await fetchModelConfig(targetProvider, targetModel);
      setCurrentModelConfig(config);

      // Auto-adjust context settings based on model capabilities
      if (config) {
        setContextSettings((prev) => ({
          ...prev,
          maxTokens: Math.min(prev.maxTokens, Math.floor(config.max_tokens * 0.7)), // Use 70% of max context for repository content
        }));
      }
    } catch (error) {
      console.error('Failed to load model config:', error);
      setCurrentModelConfig(null);
    } finally {
      setIsLoadingModelConfig(false);
    }
  };

  const loadAvailableModels = async () => {
    if (!session?.jwt_token) return;

    try {
      const models = await getAvailableModelsWithAuth(session.jwt_token || undefined);
      setAvailableModels(models);

      // Set default model if current one is not available
      const providerKey = modelState.provider;
      const modelKey = modelState.model;
      const currentProviderModels = providerKey
        ? models.providers[providerKey as keyof typeof models.providers]
        : undefined;
      if (!providerKey || !modelKey || !currentProviderModels?.includes(modelKey as string)) {
        const firstProvider = Object.keys(models.providers)[0];
        const firstModel = firstProvider ? models.providers[firstProvider]?.[0] : undefined;
        if (firstProvider && firstModel) {
          setModelState((prev) => ({
            ...prev,
            provider: firstProvider,
            model: firstModel,
          }));
          // Load config for new model
          loadModelConfig(firstProvider, firstModel);
        }
      } else if (providerKey && modelKey) {
        // Load config for current model
        loadModelConfig(providerKey, modelKey);
      }
    } catch (error) {
      showToast.error('Failed to load available models');
    }
  };

  const loadChatHistory = async () => {
    if (!session?.jwt_token) return;
    if (!repositoryIdentifier || repositoryIdentifier.trim() === '') return;
    if (isFetchingHistoryRef.current) return;

    isFetchingHistoryRef.current = true;
    setIsLoadingHistory(true);
    try {
      const chatSessions = await getUserChatSessionsWithAuth(
        session.jwt_token || undefined,
        repositoryIdentifier,
      );
      if (chatSessions.success) {
        setChatHistory(chatSessions.sessions);
      } else {
        setChatHistory([]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      showToast.error('Failed to load chat history');
      setChatHistory([]);
    } finally {
      setIsLoadingHistory(false);
      isFetchingHistoryRef.current = false;
    }
  };

  // =================================================================
  // <<< START: THIS IS THE FUNCTION TO REPLACE >>>
  // =================================================================
const sendMessage = async (
    content: string,
    options?: {
      repositoryBranch?: string;
      contextMode?: 'full' | 'smart' | 'agentic';
    },
  ): Promise<{ daily_usage?: DailyUsage } | undefined> => {
    if (!session?.jwt_token || chatState.isLoading) return;

    // ... (rest of the initial validation code remains the same) ...
    const isGitHubFormat = repositoryIdentifier.includes('/');
    const isObjectIdFormat = !isGitHubFormat && repositoryIdentifier.length === 24;
    if (!repositoryIdentifier || repositoryIdentifier.trim() === '' || (!isGitHubFormat && !isObjectIdFormat)) {
      console.error('Cannot send message: Repository identifier is invalid:', repositoryIdentifier);
      throw new Error('Repository not processed yet. Please wait for repository processing to complete before starting a chat.');
    }

    const userMessage: Message = { role: 'user', content, timestamp: new Date() };

    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
    }));

    try {
      const streamingRequest: StreamingChatRequest = {
        token: session.jwt_token || '',
        message: content,
        repository_id: repositoryIdentifier,
        repository_branch: options?.repositoryBranch,
        use_user: modelState.provider ? (useUserKeys[modelState.provider] ?? false) : false,
        chat_id: chatState.currentChatId,
        conversation_id: chatState.currentConversationId,
        provider: modelState.provider,
        model: modelState.model,
        temperature: modelState.temperature ?? 0.7,
        context_mode: options?.contextMode || 'smart',
        max_tokens: contextSettings.maxTokens,
      };

      const response = await createStreamingChatRequest(streamingRequest);

      // --- NEW LOGIC: We will not create a placeholder here ---
      // Instead, we create messages dynamically as events stream in.
      let dailyUsage: DailyUsage | null = null;
      let assistantTextContent = ''; // Accumulator for the final text response

      try {
        for await (const chunk of parseStreamingResponse(response)) {
          if (chunk.type === 'metadata') {
            setChatState((prev) => ({
              ...prev,
              currentChatId: chunk.chat_id || prev.currentChatId,
              currentConversationId: chunk.conversation_id || prev.currentConversationId,
            }));
          } else if (chunk.type === 'function_call') {
            setChatState((prev) => {
              const newMessages = [...prev.messages];
              const lastMessage = newMessages[newMessages.length - 1];

              // Check if the last message is an assistant message meant for tools
              if (lastMessage?.role === 'assistant' && !lastMessage.content) {
                // If it is, update its function_calls array
                const functionCalls = [...(lastMessage.function_calls || [])];
                functionCalls.push({
                  name: chunk.function_name || 'unknown_tool',
                  status: 'calling',
                  arguments: chunk.arguments || {},
                });
                newMessages[newMessages.length - 1] = { ...lastMessage, function_calls: functionCalls };
              } else {
                // Otherwise, create a NEW message bubble just for tools
                newMessages.push({
                  role: 'assistant',
                  content: '', // IMPORTANT: Empty content signifies a tool message
                  timestamp: new Date(),
                  function_calls: [{
                    name: chunk.function_name || 'unknown_tool',
                    status: 'calling',
                    arguments: chunk.arguments || {},
                  }],
                });
              }
              return { ...prev, messages: newMessages };
            });
          } else if (chunk.type === 'function_complete') {
            setChatState((prev) => {
              const newMessages = [...prev.messages];
              const lastMessage = newMessages[newMessages.length - 1];

              if (lastMessage?.role === 'assistant' && lastMessage.function_calls) {
                const functionCalls = [...lastMessage.function_calls];
                const callIndex = functionCalls.findIndex(
                  (call) => call.name === chunk.function_name && call.status === 'calling'
                );
                if (callIndex !== -1) {
                  functionCalls[callIndex].status = 'complete';
                  functionCalls[callIndex].result = chunk.result;
                  newMessages[newMessages.length - 1] = { ...lastMessage, function_calls: functionCalls };
                }
              }
              return { ...prev, messages: newMessages };
            });
          } else if (chunk.type === 'token') {
            if (chunk.content !== undefined) {
              assistantTextContent += chunk.content;
              setChatState((prev) => {
                const newMessages = [...prev.messages];
                const lastMessage = newMessages[newMessages.length - 1];

                // If the last message was for tools (empty content), create a new one for text
                if (lastMessage?.role === 'assistant' && !lastMessage.content && lastMessage.function_calls?.length) {
                  newMessages.push({
                    role: 'assistant',
                    content: assistantTextContent,
                    timestamp: new Date(),
                  });
                } else if (lastMessage?.role === 'assistant') {
                  // Otherwise, update the existing text message
                  newMessages[newMessages.length - 1] = { ...lastMessage, content: assistantTextContent };
                } else {
                  // This handles cases where no tools are called, and the first event is a token
                  newMessages.push({
                    role: 'assistant',
                    content: assistantTextContent,
                    timestamp: new Date(),
                  });
                }
                return { ...prev, messages: newMessages };
              });
            }
          } else if (chunk.type === 'complete') {
            if (chunk.daily_usage) dailyUsage = chunk.daily_usage;
            break;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.message || 'Streaming error occurred');
          } else if (chunk.type === 'done') {
            break;
          }
        }
      } catch (streamError) {
        console.error('Stream processing error:', streamError);
        throw streamError;
      }

      setChatState((prev) => ({ ...prev, isLoading: false }));
      await loadChatHistory();
      return dailyUsage ? { daily_usage: dailyUsage } : undefined;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      showToast.error(errorMessage);
      setChatState((prev) => ({
        ...prev,
        // On error, remove the user's optimistic message
        messages: prev.messages.filter((msg) => msg.timestamp !== userMessage.timestamp),
        isLoading: false,
      }));
    }
  };
  // =================================================================
  // <<< END: THIS IS THE FUNCTION TO REPLACE >>>
  // =================================================================

  const loadConversation = async (conversationId: string) => {
    if (!session?.jwt_token) return;

    setChatState((prev) => ({ ...prev, isLoading: true }));

    try {
      const conversation = await getConversationHistoryWithAuth(
        session.jwt_token || undefined,
        conversationId,
      );

      const messages: Message[] = conversation.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp), // Ensure proper Date object
        context_used: msg.context_used,
        metadata: msg.metadata,
      }));

      setChatState({
        messages,
        isLoading: false,
        currentChatId: conversation.chat_id,
        currentConversationId: conversation.conversation_id,
      });

      showToast.success('Conversation loaded');
    } catch (error) {
      console.error('Failed to load conversation:', error);
      showToast.error('Failed to load conversation');
      setChatState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const loadConversationBySessionItem = async (sessionItem: ChatSessionListItem) => {
    await loadConversation(sessionItem.conversation_id);
  };

  const clearCurrentChat = () => {
    setChatState({
      messages: [],
      isLoading: false,
      currentChatId: undefined,
      currentConversationId: undefined,
    });
    showToast.success('Started new chat');
  };

  const startNewConversation = () => {
    setChatState((prev) => ({
      messages: [],
      isLoading: false,
      currentChatId: prev.currentChatId,
      currentConversationId: undefined,
    }));
    showToast.success('Started new conversation');
  };

  const startNewChatSession = () => {
    setChatState({
      messages: [],
      isLoading: false,
      currentChatId: undefined,
      currentConversationId: undefined,
    });
    showToast.success('Started new chat session');
  };

  const setModel = (provider: string, model: string) => {
    setModelState((prev) => ({
      ...prev,
      provider,
      model,
    }));
    loadModelConfig(provider, model);
  };

  const refreshModels = async () => {
    await loadAvailableModels();
  };

  const refreshChatHistory = async () => {
    await loadChatHistory();
  };

  return {
    messages: chatState.messages,
    isLoading: chatState.isLoading,
    isLoadingHistory,
    currentModel: modelState,
    currentModelConfig,
    isLoadingModelConfig,
    availableModels,
    chatHistory,
    sendMessage,
    loadConversation,
    loadConversationBySessionItem,
    clearCurrentChat,
    startNewConversation,
    startNewChatSession,
    setModel,
    refreshModels,
    refreshChatHistory,
    currentChatId: chatState.currentChatId,
    currentConversationId: chatState.currentConversationId,
    useUserKeys,
    setUseUserKeys,
    contextSettings,
    setContextSettings,
  };
}