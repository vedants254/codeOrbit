'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  Layers,
  Target,
  Timer,
  Zap,
  Info,
  Search,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextNode {
  node_id: string;
  node_name: string;
  node_type: string;
  file_path?: string;
  relevance_score: number;
  inclusion_reason: string;
  code_snippet?: string;
  line_range?: string;
}

export interface ContextMetadata {
  query_analysis: {
    intent: string;
    entities: string[];
    scope: string;
    files_of_interest: string[];
    keywords: string[];
    complexity: string;
  };
  nodes_selected: number;
  total_nodes_available: number;
  context_completeness: number;
  token_usage_estimate: number;
  selection_strategy: string;
  processing_time_ms: number;
  context_nodes: ContextNode[];
}

interface ContextIndicatorProps {
  contextMetadata?: ContextMetadata;
  className?: string;
}

export function ContextIndicator({ contextMetadata, className }: ContextIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'nodes' | 'analysis'>('overview');

  if (!contextMetadata) {
    return null;
  }

  const {
    query_analysis,
    nodes_selected,
    total_nodes_available,
    context_completeness,
    token_usage_estimate,
    processing_time_ms,
    context_nodes,
  } = contextMetadata;

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'debugging':
        return <Zap className="h-4 w-4 text-red-500" />;
      case 'explanation':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'modification':
        return <Code2 className="h-4 w-4 text-orange-500" />;
      case 'implementation':
        return <Layers className="h-4 w-4 text-green-500" />;
      default:
        return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'focused':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'comprehensive':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getNodeTypeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'class':
        return <Layers className="h-3 w-3" />;
      case 'function':
        return <Code2 className="h-3 w-3" />;
      case 'method':
        return <Target className="h-3 w-3" />;
      case 'module':
        return <FileText className="h-3 w-3" />;
      default:
        return <Code2 className="h-3 w-3" />;
    }
  };

  const groupedNodes = context_nodes.reduce(
    (acc, node) => {
      const file = node.file_path || 'Unknown';
      if (!acc[file]) {
        acc[file] = [];
      }
      acc[file].push(node);
      return acc;
    },
    {} as Record<string, ContextNode[]>,
  );

  return (
    <TooltipProvider>
      <Card className={cn('w-full border-l-4 border-l-primary', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Smart Context</CardTitle>
              <Badge variant="outline" className="text-xs">
                {nodes_selected} / {total_nodes_available} nodes
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-xs">
                    <Timer className="h-3 w-3 mr-1" />
                    {processing_time_ms}ms
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Context processing time</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Progress indicators */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Context Completeness</span>
              <span>{Math.round(context_completeness * 100)}%</span>
            </div>
            <Progress value={context_completeness * 100} className="h-1" />

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                {getIntentIcon(query_analysis.intent)}
                <span className="text-muted-foreground">Intent:</span>
                <span className="font-medium capitalize">{query_analysis.intent}</span>
              </div>
              <Badge className={cn('text-xs', getScopeColor(query_analysis.scope))}>
                {query_analysis.scope}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Tab navigation */}
              <div className="flex border-b border-border mb-4">
                {[
                  { id: 'overview', label: 'Overview', icon: BarChart3 },
                  { id: 'nodes', label: 'Nodes', icon: Layers },
                  { id: 'analysis', label: 'Analysis', icon: Brain },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as 'overview' | 'nodes' | 'analysis')}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 border-transparent',
                        activeTab === tab.id
                          ? 'text-primary border-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tokens Est:</span>
                        <span className="font-medium">{token_usage_estimate.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Strategy:</span>
                        <span className="font-medium text-xs">
                          {contextMetadata.selection_strategy}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Files:</span>
                        <span className="font-medium">{Object.keys(groupedNodes).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Complexity:</span>
                        <Badge variant="outline" className="text-xs">
                          {query_analysis.complexity}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {query_analysis.entities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Detected Entities</h4>
                      <div className="flex flex-wrap gap-1">
                        {query_analysis.entities.map((entity, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'nodes' && (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(groupedNodes).map(([file, nodes]) => (
                    <div key={file} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {file.split('/').pop()}
                        <Badge variant="outline" className="text-xs">
                          {nodes.length}
                        </Badge>
                      </h4>
                      <div className="space-y-1 ml-5">
                        {nodes.map((node) => (
                          <div
                            key={node.node_id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {getNodeTypeIcon(node.node_type)}
                              <span className="text-sm font-medium truncate">{node.node_name}</span>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {node.node_type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full transition-all"
                                      style={{ width: `${node.relevance_score * 100}%` }}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Relevance: {Math.round(node.relevance_score * 100)}%</p>
                                  <p className="text-xs text-muted-foreground">
                                    {node.inclusion_reason}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Query Analysis</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {getIntentIcon(query_analysis.intent)}
                        <span className="text-muted-foreground">Intent:</span>
                        <span className="font-medium capitalize">{query_analysis.intent}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Search className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <span className="text-muted-foreground">Keywords:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {query_analysis.keywords.slice(0, 6).map((keyword, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                            {query_analysis.keywords.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{query_analysis.keywords.length - 6} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {query_analysis.files_of_interest.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Files of Interest</h4>
                      <div className="space-y-1">
                        {query_analysis.files_of_interest.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            <FileText className="h-3 w-3" />
                            <span className="font-mono text-xs">{file}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </TooltipProvider>
  );
}
