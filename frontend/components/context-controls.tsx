'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Settings,
  Target,
  Layers,
  Zap,
  Brain,
  FileText,
  Search,
  RotateCcw,
  Info,
  Gauge,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContextSettings {
  scope: 'focused' | 'moderate' | 'comprehensive';
  includeFullContext: boolean;
  maxTokens: number;
  includeDependencies: boolean;
  traversalDepth: number;
  relevanceThreshold: number;
}

interface ContextControlsProps {
  settings: ContextSettings;
  onSettingsChange: (settings: ContextSettings) => void;
  disabled?: boolean;
  className?: string;
  isProcessing?: boolean;
  onReset?: () => void;
}

const DEFAULT_SETTINGS: ContextSettings = {
  scope: 'moderate',
  includeFullContext: false,
  maxTokens: 4000,
  includeDependencies: true,
  traversalDepth: 2,
  relevanceThreshold: 0.3
};

const SCOPE_CONFIGS = {
  focused: {
    label: 'Focused',
    description: 'Narrow context for specific questions',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Target,
    maxTokensRange: [1000, 2000]
  },
  moderate: {
    label: 'Moderate',
    description: 'Balanced context for most questions',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Layers,
    maxTokensRange: [2000, 4000]
  },
  comprehensive: {
    label: 'Comprehensive',
    description: 'Broad context for complex queries',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Brain,
    maxTokensRange: [4000, 8000]
  }
};

export function ContextControls({
  settings,
  onSettingsChange,
  disabled = false,
  className,
  isProcessing = false,
  onReset
}: ContextControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateSetting = useCallback(<K extends keyof ContextSettings>(
    key: K,
    value: ContextSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    
    // Auto-adjust max tokens based on scope
    if (key === 'scope') {
      const scopeConfig = SCOPE_CONFIGS[value as keyof typeof SCOPE_CONFIGS];
      const [min, max] = scopeConfig.maxTokensRange;
      newSettings.maxTokens = Math.min(Math.max(settings.maxTokens, min), max);
    }
    
    onSettingsChange(newSettings);
  }, [settings, onSettingsChange]);

  const handleReset = useCallback(() => {
    onSettingsChange(DEFAULT_SETTINGS);
    onReset?.();
  }, [onSettingsChange, onReset]);

  const currentScopeConfig = SCOPE_CONFIGS[settings.scope];
  const ScopeIcon = currentScopeConfig.icon;

  return (
    <TooltipProvider>
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Context Settings</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={disabled || isProcessing}
                    className="h-6 w-6 p-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to defaults</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 px-2 text-xs"
              >
                {isExpanded ? 'Less' : 'More'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Context Scope */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <ScopeIcon className="h-4 w-4" />
              Context Scope
            </Label>
            <Select
              value={settings.scope}
              onValueChange={(value) => updateSetting('scope', value as ContextSettings['scope'])}
              disabled={disabled || isProcessing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPE_CONFIGS).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">{config.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {config.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Include Full Context Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Full Repository</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Include entire repository content instead of smart selection</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              checked={settings.includeFullContext}
              onCheckedChange={(checked) => updateSetting('includeFullContext', checked)}
              disabled={disabled || isProcessing}
            />
          </div>

          {/* Token Budget */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Token Budget
              </Label>
              <Badge variant="outline" className="text-xs">
                {settings.maxTokens.toLocaleString()}
              </Badge>
            </div>
            <Slider
              value={[settings.maxTokens]}
              onValueChange={([value]) => updateSetting('maxTokens', value)}
              min={currentScopeConfig.maxTokensRange[0]}
              max={currentScopeConfig.maxTokensRange[1]}
              step={500}
              disabled={disabled || isProcessing || settings.includeFullContext}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{currentScopeConfig.maxTokensRange[0].toLocaleString()}</span>
              <span>{currentScopeConfig.maxTokensRange[1].toLocaleString()}</span>
            </div>
          </div>

          {/* Advanced Settings (when expanded) */}
          {isExpanded && !settings.includeFullContext && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Include Dependencies */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Dependencies</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Include related code dependencies in context</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={settings.includeDependencies}
                  onCheckedChange={(checked) => updateSetting('includeDependencies', checked)}
                  disabled={disabled || isProcessing}
                />
              </div>

              {/* Traversal Depth */}
              {settings.includeDependencies && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Traversal Depth
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      {settings.traversalDepth} hops
                    </Badge>
                  </div>
                  <Slider
                    value={[settings.traversalDepth]}
                    onValueChange={([value]) => updateSetting('traversalDepth', value)}
                    min={1}
                    max={3}
                    step={1}
                    disabled={disabled || isProcessing}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Direct only</span>
                    <span>3 levels deep</span>
                  </div>
                </div>
              )}

              {/* Relevance Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Relevance Filter
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(settings.relevanceThreshold * 100)}%
                  </Badge>
                </div>
                <Slider
                  value={[settings.relevanceThreshold]}
                  onValueChange={([value]) => updateSetting('relevanceThreshold', value)}
                  min={0.1}
                  max={0.9}
                  step={0.1}
                  disabled={disabled || isProcessing}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Include all</span>
                  <span>Only highly relevant</span>
                </div>
              </div>
            </div>
          )}

          {/* Context Strategy Summary */}
          <div className="pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>
                {settings.includeFullContext 
                  ? 'Using full repository content'
                  : `Smart ${settings.scope} context with ${settings.includeDependencies ? 'dependencies' : 'no dependencies'}`
                }
              </span>
            </div>
            {isProcessing && (
              <div className="flex items-center gap-2 text-xs text-blue-600 mt-1">
                <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Processing context...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}