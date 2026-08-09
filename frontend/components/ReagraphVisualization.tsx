'use client';

import type React from 'react';
import { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphCanvasRef } from 'reagraph';
import { generateGraphFromGithub, generateGraphFromZip } from '@/utils/api';
import type {
  GraphResponse,
  GraphNode as ApiGraphNode,
  GraphEdge as ApiGraphEdge,
} from '@/api-client/types.gen';
import { useResultData } from '@/context/ResultDataContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession } from 'next-auth/react';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';
import { useGraphSearch } from '@/hooks/useGraphSearch';
import {
  Network,
  FileText,
  Code,
  ActivityIcon as Function,
  Variable,
  Package,
  Layers,
  Eye,
  EyeOff,
  Menu,
  X,
  Search,
  ToggleLeft,
  ToggleRight,
  Target,
  Focus,
} from 'lucide-react';
import { CodeReferenceAnalyzer } from '@/components/code-reference-analyzer';
import { HierarchyTab } from '@/components/hierarchy-tab';
import type { CodeReference, GraphData } from '@/types/code-analysis';
import { type GraphNode as SearchGraphNode } from '@/lib/search-utils';
import type { SigmaGraphInnerData } from './SigmaGraphInner';

// Properly import GraphCanvas with Next.js SSR handling
const GraphCanvas = dynamic(() => import('reagraph').then((mod) => mod.GraphCanvas), {
  ssr: false,
  loading: () => <GraphLoadingComponent />,
});

// Import Sigma.js component
const SigmaGraphInner = dynamic(() => import('./SigmaGraphInner'), {
  ssr: false,
  loading: () => <GraphLoadingComponent />,
});

// Memoized loading component
const GraphLoadingComponent = memo(() => (
  <div className="flex justify-center items-center h-full">
    <div className="flex flex-col items-center gap-4 p-8">
      <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <div className="text-center space-y-2">
        <p className="text-xs sm:text-sm font-medium text-foreground">Loading Graph</p>
        <p className="text-xs text-muted-foreground">Analyzing code structure...</p>
      </div>
    </div>
  </div>
));
GraphLoadingComponent.displayName = 'GraphLoadingComponent';

// Define interfaces
interface GraphNode extends ApiGraphNode {
  line: number;
  inDegree?: number;
  outDegree?: number;
  connectedFiles?: string[];
}

type GraphEdge = ApiGraphEdge;

interface ApiResponse {
  html_url: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GitHubSourceData {
  repo_url: string;
  access_token?: string;
  branch?: string;
}

type SourceData = GitHubSourceData | File;

interface ReagraphVisualizationProps {
  setParentActiveTab: (tab: string) => void;
  onError?: (error: string) => void;
  onNodeClick?: (node: GraphNode) => void;
}

interface ReagraphNode {
  id: string;
  label: string;
  fill: string;
  size: number;
}

interface ReagraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  color?: string;
  size?: number;
}

interface ReagraphData {
  nodes: ReagraphNode[];
  edges: ReagraphEdge[];
}

interface CategoryConfig {
  color: string;
  icon: typeof Network;
  label: string;
  description: string;
}

type NodeCategories = Record<string, CategoryConfig>;

interface CacheEntry {
  data: ApiResponse;
  timestamp: number;
}

// Cache and constants
const apiCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000;

// Performance limits map for different visualization engines
const PERFORMANCE_LIMITS = {
  reagraph: {
    warning: 1500, // Show warning at 1500+ nodes
    maxNodes: 3000, // Block at 2500+ nodes
  },
  sigma: {
    warning: 3000, // Show warning at 3000+ nodes (Sigma.js is more efficient)
    maxNodes: 10000, // Block at 10000+ nodes
  },
} as const;

const COLOR_PALETTE = [
  '#F06292',
  '#64B5F6',
  '#81C784',
  '#FFD54F',
  '#BA68C8',
  '#FF8A65',
  '#90A4AE',
  '#A1887F',
  '#4DB6AC',
  '#9575CD',
];

// Utility function to create lighter colors for highlighting
const getLighterColor = (color: string): string => {
  // Remove the # if present
  const hex = color.replace('#', '');

  // Parse the hex color
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Make it lighter by blending with white
  const lighterR = Math.round(r + (255 - r) * 0.4);
  const lighterG = Math.round(g + (255 - g) * 0.4);
  const lighterB = Math.round(b + (255 - b) * 0.4);

  // Convert back to hex
  return `#${lighterR.toString(16).padStart(2, '0')}${lighterG.toString(16).padStart(2, '0')}${lighterB.toString(16).padStart(2, '0')}`;
};
const ICON_LIST = [Layers, Function, Code, Variable, Package, FileText, Network];

// Utility functions
const getDynamicNodeCategories = (() => {
  const cache = new Map<string, NodeCategories>();
  return (nodes: GraphNode[] = []): NodeCategories => {
    const cacheKey = nodes
      .map((n) => n.category || 'other')
      .sort()
      .join(',');
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    const categories: NodeCategories = {};
    let colorIdx = 0,
      iconIdx = 0;

    for (const node of nodes) {
      const key = node.category?.toLowerCase() || 'other';
      if (!categories[key]) {
        categories[key] = {
          color: COLOR_PALETTE[colorIdx % COLOR_PALETTE.length],
          icon: ICON_LIST[iconIdx % ICON_LIST.length],
          label: key.charAt(0).toUpperCase() + key.slice(1),
          description: `Nodes of type "${key}"`,
        };
        colorIdx++;
        iconIdx++;
      }
    }

    if (!categories['other']) {
      categories['other'] = {
        color: '#90A4AE',
        icon: Network,
        label: 'Other',
        description: 'Other code elements',
      };
    }

    cache.set(cacheKey, categories);
    return categories;
  };
})();

const calculateNodeMetrics = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { includeConnectedFiles?: boolean; maxDepth?: number } = {},
) => {
  const { includeConnectedFiles = true, maxDepth = 3 } = options;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();

  // Only build adjacency if we will traverse for connected files
  const adjacencyList: Map<string, Set<string>> | null = includeConnectedFiles
    ? new Map<string, Set<string>>()
    : null;

  nodes.forEach((node) => {
    inDegreeMap.set(node.id, 0);
    outDegreeMap.set(node.id, 0);
    if (adjacencyList) adjacencyList.set(node.id, new Set());
  });

  edges.forEach((edge) => {
    const sourceId = edge.source;
    const targetId = edge.target;

    outDegreeMap.set(sourceId, (outDegreeMap.get(sourceId) || 0) + 1);
    inDegreeMap.set(targetId, (inDegreeMap.get(targetId) || 0) + 1);

    if (adjacencyList) {
      if (!adjacencyList.has(sourceId)) adjacencyList.set(sourceId, new Set());
      if (!adjacencyList.has(targetId)) adjacencyList.set(targetId, new Set());
      adjacencyList.get(sourceId)!.add(targetId);
      adjacencyList.get(targetId)!.add(sourceId);
    }
  });

  const getConnectedFiles = (nodeId: string, depth: number): Set<string> => {
    if (!includeConnectedFiles || depth <= 0 || !adjacencyList) return new Set<string>();

    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    const connectedFiles = new Set<string>();

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (visited.has(id) || currentDepth > depth) continue;
      visited.add(id);

      const node = nodeMap.get(id);
      if (node?.file && id !== nodeId) {
        connectedFiles.add(node.file);
      }

      if (currentDepth < depth) {
        const neighbors = adjacencyList.get(id) || new Set();
        neighbors.forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
          }
        });
      }
    }

    return connectedFiles;
  };

  return nodes.map((node) => ({
    ...node,
    inDegree: inDegreeMap.get(node.id) || 0,
    outDegree: outDegreeMap.get(node.id) || 0,
    connectedFiles: includeConnectedFiles
      ? Array.from(getConnectedFiles(node.id, maxDepth))
      : undefined,
  }));
};

const transformApiResponseMemo = (() => {
  const cache = new WeakMap<GraphResponse, ApiResponse>();
  return (response: GraphResponse): ApiResponse => {
    if (cache.has(response)) return cache.get(response)!;

    const transformedNodes: GraphNode[] = response.nodes.map((node) => ({
      ...node,
      line: node.start_line || 0,
    }));

    // Heuristics: skip expensive connected-files traversal for large graphs
    const nodeCount = transformedNodes.length;
    const includeConnectedFiles = nodeCount <= 400; // compute only for smaller graphs
    const depth = nodeCount <= 200 ? 3 : nodeCount <= 400 ? 2 : 0;

    const nodesWithMetrics = calculateNodeMetrics(transformedNodes, response.edges, {
      includeConnectedFiles,
      maxDepth: depth,
    });

    const result = {
      html_url: response.html_url ?? '',
      nodes: nodesWithMetrics,
      edges: response.edges,
    };

    cache.set(response, result);
    return result;
  };
})();

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

// Enhanced Overview Tab with Improved Search UX
const OverviewTab = memo(
  ({
    categoryData,
    nodes,
    onNodeClick,
  }: {
    categoryData: Array<{ key: string; config: CategoryConfig; count: number }>;
    nodes: SearchGraphNode[];
    onNodeClick?: (node: SearchGraphNode) => void;
  }) => {
    const search = useGraphSearch({
      nodes,
      debounceMs: 300,
      maxResults: 50,
    });

    const handleResultClick = useCallback(
      (node: SearchGraphNode) => {
        onNodeClick?.(node);
      },
      [onNodeClick],
    );

    const handleCategoryClick = useCallback(
      (category: string) => {
        search.searchByCategory(category);
      },
      [search],
    );

    // Determine if we're in search mode
    const isSearchMode = search.query.length > 0;
    const hasResults = search.hasResults;
    const hasActiveFilters =
      search.filters && search.filters.categories && search.filters.categories.length > 0;

    return (
      <div className="h-full flex flex-col bg-background/20">
        {/* Enhanced Search Header - Fixed Height */}
        <div className="flex-shrink-0 border-b border-border/30 bg-background/60 backdrop-blur-md">
          <div className="p-4 space-y-3">
            {/* Search Input with better styling */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search nodes, files, functions, or categories..."
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  className="w-full h-11 pl-12 pr-12 rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-200 shadow-sm"
                />
                {search.query && (
                  <button
                    onClick={search.clearSearch}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Search Status Bar */}
            <div
              className={`transition-all duration-300 overflow-hidden ${
                isSearchMode ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {search.isSearching ? (
                    <div className="flex items-center gap-2 text-primary">
                      <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span>Searching...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>
                        {search.results.length} result{search.results.length !== 1 ? 's' : ''} found
                        {search.results.length === 50 && ' (showing first 50)'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={search.clearSearch}
                  className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
                >
                  Clear search
                </button>
              </div>
            </div>

            {/* Filter Status Bar */}
            {search.filters &&
              ((search.filters.categories?.length || 0) > 0 ||
                (search.filters.fileExtensions?.length || 0) > 0 ||
                (search.filters.directories?.length || 0) > 0 ||
                search.filters.minConnections !== undefined ||
                search.filters.maxConnections !== undefined) && (
                <div className="transition-all duration-300 overflow-hidden opacity-100">
                  <div className="flex flex-col gap-2 text-xs py-2 border-t border-border/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground font-medium">Active Filters</span>
                      </div>
                      <button
                        onClick={() => search.setFilters({})}
                        className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50 text-xs"
                        title="Clear all filters"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* Category Filters */}
                      {search.filters.categories?.map((category) => (
                        <div key={`cat-${category}`} className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          >
                            <span className="text-xs opacity-70">Category:</span> {category}
                          </Badge>
                          <button
                            onClick={() =>
                              search.setFilters({
                                ...search.filters,
                                categories: search.filters.categories?.filter(
                                  (c) => c !== category,
                                ),
                              })
                            }
                            className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                            title={`Remove ${category} filter`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {/* File Extension Filters */}
                      {search.filters.fileExtensions?.map((ext) => (
                        <div key={`ext-${ext}`} className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                          >
                            <span className="text-xs opacity-70">Ext:</span> .{ext}
                          </Badge>
                          <button
                            onClick={() =>
                              search.setFilters({
                                ...search.filters,
                                fileExtensions: search.filters.fileExtensions?.filter(
                                  (e) => e !== ext,
                                ),
                              })
                            }
                            className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 transition-colors"
                            title={`Remove .${ext} filter`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {/* Directory Filters */}
                      {search.filters.directories?.map((dir) => (
                        <div key={`dir-${dir}`} className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          >
                            <span className="text-xs opacity-70">Dir:</span> {dir}
                          </Badge>
                          <button
                            onClick={() =>
                              search.setFilters({
                                ...search.filters,
                                directories: search.filters.directories?.filter((d) => d !== dir),
                              })
                            }
                            className="text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                            title={`Remove ${dir} filter`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {/* Connection Filters */}
                      {(search.filters.minConnections !== undefined ||
                        search.filters.maxConnections !== undefined) && (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                          >
                            <span className="text-xs opacity-70">Connections:</span>
                            {search.filters.minConnections !== undefined &&
                            search.filters.maxConnections !== undefined
                              ? `${search.filters.minConnections}-${search.filters.maxConnections}`
                              : search.filters.minConnections !== undefined
                                ? `≥${search.filters.minConnections}`
                                : `≤${search.filters.maxConnections}`}
                          </Badge>
                          <button
                            onClick={() =>
                              search.setFilters({
                                ...search.filters,
                                minConnections: undefined,
                                maxConnections: undefined,
                              })
                            }
                            className="text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100 transition-colors"
                            title="Remove connection filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Content Area with proper scroll boundaries */}
        <div className="flex-1 min-h-0 relative">
          {/* Search/Filter Mode - Improved Layout */}
          <div
            className={`absolute inset-0 transition-all duration-300 ease-in-out ${
              isSearchMode || hasActiveFilters
                ? 'translate-y-0 opacity-100 pointer-events-auto'
                : 'translate-y-4 opacity-0 pointer-events-none'
            }`}
          >
            <div className="h-full bg-background/40 backdrop-blur-sm border-t border-border/20">
              <ScrollArea className="h-full">
                <div className="p-4 pb-20">
                  {' '}
                  {/* Extra padding bottom for mobile */}
                  {/* Search Results */}
                  {hasResults ? (
                    <div className="space-y-4">
                      {/* Results Header */}
                      <div className="flex items-center gap-2 pb-3 border-b border-border/30 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
                        <Search className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Search Results</h3>
                        <Badge variant="secondary" className="text-xs">
                          {search.results.length}
                        </Badge>
                      </div>

                      {/* Results List with improved spacing */}
                      <div className="space-y-3">
                        {search.results.map((result) => {
                          const categoryConfig = categoryData.find(
                            (c) => c.key === result.node.category?.toLowerCase(),
                          )?.config;
                          const Icon = categoryConfig?.icon || Code;

                          return (
                            <div
                              key={result.node.id}
                              onClick={() => handleResultClick(result.node)}
                              className="group relative overflow-hidden rounded-xl border border-border/40 bg-background/60 hover:bg-background/80 hover:border-primary/30 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-primary/5"
                            >
                              {/* Gradient overlay on hover */}
                              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                              <div className="relative p-4">
                                <div className="flex items-start gap-3">
                                  {/* Category indicator */}
                                  <div className="flex-shrink-0 mt-1">
                                    <div
                                      className="w-3 h-3 rounded-full ring-2 ring-background"
                                      style={{
                                        backgroundColor: categoryConfig?.color || '#90A4AE',
                                      }}
                                    />
                                  </div>

                                  {/* Icon */}
                                  <div className="flex-shrink-0 mt-0.5">
                                    <div className="w-8 h-8 rounded-lg bg-muted/30 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                        {result.node.name}
                                      </h4>
                                      <Badge
                                        variant="outline"
                                        className="text-xs h-5 px-2 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                      >
                                        {Math.round(result.score * 100)}%
                                      </Badge>
                                    </div>

                                    {/* File path */}
                                    {result.node.file && (
                                      <div className="flex items-center gap-1 mb-2">
                                        <FileText className="h-3 w-3 text-muted-foreground" />
                                        <p className="text-xs text-muted-foreground truncate">
                                          {result.node.file}
                                        </p>
                                      </div>
                                    )}

                                    {/* Category and action hint */}
                                    <div className="flex items-center justify-between">
                                      {result.node.category && (
                                        <Badge variant="secondary" className="text-xs">
                                          {result.node.category}
                                        </Badge>
                                      )}
                                      <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                        Click to explore →
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Show more hint if at limit */}
                      {search.results.length === 50 && (
                        <div className="text-center py-4">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                            <Network className="h-3 w-3" />
                            Showing first 50 results. Try refining your search for more specific
                            results.
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No Results State */
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-sm font-medium text-foreground mb-2">No results found</h3>
                      <p className="text-xs text-muted-foreground max-w-sm mb-4">
                        Try different keywords, check your spelling, or browse the categories below
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={search.clearSearch}
                        className="text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear search
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Browse Mode - Improved Layout */}
          <div
            className={`absolute inset-0 transition-all duration-300 ease-in-out ${
              !isSearchMode && !hasActiveFilters
                ? 'translate-y-0 opacity-100 pointer-events-auto'
                : 'translate-y-4 opacity-0 pointer-events-none'
            }`}
          >
            <div className="h-full">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-6 pb-20">
                  {' '}
                  {/* Extra padding bottom for mobile */}
                  {/* Welcome Section */}
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-3">
                      <Layers className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground mb-2">
                      Code Structure Overview
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Explore your codebase by searching above or browsing the node categories below
                    </p>
                  </div>
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                      <div className="text-xs text-muted-foreground mb-1">Total Nodes</div>
                      <div className="text-lg font-semibold text-foreground">
                        {nodes.length.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                      <div className="text-xs text-muted-foreground mb-1">Categories</div>
                      <div className="text-lg font-semibold text-foreground">
                        {categoryData.filter((c) => c.count > 0).length}
                      </div>
                    </div>
                  </div>
                  {/* Node Categories */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-6 bg-primary rounded-full" />
                      <h3 className="text-sm font-semibold text-foreground">Browse by Category</h3>
                    </div>

                    <div className="grid gap-3">
                      {categoryData
                        .filter(({ count }) => count > 0)
                        .map(({ key, config, count }) => {
                          const Icon = config.icon;
                          return (
                            <div
                              key={key}
                              onClick={() => handleCategoryClick(key)}
                              className="group relative overflow-hidden rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 hover:border-primary/30 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-primary/5"
                            >
                              {/* Gradient overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                              <div className="relative p-4">
                                <div className="flex items-center gap-3">
                                  {/* Color indicator */}
                                  <div
                                    className="w-4 h-4 rounded-full ring-2 ring-background/50 flex-shrink-0"
                                    style={{ backgroundColor: config.color }}
                                  />

                                  {/* Icon */}
                                  <div className="w-10 h-10 rounded-lg bg-muted/30 group-hover:bg-primary/10 flex items-center justify-center transition-colors flex-shrink-0">
                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                        {config.label}
                                      </h4>
                                      <Badge
                                        variant="secondary"
                                        className="text-xs px-2 py-1 bg-muted/30 group-hover:bg-primary/10 transition-colors flex-shrink-0"
                                      >
                                        {count.toLocaleString()}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-2">
                                      {config.description}
                                    </p>
                                    <div className="flex items-center justify-between">
                                      <div className="text-xs text-muted-foreground">
                                        Click to search this category
                                      </div>
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Search className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  {/* Tips Section */}
                  <div className="mt-8 p-4 rounded-xl bg-muted/10 border border-border/30">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Search className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2">Search Tips</h4>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          <li>• Search by function names, file paths, or code elements</li>
                          <li>• Use category names to filter results</li>
                          <li>• Results are ranked by relevance</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
OverviewTab.displayName = 'OverviewTab';

// Main Component
export default function EnhancedReagraphVisualization({
  setParentActiveTab,
  onError,
  onNodeClick,
}: ReagraphVisualizationProps) {
  const {
    sourceType,
    sourceData,
    setSelectedFilePath,
    setSelectedFileLine,
    setCodeViewerSheetOpen,
    selectedFilePath,
    selectedFileLine,
  } = useResultData();
  const [graphData, setGraphData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'hierarchy'>('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState('40vw');
  const [isResizing, setIsResizing] = useState(false);
  const [visualizationType, setVisualizationType] = useState<'reagraph' | 'sigma'>('sigma');
  const [hierarchyDepth, setHierarchyDepth] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'highlight' | 'isolate'>('highlight');
  const [isolatedSubgraph, setIsolatedSubgraph] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null>(null);
  const { data: session } = useSession();

  const generateGraphFromGithubWithAuth = useApiWithAuth(generateGraphFromGithub);
  const generateGraphFromZipWithAuth = useApiWithAuth(generateGraphFromZip);

  // Function to build isolated subgraph based on hierarchy depth
  const buildIsolatedSubgraph = useCallback(
    (nodeId: string, depth: number) => {
      if (!graphData) return null;

      const visited = new Set<string>();
      const subgraphNodes: GraphNode[] = [];
      const subgraphEdges: GraphEdge[] = [];

      const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];

      while (queue.length > 0) {
        const { id, currentDepth } = queue.shift()!;

        if (visited.has(id) || currentDepth > depth) continue;
        visited.add(id);

        // Add node to subgraph
        const node = graphData.nodes.find((n) => n.id === id);
        if (node) {
          subgraphNodes.push(node);
        }

        if (currentDepth < depth) {
          // Find all connected nodes
          const connectedEdges = graphData.edges.filter(
            (edge) =>
              (edge.source === id || edge.target === id) &&
              !visited.has(edge.source === id ? edge.target : edge.source),
          );

          for (const edge of connectedEdges) {
            const connectedNodeId = edge.source === id ? edge.target : edge.source;
            queue.push({ id: connectedNodeId, currentDepth: currentDepth + 1 });
          }
        }
      }

      // Add edges that connect nodes within the subgraph
      const nodeIds = new Set(subgraphNodes.map((n) => n.id));
      for (const edge of graphData.edges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
          subgraphEdges.push(edge);
        }
      }

      return { nodes: subgraphNodes, edges: subgraphEdges };
    },
    [graphData],
  );

  const hasLoadedRef = useRef(false);
  const currentRequestKeyRef = useRef<string | null>(null);
  const analysisScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isGitHubSourceData = useCallback((data: SourceData): data is GitHubSourceData => {
    return data !== null && typeof data === 'object' && 'repo_url' in data;
  }, []);

  const requestKey = useMemo(() => {
    if (!sourceType || !sourceData) return null;
    if (sourceType === 'github' && isGitHubSourceData(sourceData)) {
      return `github-${sourceData.repo_url}-${sourceData.access_token || ''}`;
    }
    if (sourceType === 'zip' && sourceData instanceof File) {
      return `zip-${sourceData.name}-${sourceData.size}-${sourceData.lastModified}`;
    }
    return null;
  }, [sourceType, sourceData, isGitHubSourceData]);

  useEffect(() => {
    if (!requestKey || !isClient) return;
    if (hasLoadedRef.current && currentRequestKeyRef.current === requestKey) return;

    const cachedEntry = apiCache.get(requestKey);
    if (cachedEntry && isCacheValid(cachedEntry)) {
      setGraphData(cachedEntry.data);
      hasLoadedRef.current = true;
      currentRequestKeyRef.current = requestKey;
      return;
    }

    let isCancelled = false;

    const fetchGraph = async () => {
      setLoading(true);
      setError(null);

      try {
        let data: GraphResponse;
        if (sourceType === 'github' && sourceData && isGitHubSourceData(sourceData)) {
          data = await generateGraphFromGithubWithAuth({
            ...sourceData,
            jwt_token: session?.jwt_token || undefined,
          });
        } else if (sourceType === 'zip' && sourceData instanceof File) {
          data = await generateGraphFromZipWithAuth(sourceData, session?.jwt_token || '');
        } else {
          throw new Error('Invalid source type or data');
        }

        if (!isCancelled) {
          const transformedData = transformApiResponseMemo(data);
          apiCache.set(requestKey, {
            data: transformedData,
            timestamp: Date.now(),
          });
          setGraphData(transformedData);
          hasLoadedRef.current = true;
          currentRequestKeyRef.current = requestKey;
        }
      } catch (e) {
        if (!isCancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load graph data';
          setError(msg);
          onError?.(msg);
          setGraphData(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchGraph();
    return () => {
      isCancelled = true;
    };
  }, [
    requestKey,
    isClient,
    sourceType,
    sourceData,
    onError,
    isGitHubSourceData,
    generateGraphFromGithubWithAuth,
    generateGraphFromZipWithAuth,
    session?.jwt_token,
  ]);

  const nodeCategories = useMemo(
    () => getDynamicNodeCategories(graphData?.nodes),
    [graphData?.nodes],
  );

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidthPx = window.innerWidth - e.clientX;
      const minWidthPx = 320;
      const minWidthVw = (minWidthPx / window.innerWidth) * 100;
      const maxWidthVw = 100;
      let newWidthVw = (newWidthPx / window.innerWidth) * 100;
      if (newWidthVw < minWidthVw) newWidthVw = minWidthVw;
      if (newWidthVw > maxWidthVw) newWidthVw = maxWidthVw;
      setSidebarWidth(`${newWidthVw}vw`);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  interface ReaGraphGraphNode {
    id: string;
    label?: string;
    type?: string;
  }

  // GraphCanvas ref for camera controls
  const graphRef = useRef<GraphCanvasRef | null>(null);

  const centerAndHighlightNode = useCallback((nodeId: string) => {
    try {
      // Center/focus camera on node
      graphRef.current?.centerGraph?.([nodeId], { centerOnlyIfNodesNotInView: false });
      graphRef.current?.fitNodesInView?.([nodeId], { fitOnlyIfNodesNotInView: false });
      setActiveNodeId(nodeId);
      // On small screens, close the analysis panel to reveal the graph
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsMobileSidebarOpen(false);
      }
    } catch {}
  }, []);

  // Track double-click timing
  const lastClickTimeRef = useRef<number>(0);
  const lastClickNodeRef = useRef<string | null>(null);

  const handleNodeClick = useCallback(
    (node: ReaGraphGraphNode) => {
      const graphNode = graphData?.nodes.find((n) => n.id === node.id);
      if (!graphNode) return;

      const currentTime = Date.now();
      const isDoubleClick =
        currentTime - lastClickTimeRef.current < 300 && lastClickNodeRef.current === node.id;

      if (isDoubleClick) {
        // Double-click: Enter isolate mode
        setViewMode('isolate');
        const subgraph = buildIsolatedSubgraph(node.id, hierarchyDepth);
        setIsolatedSubgraph(subgraph);
      }

      setSelectedNode(graphNode);
      setActiveNodeId(graphNode.id);
      // Set hierarchy as default for better UX
      setActiveTab('hierarchy');
      setIsMobileSidebarOpen(true);
      onNodeClick?.(graphNode);

      // Scroll to top of analysis content after a brief delay
      setTimeout(() => {
        if (analysisScrollRef.current) {
          analysisScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);

      // Center and highlight in graph
      centerAndHighlightNode(node.id);

      lastClickTimeRef.current = currentTime;
      lastClickNodeRef.current = node.id;
    },
    [graphData?.nodes, onNodeClick, centerAndHighlightNode, buildIsolatedSubgraph, hierarchyDepth],
  );

  // Handle canvas click to exit isolate mode or clear highlights
  const handleCanvasClick = useCallback(() => {
    if (viewMode === 'isolate') {
      setViewMode('highlight');
      setIsolatedSubgraph(null);
    } else {
      // Clear highlights in highlight mode
      setActiveNodeId(null);
      setSelectedNode(null);
    }
  }, [viewMode]);

  const handleOpenFile = useCallback(
    (filePath: string, line?: number) => {
      setSelectedFilePath?.(filePath);
      setSelectedFileLine?.(line || 1);
      setCodeViewerSheetOpen?.(true);
      setParentActiveTab?.('explorer');
      setIsMobileSidebarOpen(false);
    },
    [setSelectedFilePath, setSelectedFileLine, setCodeViewerSheetOpen, setParentActiveTab],
  );

  // When explorer selects a file/line that corresponds to a graph node, focus that node in graph
  useEffect(() => {
    if (!graphData || !selectedFilePath) return;
    const candidates = graphData.nodes.filter((n) => n.file === selectedFilePath);
    if (candidates.length === 0) return;
    let target = candidates[0];
    if (selectedFileLine) {
      // Choose the node with start_line closest to selectedFileLine
      target = candidates.reduce((best, cur) => {
        const b = typeof best.start_line === 'number' ? best.start_line : Number.MAX_SAFE_INTEGER;
        const c = typeof cur.start_line === 'number' ? cur.start_line : Number.MAX_SAFE_INTEGER;
        return Math.abs(c - selectedFileLine) < Math.abs(b - selectedFileLine) ? cur : best;
      }, target);
    }
    if (target?.id) centerAndHighlightNode(target.id);
  }, [graphData, selectedFilePath, selectedFileLine, centerAndHighlightNode]);

  const reagraphData = useMemo((): ReagraphData | null => {
    // Use isolated subgraph if in isolate mode, otherwise use full graph
    const dataToUse = viewMode === 'isolate' && isolatedSubgraph ? isolatedSubgraph : graphData;
    if (!dataToUse?.nodes?.length) return null;

    const nodeCount = dataToUse.nodes.length;
    const isLargeGraph = nodeCount >= 500;

    // Calculate node depths for highlighting (same logic as Sigma.js)
    const nodeDepths = new Map<string, number>();
    if (selectedNode && hierarchyDepth && viewMode === 'highlight') {
      const visited = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: selectedNode.id, depth: 0 }];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id) || depth > hierarchyDepth) continue;
        visited.add(id);
        nodeDepths.set(id, depth);

        if (depth < hierarchyDepth) {
          const connectedEdges = dataToUse.edges.filter(
            (edge) =>
              (edge.source === id || edge.target === id) &&
              !visited.has(edge.source === id ? edge.target : edge.source),
          );

          for (const edge of connectedEdges) {
            const connectedNodeId = edge.source === id ? edge.target : edge.source;
            queue.push({ id: connectedNodeId, depth: depth + 1 });
          }
        }
      }
    }

    return {
      nodes: dataToUse.nodes.map((node) => {
        const baseColor =
          nodeCategories[node.category?.toLowerCase() || 'other']?.color ||
          nodeCategories['other']?.color ||
          '#90A4AE';

        let nodeColor = baseColor;
        let nodeSize = isLargeGraph ? 6 : Math.max(8, Math.min(16, node.name.length * 0.6 + 6));

        // Apply depth-based highlighting in highlight mode (match Sigma.js exactly)
        if (viewMode === 'highlight' && selectedNode && hierarchyDepth) {
          const nodeDepth = nodeDepths.get(node.id);

          if (node.id === selectedNode.id) {
            // Root node - special highlighting (match Sigma.js)
            nodeSize = nodeSize * 1.6;
            nodeColor = getLighterColor(baseColor);
          } else if (nodeDepth !== undefined && nodeDepth <= hierarchyDepth) {
            // Within hierarchy depth - highlight based on depth level (match Sigma.js)
            const depthIntensity = 1 - (nodeDepth / hierarchyDepth) * 0.4;
            nodeSize = nodeSize * (1 + depthIntensity * 0.3);
            nodeColor = getLighterColor(baseColor);
          } else {
            // Outside hierarchy depth - dim significantly (match Sigma.js)
            nodeColor = baseColor + '30';
          }
        }

        return {
          id: node.id,
          label: node.name,
          fill: nodeColor,
          size: nodeSize,
        };
      }),
      edges:
        dataToUse.edges?.map((edge, edgeIndex) => {
          let edgeColor = '#e5e7eb';
          let edgeSize = 0.8;

          // Apply edge highlighting in highlight mode (match Sigma.js exactly)
          if (viewMode === 'highlight' && selectedNode && hierarchyDepth) {
            const sourceDepth = nodeDepths.get(edge.source);
            const targetDepth = nodeDepths.get(edge.target);

            if (
              sourceDepth !== undefined &&
              targetDepth !== undefined &&
              sourceDepth <= hierarchyDepth &&
              targetDepth <= hierarchyDepth
            ) {
              // Both nodes are within hierarchy depth - black edges (match Sigma.js)
              edgeColor = '#000000';
              edgeSize = 1.2;
            } else if (
              (sourceDepth !== undefined && sourceDepth <= hierarchyDepth) ||
              (targetDepth !== undefined && targetDepth <= hierarchyDepth)
            ) {
              // One node is within hierarchy depth - dark gray (match Sigma.js)
              edgeColor = '#374151';
              edgeSize = 1.0;
            } else {
              // Outside hierarchy - very dim (match Sigma.js)
              edgeColor = '#e5e7eb30';
              edgeSize = 0.6;
            }
          }

          return {
            id: `edge-${edgeIndex}`,
            source: edge.source,
            target: edge.target,
            label: isLargeGraph ? undefined : edge.relationship,
            color: edgeColor,
            size: edgeSize,
          };
        }) || [],
    };
  }, [nodeCategories, viewMode, isolatedSubgraph, graphData, selectedNode, hierarchyDepth]);

  const sigmaData = useMemo((): SigmaGraphInnerData | null => {
    // Use isolated subgraph if in isolate mode, otherwise use full graph
    const dataToUse = viewMode === 'isolate' && isolatedSubgraph ? isolatedSubgraph : graphData;
    if (!dataToUse?.nodes?.length) return null;

    return {
      nodes: dataToUse.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        category: node.category,
      })),
      edges: dataToUse.edges.map((edge, idx) => ({
        id: `e-${idx}-${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
      })),
    };
  }, [viewMode, isolatedSubgraph, graphData]);

  const categoryData = useMemo(() => {
    if (!graphData?.nodes) return [];
    const categoryCount = graphData.nodes.reduce(
      (acc, node) => {
        const category = node.category?.toLowerCase() || 'other';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(nodeCategories)
      .map(([key, config]) => ({ key, config, count: categoryCount[key] || 0 }))
      .filter((item) => item.count > 0 || item.key === 'other');
  }, [graphData?.nodes, nodeCategories]);

  const handleTryAgain = useCallback(() => {
    if (requestKey) apiCache.delete(requestKey);
    hasLoadedRef.current = false;
    currentRequestKeyRef.current = null;
    window.location.reload();
  }, [requestKey]);

  // Handle search node click - switch to hierarchy tab
  const handleSearchNodeClick = useCallback(
    (node: SearchGraphNode) => {
      const graphNode = graphData?.nodes.find((n) => n.id === node.id);
      if (graphNode) {
        setSelectedNode(graphNode);
        setActiveNodeId(graphNode.id);
        setActiveTab('hierarchy');
        setIsMobileSidebarOpen(true);
        onNodeClick?.(graphNode);
      }
    },
    [graphData?.nodes, onNodeClick],
  );

  // Convert GraphNode to CodeReference for the analyzer
  const selectedCodeReference: CodeReference | null = useMemo(() => {
    if (!selectedNode) return null;
    return {
      id: selectedNode.id,
      name: selectedNode.name,
      file: selectedNode.file || '',
      code: selectedNode.code || '',
      category: selectedNode.category || 'other',
      start_line: selectedNode.start_line ?? undefined,
      end_line: selectedNode.end_line ?? undefined,
    };
  }, [selectedNode]);

  // Convert ApiResponse to GraphData for the analyzer
  const analysisGraphData: GraphData | null = useMemo(() => {
    if (!graphData) return null;
    return {
      nodes: graphData.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        file: node.file || '',
        code: node.code || '',
        category: node.category || 'other',
        start_line: node.start_line ?? undefined,
        end_line: node.end_line ?? undefined,
      })),
      edges: graphData.edges,
    };
  }, [graphData]);

  if (!isClient) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <div className="text-center space-y-2">
            <p className="text-xs sm:text-sm font-medium text-foreground">Initializing</p>
            <p className="text-xs text-muted-foreground">
              Setting up enhanced graph visualization...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <div className="text-center space-y-2">
            <p className="text-xs sm:text-sm font-medium text-foreground">Analyzing Dependencies</p>
            <p className="text-xs text-muted-foreground">This may take a few moments...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center space-y-4 p-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center">
            <Network className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-medium text-foreground">
              Failed to Load Graph
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={handleTryAgain}
            className="rounded-xl text-xs sm:text-sm"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (
    (!reagraphData || reagraphData.nodes.length === 0) &&
    (!sigmaData || sigmaData.nodes.length === 0)
  ) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center space-y-4 p-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-muted/50 flex items-center justify-center">
            <Network className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-medium text-foreground">
              No Dependencies Found
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              The repository may not have analyzable code structure or dependencies
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check for large graphs and show warnings or prevent rendering
  const nodeCount =
    visualizationType === 'reagraph' && reagraphData
      ? reagraphData.nodes.length
      : sigmaData
        ? sigmaData.nodes.length
        : 0;

  const currentLimits = PERFORMANCE_LIMITS[visualizationType];
  const isLargeGraph = nodeCount >= currentLimits.warning;

  // Don't render graph if too large
  if (nodeCount >= currentLimits.maxNodes) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center space-y-4 p-8 max-w-md">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
            <Network className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-medium text-foreground">
              Graph Too Large for {visualizationType === 'reagraph' ? 'Reagraph' : 'Sigma.js'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              This repository has {nodeCount.toLocaleString()} nodes, which exceeds the{' '}
              {currentLimits.maxNodes.toLocaleString()} node limit for{' '}
              {visualizationType === 'reagraph' ? 'Reagraph' : 'Sigma.js'}.
              {visualizationType === 'reagraph'
                ? ' Try switching to Sigma.js for better large-graph performance.'
                : ' This exceeds even our high-performance limits.'}
            </p>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            Try using the Structure or Documentation tabs instead for exploring this repository.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[70vh] w-full bg-background/60 backdrop-blur-xl rounded-xl sm:rounded-2xl overflow-hidden relative">
      {/* Performance Warning Banner */}
      {isLargeGraph && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className={`px-3 py-2 rounded-lg text-xs font-medium backdrop-blur-sm border ${
              nodeCount >= currentLimits.maxNodes * 0.8 // Show orange when close to max
                ? 'bg-orange-50/90 dark:bg-orange-950/90 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800'
                : 'bg-yellow-50/90 dark:bg-yellow-950/90 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
            }`}
          >
            {nodeCount >= currentLimits.maxNodes * 0.8
              ? `⚠️ Very large graph (${nodeCount.toLocaleString()} nodes) - performance may be severely impacted and may take several seconds to load`
              : `⚠️ Large graph detected (${nodeCount.toLocaleString()} nodes) - performance may be affected may take few seconds to load`}
          </div>
        </div>
      )}
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Overlay background, click to close */}
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
            style={{ minWidth: 0 }}
          />
          {/* Sidebar panel */}
          <div className="w-80 max-w-full h-full bg-background border-l border-border/30 shadow-xl relative z-10 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/30 flex-shrink-0">
              <h3 className="font-semibold text-sm">Enhanced Analysis</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="h-8 w-8 rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'overview' | 'analysis' | 'hierarchy')}
                className="flex-1 flex flex-col h-full"
              >
                <div className="p-3 border-b border-border/30 flex-shrink-0">
                  <TabsList className="grid w-full grid-cols-3 bg-muted/30 backdrop-blur-sm rounded-xl">
                    <TabsTrigger
                      value="overview"
                      className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
                    >
                      <Network className="w-3 h-3 mr-1" />
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="analysis"
                      className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
                    >
                      <Code className="w-3 h-3 mr-1" />
                      Analysis
                    </TabsTrigger>
                    <TabsTrigger
                      value="hierarchy"
                      className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
                    >
                      <Layers className="w-3 h-3 mr-1" />
                      Hierarchy
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex-1 overflow-hidden">
                  <TabsContent value="overview" className="h-full m-0 p-0">
                    <OverviewTab
                      categoryData={categoryData}
                      nodes={graphData?.nodes || []}
                      onNodeClick={handleSearchNodeClick}
                    />
                  </TabsContent>
                  <TabsContent value="analysis" className="h-full m-0 p-0">
                    <div className="h-full" ref={analysisScrollRef}>
                      {selectedCodeReference && analysisGraphData && (
                        <CodeReferenceAnalyzer
                          selectedNode={selectedCodeReference}
                          graphData={analysisGraphData}
                          maxDepth={3}
                          onOpenFile={handleOpenFile}
                        />
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="hierarchy" className="h-full m-0 p-0">
                    <div className="h-full">
                      {selectedCodeReference && analysisGraphData && (
                        <HierarchyTab
                          selectedNode={selectedCodeReference}
                          graphData={analysisGraphData}
                          maxDepth={1}
                          onDepthChange={setHierarchyDepth}
                          onOpenFile={handleOpenFile}
                          onSelectGraphNode={(id) => centerAndHighlightNode(id)}
                          focusedNodeId={activeNodeId || undefined}
                          onToggleFocus={(id) => {
                            if (activeNodeId === id) {
                              setActiveNodeId(null);
                            } else {
                              centerAndHighlightNode(id);
                            }
                          }}
                        />
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      )}

      {/* Mobile View - Show message instead of graph */}
      <div className="lg:hidden flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Network className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Desktop View Required</h3>
              <p className="text-sm text-muted-foreground">
                The dependency graph visualization is optimized for desktop screens. Use the
                analysis panel below for detailed code insights.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="rounded-xl"
            >
              <Menu className="h-4 w-4 mr-2" />
              Open Analysis Panel
            </Button>
          </div>
        </div>

        {/* Stats Badge for mobile */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <Badge className="bg-background/90 backdrop-blur-sm border-border/60 text-foreground rounded-xl px-2 py-1 text-xs">
            {visualizationType === 'reagraph' && reagraphData
              ? `${reagraphData.nodes.length}N • ${reagraphData.edges.length}E`
              : sigmaData
                ? `${sigmaData.nodes.length}N • ${sigmaData.edges.length}E`
                : '0N • 0E'}
          </Badge>
          {/* Only show mode badge for Sigma.js */}
          {visualizationType === 'sigma' && (
            <Badge
              variant={viewMode === 'isolate' ? 'default' : 'secondary'}
              className={`backdrop-blur-sm border-border/60 rounded-xl px-1.5 py-1 text-xs ${
                viewMode === 'isolate'
                  ? 'bg-primary text-primary-foreground border-primary/50'
                  : 'bg-background/90'
              }`}
            >
              {viewMode === 'isolate' ? 'I' : 'H'}
            </Badge>
          )}
        </div>
      </div>

      {/* Desktop Graph Canvas - Only show on lg and above */}
      <div className="hidden lg:block lg:flex-1 relative min-w-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background/80 to-background/40 backdrop-blur-sm">
          {visualizationType === 'reagraph' && reagraphData ? (
            <GraphCanvas
              ref={graphRef}
              nodes={reagraphData.nodes}
              edges={reagraphData.edges}
              selections={activeNodeId ? [activeNodeId] : []}
              actives={activeNodeId ? [activeNodeId] : []}
              // Always show node labels (edge labels are removed above when large)
              labelType={'nodes'}
              draggable={true}
              // Avoid animations for large graphs
              animated={!isLargeGraph}
              layoutType="forceDirected2d"
              // Avoid centrality sizing on large graphs to reduce internal computation
              sizingType={isLargeGraph ? 'attribute' : 'centrality'}
              onNodeClick={handleNodeClick}
              onCanvasClick={handleCanvasClick}
            />
          ) : (
            sigmaData && (
              <SigmaGraphInner
                data={sigmaData}
                onNodeClick={(nodeId: string) => {
                  if (nodeId === '') {
                    // Canvas click - clear focus and exit isolate mode if active
                    handleCanvasClick();
                    setActiveNodeId(null);
                    setSelectedNode(null);
                    return;
                  }
                  const graphNode = graphData?.nodes.find((n) => n.id === nodeId);
                  if (graphNode) {
                    handleNodeClick({ id: graphNode.id, label: graphNode.name });
                  }
                }}
                onDoubleClick={(nodeId: string) => {
                  // Double-click: Enter isolate mode
                  setViewMode('isolate');
                  const subgraph = buildIsolatedSubgraph(nodeId, hierarchyDepth);
                  setIsolatedSubgraph(subgraph);
                }}
                focusedNodeId={activeNodeId}
                nodeCategories={nodeCategories}
                hierarchyDepth={hierarchyDepth}
                selectedRootNodeId={selectedCodeReference?.id}
                viewMode={viewMode}
              />
            )
          )}
        </div>

        {/* Desktop Graph Controls */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl bg-background/90 backdrop-blur-sm border-border/60"
                  onClick={() => setShowSidebar(!showSidebar)}
                >
                  {showSidebar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl bg-background/90 backdrop-blur-sm border-border/60"
                  onClick={() =>
                    setVisualizationType(visualizationType === 'reagraph' ? 'sigma' : 'reagraph')
                  }
                >
                  {visualizationType === 'reagraph' ? (
                    <ToggleLeft className="h-4 w-4" />
                  ) : (
                    <ToggleRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Switch to {visualizationType === 'reagraph' ? 'Sigma.js' : 'Reagraph'} Visualization
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Only show isolate mode toggle for Sigma.js */}
          {visualizationType === 'sigma' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'isolate' ? 'secondary' : 'outline'}
                    size="icon"
                    className={`h-8 w-8 rounded-xl backdrop-blur-sm border-border/60 ${
                      viewMode === 'isolate'
                        ? 'bg-primary text-primary-foreground border-primary/50'
                        : 'bg-background/90'
                    }`}
                    onClick={() => {
                      if (viewMode === 'isolate') {
                        setViewMode('highlight');
                        setIsolatedSubgraph(null);
                      } else {
                        setViewMode('isolate');
                      }
                    }}
                  >
                    {viewMode === 'isolate' ? (
                      <Focus className="h-4 w-4" />
                    ) : (
                      <Target className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {viewMode === 'isolate'
                    ? 'Exit Isolate Mode'
                    : 'Enter Isolate Mode (double-click node)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Stats Badge for desktop */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Badge className="bg-background/90 backdrop-blur-sm border-border/60 text-foreground rounded-xl px-3 py-1 text-xs">
            {visualizationType === 'reagraph' && reagraphData
              ? `${reagraphData.nodes.length} nodes • ${reagraphData.edges.length} edges`
              : sigmaData
                ? `${sigmaData.nodes.length}N • ${sigmaData.edges.length}E`
                : '0N • 0E'}
          </Badge>
          {/* Only show mode badge for Sigma.js */}
          {visualizationType === 'sigma' && (
            <Badge
              variant={viewMode === 'isolate' ? 'default' : 'secondary'}
              className={`backdrop-blur-sm border-border/60 rounded-xl px-2 py-1 text-xs ${
                viewMode === 'isolate'
                  ? 'bg-primary text-primary-foreground border-primary/50'
                  : 'bg-background/90'
              }`}
            >
              {viewMode === 'isolate' ? 'Isolate' : 'Highlight'}
            </Badge>
          )}
        </div>
      </div>

      {/* Desktop Sidebar */}
      {showSidebar && (
        <div
          className="hidden lg:flex border-l border-border/30 bg-background/40 backdrop-blur-sm flex-col relative hover:border-l-2 hover:border-primary/20 transition-all duration-200"
          style={{ width: typeof sidebarWidth === 'string' ? sidebarWidth : `${sidebarWidth}px` }}
        >
          {/* Resize Handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize group z-10 flex items-center justify-center"
            onMouseDown={handleMouseDown}
          >
            <div className="w-1 h-8 bg-border/40 rounded-full group-hover:bg-primary/60 transition-colors relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <div className="w-0.5 h-0.5 bg-muted-foreground/40 rounded-full group-hover:bg-primary-foreground/80 transition-colors"></div>
                <div className="w-0.5 h-0.5 bg-muted-foreground/40 rounded-full group-hover:bg-primary-foreground/80 transition-colors"></div>
                <div className="w-0.5 h-0.5 bg-muted-foreground/40 rounded-full group-hover:bg-primary-foreground/80 transition-colors"></div>
              </div>
            </div>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded-md shadow-md whitespace-nowrap">
                Drag to resize
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'overview' | 'analysis' | 'hierarchy')}
            className="flex-1 flex flex-col h-full"
          >
            {/* Desktop Tab Navigation */}
            <div className="p-4 border-b border-border/30 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-3 bg-muted/30 backdrop-blur-sm rounded-xl">
                <TabsTrigger
                  value="overview"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-sm"
                >
                  <Network className="w-4 h-4 mr-1.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="analysis"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-sm"
                >
                  <Code className="w-4 h-4 mr-1.5" />
                  Analysis
                </TabsTrigger>
                <TabsTrigger
                  value="hierarchy"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-sm"
                >
                  <Layers className="w-4 h-4 mr-1.5" />
                  Hierarchy
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Desktop Tab Content */}
            <div className="flex-1 overflow-hidden">
              <TabsContent value="overview" className="h-full m-0 p-0">
                <OverviewTab
                  categoryData={categoryData}
                  nodes={graphData?.nodes || []}
                  onNodeClick={handleSearchNodeClick}
                />
              </TabsContent>

              <TabsContent value="analysis" className="h-full m-0 p-0">
                <div className="h-full" ref={analysisScrollRef}>
                  {selectedCodeReference && analysisGraphData && (
                    <CodeReferenceAnalyzer
                      selectedNode={selectedCodeReference}
                      graphData={analysisGraphData}
                      maxDepth={3}
                      onOpenFile={handleOpenFile}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="hierarchy" className="h-full m-0 p-0">
                <div className="h-full">
                  {selectedCodeReference && analysisGraphData && (
                    <HierarchyTab
                      selectedNode={selectedCodeReference}
                      graphData={analysisGraphData}
                      maxDepth={1}
                      onDepthChange={setHierarchyDepth}
                      onOpenFile={handleOpenFile}
                      onSelectGraphNode={(id) => centerAndHighlightNode(id)}
                      focusedNodeId={activeNodeId || undefined}
                      onToggleFocus={(id) => {
                        if (activeNodeId === id) {
                          setActiveNodeId(null);
                        } else {
                          centerAndHighlightNode(id);
                        }
                      }}
                    />
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
