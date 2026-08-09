/**
 * Model configuration utilities for fetching and managing model capabilities
 */

import { getModelConfigBackendEnhanced } from '@/api-client';

export interface ModelConfig {
  max_tokens: number;
  max_output_tokens: number;
  cost_per_1M_input: number;
  cost_per_1M_output: number;
  cost_per_1M_cached_input?: number;
  supports_function_calling: boolean;
  supports_vision: boolean;
  knowledge_cutoff: string;
  is_reasoning_model: boolean;
}

export interface ModelConfigResponse {
  success: boolean;
  provider: string;
  model: string;
  config: ModelConfig;
}

/**
 * Fetch model configuration from the backend
 */
export async function fetchModelConfig(
  provider: string,
  model: string,
): Promise<ModelConfig | null> {
  try {
    const response = await getModelConfigBackendEnhanced({
      path: {
        provider,
        model,
      },
    });

    if (response.data && typeof response.data === 'object') {
      const data = response.data as ModelConfigResponse;
      if (data.success && data.config) {
        return data.config;
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch model config for ${provider}/${model}:`, error);
    return null;
  }
}

/**
 * Calculate optimal context allocation based on model limits
 */
export function calculateContextAllocation(
  modelConfig: ModelConfig,
  desiredContextPercentage: number = 0.8, // Use 80% of context for repository content by default
): {
  maxContextTokens: number;
  repositoryTokens: number;
  responseTokens: number;
} {
  const maxContextTokens = modelConfig.max_tokens;
  const maxOutputTokens = modelConfig.max_output_tokens;
  
  // Reserve space for response
  const responseTokens = Math.min(maxOutputTokens, maxContextTokens * 0.2);
  
  // Allocate remaining context for repository content
  const availableForContext = maxContextTokens - responseTokens;
  const repositoryTokens = Math.floor(availableForContext * desiredContextPercentage);
  
  return {
    maxContextTokens,
    repositoryTokens,
    responseTokens,
  };
}

/**
 * Format token count with K/M suffixes
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get context utilization color based on percentage
 */
export function getContextUtilizationColor(percentage: number): string {
  if (percentage >= 0.9) return 'text-red-600 dark:text-red-400';
  if (percentage >= 0.7) return 'text-orange-600 dark:text-orange-400';
  if (percentage >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}