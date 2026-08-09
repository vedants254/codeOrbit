'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RefreshCw, Settings, Zap, Brain, Sparkles, Gauge, Eye, Wrench, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTokenCount } from '@/utils/model-config';

interface ModelSelectorProps {
  currentModel: Partial<{
    provider: string;
    model: string;
    temperature: number;
  }>;
  availableModels: {
    providers: Record<string, string[]>;
    user_has_keys: string[];
  };
  currentModelConfig?: {
    max_tokens: number;
    max_output_tokens: number;
    supports_function_calling: boolean;
    supports_vision: boolean;
    is_reasoning_model: boolean;
    cost_per_1M_input: number;
    cost_per_1M_output: number;
  } | null;
  isLoadingModelConfig?: boolean;
  onModelChange: (provider: string, model: string) => void;
  onRefresh: () => void;
}

export function ModelSelector({
  currentModel,
  availableModels,
  currentModelConfig,
  isLoadingModelConfig,
  onModelChange,
  onRefresh,
}: ModelSelectorProps) {
  // Show only providers for which the user has added keys; if none, show all
  const providersToShow = (
    availableModels.user_has_keys?.length
      ? availableModels.user_has_keys
      : Object.keys(availableModels.providers)
  ).filter((p) => (availableModels.providers[p] || []).length > 0);

  const initialProvider =
    currentModel.provider && providersToShow.includes(currentModel.provider)
      ? currentModel.provider
      : providersToShow[0] || 'openai';

  const safeProvider = initialProvider;
  const safeModel =
    currentModel.model &&
    (availableModels.providers[safeProvider] || []).includes(currentModel.model)
      ? currentModel.model
      : (availableModels.providers[safeProvider]?.[0] ?? 'gpt-3.5-turbo');
  const [temperature, setTemperature] = useState(currentModel.temperature ?? 0.7);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai':
        return <Zap className="h-4 w-4" />;
      case 'anthropic':
        return <Brain className="h-4 w-4" />;
      case 'gemini':
        return <Sparkles className="h-4 w-4" />;
      case 'groq':
        return <Gauge className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'anthropic':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'gemini':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'groq':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const hasUserKey = (provider: string) => {
    return availableModels.user_has_keys.includes(provider);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">AI Model</Label>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-6 w-6 p-0">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Popover open={showAdvanced} onOpenChange={setShowAdvanced}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Settings className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium">Temperature</Label>
                  <div className="mt-2 space-y-2">
                    <Slider
                      value={[temperature]}
                      onValueChange={(value) => setTemperature(value[0])}
                      max={2}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Focused (0)</span>
                      <span className="font-medium">{temperature}</span>
                      <span>Creative (2)</span>
                    </div>
                  </div>
                </div>
                {/* Model Details */}
                {currentModelConfig && (
                  <div className="border-t pt-3">
                    <div className="grid grid-cols-2 gap-3 text-[10px]">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Context:</span>
                          <span className="font-medium">
                            {formatTokenCount(currentModelConfig.max_tokens)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Output:</span>
                          <span className="font-medium">
                            {formatTokenCount(currentModelConfig.max_output_tokens)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Input:</span>
                          <span className="font-medium">
                            ${currentModelConfig.cost_per_1M_input}/1M
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          {currentModelConfig.supports_function_calling ? (
                            <Wrench className="h-2.5 w-2.5 text-green-500" />
                          ) : (
                            <Wrench className="h-2.5 w-2.5 text-muted-foreground/50" />
                          )}
                          <span
                            className={cn(
                              'text-[9px]',
                              currentModelConfig.supports_function_calling
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-muted-foreground',
                            )}
                          >
                            Functions
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {currentModelConfig.supports_vision ? (
                            <Eye className="h-2.5 w-2.5 text-blue-500" />
                          ) : (
                            <Eye className="h-2.5 w-2.5 text-muted-foreground/50" />
                          )}
                          <span
                            className={cn(
                              'text-[9px]',
                              currentModelConfig.supports_vision
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground',
                            )}
                          >
                            Vision
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {currentModelConfig.is_reasoning_model ? (
                            <Cpu className="h-2.5 w-2.5 text-purple-500" />
                          ) : (
                            <Cpu className="h-2.5 w-2.5 text-muted-foreground/50" />
                          )}
                          <span
                            className={cn(
                              'text-[9px]',
                              currentModelConfig.is_reasoning_model
                                ? 'text-purple-600 dark:text-purple-400'
                                : 'text-muted-foreground',
                            )}
                          >
                            Reasoning
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        {/* Provider Selection */}
        <Select
          value={safeProvider}
          onValueChange={(provider) => {
            const firstModel = availableModels.providers[provider]?.[0];
            if (firstModel) {
              onModelChange(provider, firstModel);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              <div className="flex items-center gap-2">
                {getProviderIcon(safeProvider)}
                <span className="capitalize">{safeProvider}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {providersToShow.map((provider) => (
              <SelectItem key={provider} value={provider}>
                <div className="flex items-center gap-2">
                  {getProviderIcon(provider)}
                  <span className="capitalize">{provider}</span>
                  {hasUserKey(provider) && (
                    <Badge variant="secondary" className="text-xs">
                      Your Key
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Model Selection */}
        <Select value={safeModel} onValueChange={(model) => onModelChange(safeProvider, model)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn('text-xs', getProviderColor(safeProvider))}
                >
                  {safeModel}
                </Badge>
                {isLoadingModelConfig && (
                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(availableModels.providers[safeProvider] || []).map((model: string) => (
              <SelectItem key={model} value={model}>
                <Badge
                  variant="secondary"
                  className={cn('text-xs', getProviderColor(safeProvider))}
                >
                  {model}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Minimal Model Info */}
        {currentModelConfig && (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <div className="flex items-center gap-2">
              <span>{formatTokenCount(currentModelConfig.max_tokens)}</span>
              <div className="flex items-center gap-1">
                {currentModelConfig.supports_function_calling && (
                  <Wrench className="h-2.5 w-2.5 text-green-500" />
                )}
                {currentModelConfig.supports_vision && (
                  <Eye className="h-2.5 w-2.5 text-blue-500" />
                )}
                {currentModelConfig.is_reasoning_model && (
                  <Cpu className="h-2.5 w-2.5 text-purple-500" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
