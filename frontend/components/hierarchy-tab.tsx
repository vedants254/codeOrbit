'use client';

import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Copy } from 'lucide-react';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Code,
  ExternalLink,
  ExpandIcon,
  ShrinkIcon,
  TreePine,
  GitBranch,
  Layers,
  ActivityIcon as Function,
  Variable,
  Package,
  Network,
  Crosshair,
  RotateCw,
  Info,
} from 'lucide-react';
import {
  buildFilteredHierarchyTree,
  toggleNodeExpansion,
  expandToDepth,
  expandAll,
  collapseAll,
  getVisibleNodes,
  getHierarchyStats,
  createDefaultFilter,
} from '@/utils/hierarchy-builder';
import type { 
  HierarchyTabProps, 
  HierarchyNode, 
  HierarchyTree, 
  NodeFilter 
} from '@/types/code-analysis';
import { HierarchyFilters } from '@/components/hierarchy-filters';

// Icon mapping for different node categories
const categoryIcons = {
  function: Function,
  class: Layers,
  method: Code,
  variable: Variable,
  import: Package,
  export: Package,
  file: FileText,
  other: Network,
} as const;

// Color mapping for different node categories
const categoryColors = {
  function: '#F06292',
  class: '#64B5F6',
  method: '#81C784',
  variable: '#FFD54F',
  import: '#BA68C8',
  export: '#FF8A65',
  file: '#90A4AE',
  other: '#A1887F',
} as const;

interface HierarchyNodeComponentProps {
  node: HierarchyNode;
  tree: HierarchyTree;
  onToggleExpansion: (nodeId: string) => void;
  onOpenFile: (filePath: string, line?: number) => void;
  onSelectGraphNode?: (nodeId: string) => void;
  onToggleFocus?: (nodeId: string) => void;
  focusedNodeId?: string;
  level: number;
  hideChildren?: boolean; // New prop to hide children display
}

function HierarchyNodeComponent({
  node,
  tree,
  onToggleExpansion,
  onOpenFile,
  onSelectGraphNode,
  onToggleFocus,
  focusedNodeId,
  level,
  hideChildren = false,
}: HierarchyNodeComponentProps) {
  const [showFullCode, setShowFullCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasChildren = node.children.length > 0;
  const IconComponent =
    categoryIcons[node.category.toLowerCase() as keyof typeof categoryIcons] || Network;
  const nodeColor =
    categoryColors[node.category.toLowerCase() as keyof typeof categoryColors] || '#A1887F';
  const { theme } = useTheme();

  const handleGoToEditor = useCallback(() => {
    onOpenFile(node.file, node.start_line);
  }, [node.file, node.start_line, onOpenFile]);

  const handleCenterInGraph = useCallback(() => {
    onSelectGraphNode?.(node.id);
  }, [node.id, onSelectGraphNode]);

  const formatCode = (code: string, maxLines: number = 3) => {
    if (!code) return { preview: '', hasMore: false, totalLines: 0 };

    // Split into lines and filter out empty lines while preserving indentation
    const lines = code.split('\n').filter((line) => line.trim().length > 0);

    // Find minimum indentation to normalize
    const nonEmptyLines = lines.filter((line) => line.trim());
    const minIndent =
      nonEmptyLines.length > 0
        ? Math.min(...nonEmptyLines.map((line) => line.match(/^\s*/)?.[0].length || 0))
        : 0;

    // Normalize indentation and limit lines
    const normalizedLines = lines.map((line) => line.slice(minIndent));
    const displayLines = normalizedLines.slice(0, maxLines);

    return {
      preview: displayLines.join('\n'),
      hasMore: normalizedLines.length > maxLines,
      totalLines: normalizedLines.length,
    };
  };

  const handleCopy = useCallback(async () => {
    try {
      const textToCopy = showFullCode ? node.code || '' : formatCode(node.code || '').preview;
      await navigator.clipboard.writeText(textToCopy.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }, [node.code, showFullCode]);

  return (
    <div className={`${level > 0 ? 'ml-3 sm:ml-5 border-l border-border/30 pl-2 sm:pl-4 mt-2' : ''} space-y-2 sm:space-y-3 w-full overflow-hidden`}>
      <Collapsible
        open={node.isExpanded}
        onOpenChange={() => hasChildren && onToggleExpansion(node.id)}
      >
        <div className="group relative">
          <div
            className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-200 border
            ${
              focusedNodeId === node.id
                ? 'bg-background/70 border-border/50 ring-primary/40'
                : 'bg-background/50 hover:bg-background/80 border-border/30 hover:border-border/60'
            }`}
          >
            {/* Expansion toggle */}
            <div className="flex-shrink-0 pt-0.5">
              {hasChildren ? (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0 hover:bg-muted/50 rounded-lg"
                  >
                    {node.isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              ) : (
                <div className="h-6 w-6 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-border/40" />
                </div>
              )}
            </div>

            {/* Node content */}
            <div className="flex-1 min-w-0 space-y-1 sm:space-y-2 overflow-hidden">
              {/* Node header */}
              <div className="flex items-center gap-1 sm:gap-2 min-w-0 justify-between">
                <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 overflow-hidden">
                  <div
                    className="w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: nodeColor }}
                  />
                  <IconComponent className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
                      <button
                        onClick={handleCenterInGraph}
                        className="font-medium text-foreground truncate text-left hover:text-primary transition-colors text-sm sm:text-base max-w-full"
                        title={node.name}
                      >
                        {node.name}
                      </button>
                      <Badge
                        variant="outline"
                        className="text-xs px-1 py-0.5 sm:px-2 sm:py-0.5 rounded-full flex-shrink-0 hidden sm:inline-flex"
                      >
                        {node.category}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs px-1 py-0.5 rounded-full flex-shrink-0 sm:hidden"
                      >
                        {node.category.charAt(0).toUpperCase()}
                      </Badge>
                    </div>
                    {/* Relationship and file info */}
                    <div className="flex items-center gap-1 sm:gap-2 text-xs text-muted-foreground mt-1 overflow-hidden">
                      {node.relationship && (
                        <>
                          <span className="flex-shrink-0 hidden sm:inline">
                            {node.relationship}
                            {node.relationship?.startsWith('remapped_') && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="ml-1 px-1 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                      <RotateCw className="h-2 w-2 mr-0.5" />
                                      Smart
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-xs">
                                      This connection was intelligently remapped, skipping filtered nodes to maintain graph connectivity.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </span>
                          <span className="flex-shrink-0 sm:inline hidden">•</span>
                        </>
                      )}
                      <span className="truncate max-w-[120px] sm:max-w-none" title={node.file}>
                        {node.file.split('/').pop()}
                      </span>
                      {node.start_line && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className="flex-shrink-0">L{node.start_line}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={focusedNodeId === node.id ? 'secondary' : 'outline'}
                          size="icon"
                          className="h-6 w-6 sm:h-7 sm:w-7 rounded-md"
                          onClick={() => onToggleFocus?.(node.id)}
                        >
                          <Crosshair className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {focusedNodeId === node.id ? 'Unfocus in graph' : 'Focus in graph'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Code preview (revamped) */}
              {node.code && (
                <div className="bg-muted/30 rounded-lg border border-border/30 overflow-hidden w-full">
                  <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 border-b border-border/30">
                    <span className="text-xs font-medium text-muted-foreground">Code</span>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 sm:h-7 px-1.5 sm:px-2 text-xs rounded-md"
                        onClick={() => setShowFullCode(!showFullCode)}
                      >
                        {showFullCode ? 'Collapse' : 'Expand'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 rounded-md"
                        onClick={handleCopy}
                        title="Copy"
                      >
                        <Copy
                          className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${copied ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                        />
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-32 sm:max-h-56 overflow-auto w-full">
                    <SyntaxHighlighter
                      language={node.file.split('.').pop() || 'tsx'}
                      style={theme === 'dark' ? oneDark : oneLight}
                      customStyle={{
                        margin: 0,
                        padding: '8px 10px',
                        fontSize: '11px',
                        background: 'transparent',
                        width: '100%',
                        maxWidth: '100%',
                        overflow: 'auto',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}
                      wrapLines={true}
                      wrapLongLines={true}
                      showLineNumbers
                      lineNumberStyle={{ opacity: 0.45, fontSize: '9px', minWidth: '20px' }}
                    >
                      {showFullCode
                        ? (node.code || '').trim()
                        : formatCode(node.code || '').preview}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}

              {/* Children count */}
              {hasChildren && (
                <div className="flex items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate">
                    {node.children.length} connected {node.children.length === 1 ? 'node' : 'nodes'}
                  </span>
                </div>
              )}
            </div>

            {/* Go to Editor button */}
            <div className="flex-shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGoToEditor}
                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go to Editor</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && !hideChildren && (
          <CollapsibleContent className="space-y-1 sm:space-y-2 w-full overflow-hidden">
            {node.children.map((child, index) => (
              <HierarchyNodeComponent
                key={`${node.id}-child-${child.id}-${index}`}
                node={child}
                tree={tree}
                onToggleExpansion={onToggleExpansion}
                onOpenFile={onOpenFile}
                onSelectGraphNode={onSelectGraphNode}
                onToggleFocus={onToggleFocus}
                focusedNodeId={focusedNodeId}
                level={level + 1}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

export function HierarchyTab({
  selectedNode,
  graphData,
  maxDepth,
  onDepthChange,
  onOpenFile,
  onSelectGraphNode,
  focusedNodeId,
  onToggleFocus,
}: HierarchyTabProps) {
  const [currentDepth, setCurrentDepth] = useState(maxDepth);
  const [filter, setFilter] = useState<NodeFilter>(() => createDefaultFilter());
  const [showFilters, setShowFilters] = useState(false);

  // Build hierarchy tree with filtering
  const hierarchyTree = useMemo(() => {
    return buildFilteredHierarchyTree(selectedNode, graphData, currentDepth, filter);
  }, [selectedNode, graphData, currentDepth, filter]);

  const [tree, setTree] = useState<HierarchyTree>(hierarchyTree);

  // Update tree when hierarchy changes
  useMemo(() => {
    setTree(hierarchyTree);
  }, [hierarchyTree]);

  const stats = useMemo(() => getHierarchyStats(tree), [tree]);
  const visibleNodes = useMemo(() => getVisibleNodes(tree), [tree]);

  const handleDepthChange = useCallback(
    (value: number[]) => {
      const newDepth = value[0];
      setCurrentDepth(newDepth);
      onDepthChange(newDepth);
    },
    [onDepthChange],
  );

  const handleToggleExpansion = useCallback((nodeId: string) => {
    setTree((prevTree) => toggleNodeExpansion(prevTree, nodeId));
  }, []);

  const handleExpandAll = useCallback(() => {
    setTree((prevTree) => expandAll(prevTree));
  }, []);

  const handleCollapseAll = useCallback(() => {
    setTree((prevTree) => collapseAll(prevTree));
  }, []);

  const handleExpandToDepth = useCallback(
    (depth: number) => {
      setTree((prevTree) => expandToDepth(prevTree, depth));
      setCurrentDepth(depth);
      onDepthChange(depth);
    },
    [onDepthChange],
  );

  if (!selectedNode) {
    return (
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-8 min-h-[200px] w-full overflow-hidden">
        <div className="text-center space-y-3 sm:space-y-4 max-w-[250px] sm:max-w-xs w-full">
          <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 mx-auto rounded-xl bg-muted/30 flex items-center justify-center">
            <TreePine className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-sm font-medium text-foreground">Select a Node</h3>
            <p className="text-xs text-muted-foreground px-2 sm:px-0">
              Click on any node in the graph to view its hierarchical relationships
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">
      {/* Filter Controls */}
      <div className="flex-shrink-0">
        <HierarchyFilters
          graphData={graphData}
          filter={filter}
          onFilterChange={setFilter}
          filterStats={hierarchyTree.filterStats}
          isCollapsed={!showFilters}
          onToggleCollapse={() => setShowFilters(!showFilters)}
        />
      </div>
      
      {/* Header with Controls - Fixed */}
      <div className="flex-shrink-0 p-2 sm:p-3 lg:p-4 border-b border-border/20 bg-background/50 backdrop-blur-sm space-y-3 sm:space-y-4 overflow-hidden">
        {/* Node Info and Stats */}
        <div className="space-y-1 sm:space-y-2 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 lg:w-3 lg:h-3 rounded-full bg-primary flex-shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[60%]" title={selectedNode.name}>
              {selectedNode.name}
            </h3>
            <Badge
              variant="outline"
              className="text-xs px-1 py-0.5 sm:px-1.5 sm:py-0.5 lg:px-2 lg:py-1 rounded-full flex-shrink-0 hidden sm:inline-flex"
            >
              {selectedNode.category}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs px-1 py-0.5 rounded-full flex-shrink-0 sm:hidden"
            >
              {selectedNode.category.charAt(0).toUpperCase()}
            </Badge>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 text-xs text-muted-foreground overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 flex-shrink-0">
              <TreePine className="w-3 h-3" />
              <span>{stats.totalNodes} nodes</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <GitBranch className="w-3 h-3" />
              <span>{visibleNodes.length} visible</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Layers className="w-3 h-3" />
              <span>Depth: {stats.maxDepth}</span>
            </div>
            {hierarchyTree.filterStats && hierarchyTree.filterStats.remappedConnections > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <RotateCw className="w-3 h-3 text-orange-500" />
                <span className="text-orange-700 dark:text-orange-300">
                  {hierarchyTree.filterStats.remappedConnections} remapped
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Depth Control */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm font-medium text-foreground">
              Hierarchy Depth
            </label>
            <span className="text-xs text-muted-foreground">
              {currentDepth} level{currentDepth !== 1 ? 's' : ''}
            </span>
          </div>
          <Slider
            value={[currentDepth]}
            onValueChange={handleDepthChange}
            min={1}
            max={5}
            step={1}
            className="w-full"
          />
        </div>

        {/* Tree Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="flex-1 text-xs h-7 sm:h-8 rounded-lg min-w-0"
          >
            <ExpandIcon className="w-3 h-3 mr-1 sm:mr-1.5" />
            <span className="truncate">Expand All</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="flex-1 text-xs h-7 sm:h-8 rounded-lg min-w-0"
          >
            <ShrinkIcon className="w-3 h-3 mr-1 sm:mr-1.5" />
            <span className="truncate">Collapse All</span>
          </Button>
        </div>

        {/* Quick Depth Buttons */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
          <span className="text-xs text-muted-foreground flex-shrink-0">Quick:</span>
          {[1, 2, 3, 4, 5].map((depth) => (
            <Button
              key={depth}
              variant={currentDepth >= depth ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleExpandToDepth(depth)}
              className="h-6 w-6 p-0 text-xs rounded-md flex-shrink-0"
            >
              {depth}
            </Button>
          ))}
        </div>
      </div>

      {/* Hierarchy Tree - Scrollable */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-2 sm:p-3 lg:p-4 space-y-3 sm:space-y-4 w-full">
            {tree.totalNodes > 0 ? (
              <>
                {/* Current Node - Always on Top */}
                <div className="space-y-2 sm:space-y-3 w-full overflow-hidden">
                  <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                    <div className="w-1 h-3 sm:h-4 bg-primary rounded-full" />
                    <h4 className="text-sm font-semibold text-foreground">Current Node</h4>
                  </div>
                  <HierarchyNodeComponent
                    node={tree.rootNode}
                    tree={tree}
                    onToggleExpansion={handleToggleExpansion}
                    onOpenFile={onOpenFile}
                    onSelectGraphNode={onSelectGraphNode}
                    onToggleFocus={onToggleFocus}
                    focusedNodeId={focusedNodeId}
                    level={0}
                    hideChildren={true}
                  />
                </div>

                {/* Parents Section - Collapsible */}
                {tree.rootNode.parents && tree.rootNode.parents.length > 0 && (
                  <Collapsible defaultOpen={true} className="w-full overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between text-sm font-medium p-2 sm:p-3 h-auto overflow-hidden"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
                          <div className="w-1 h-3 sm:h-4 bg-orange-500 rounded-full flex-shrink-0" />
                          <span className="truncate">Called By (Parents)</span>
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {tree.rootNode.parents.length}
                          </Badge>
                        </div>
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 sm:pt-3 w-full overflow-hidden">
                      <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                        {tree.rootNode.parents.map((parent, index) => (
                          <HierarchyNodeComponent
                            key={`parent-${parent.id}-${index}`}
                            node={parent}
                            tree={tree}
                            onToggleExpansion={handleToggleExpansion}
                            onOpenFile={onOpenFile}
                            onSelectGraphNode={onSelectGraphNode}
                            onToggleFocus={onToggleFocus}
                            focusedNodeId={focusedNodeId}
                            level={0}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Children Section - Collapsible */}
                {tree.rootNode.children && tree.rootNode.children.length > 0 && (
                  <Collapsible defaultOpen={true} className="w-full overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between text-sm font-medium p-2 sm:p-3 h-auto overflow-hidden"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
                          <div className="w-1 h-3 sm:h-4 bg-green-500 rounded-full flex-shrink-0" />
                          <span className="truncate">Calls (Children)</span>
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {tree.rootNode.children.length}
                          </Badge>
                        </div>
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 sm:pt-3 w-full overflow-hidden">
                      <div className="space-y-1 sm:space-y-2 w-full overflow-hidden">
                        {tree.rootNode.children.map((child, index) => (
                          <HierarchyNodeComponent
                            key={`child-${child.id}-${index}`}
                            node={child}
                            tree={tree}
                            onToggleExpansion={handleToggleExpansion}
                            onOpenFile={onOpenFile}
                            onSelectGraphNode={onSelectGraphNode}
                            onToggleFocus={onToggleFocus}
                            focusedNodeId={focusedNodeId}
                            level={1}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Smart Remapping Info Section */}
                {hierarchyTree.filterStats && hierarchyTree.remappedConnections && hierarchyTree.remappedConnections.length > 0 && (
                  <Collapsible defaultOpen={false} className="w-full overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between text-sm font-medium p-2 sm:p-3 h-auto overflow-hidden bg-orange-50/30 dark:bg-orange-950/20 border-orange-200/50 dark:border-orange-800/50"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
                          <div className="w-1 h-3 sm:h-4 bg-orange-500 rounded-full flex-shrink-0" />
                          <RotateCw className="h-3 w-3 text-orange-500" />
                          <span className="truncate text-orange-700 dark:text-orange-300">Smart Connections</span>
                          <Badge 
                            variant="secondary" 
                            className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                          >
                            {hierarchyTree.remappedConnections.length}
                          </Badge>
                        </div>
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-orange-500" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 sm:pt-3 w-full overflow-hidden">
                      <div className="space-y-2 p-3 bg-orange-50/20 dark:bg-orange-950/10 rounded-lg border border-orange-200/30 dark:border-orange-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Info className="h-4 w-4 text-orange-500" />
                          <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            Intelligently Remapped Connections
                          </span>
                        </div>
                        <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
                          These connections skip over filtered nodes to maintain graph connectivity. 
                          For example: A → (filtered) → B becomes A → B.
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {hierarchyTree.remappedConnections.slice(0, 5).map((connection, index) => (
                            <div 
                              key={index} 
                              className="text-xs p-2 bg-background/60 rounded border border-border/30"
                            >
                              <div className="font-medium text-foreground mb-1">
                                {graphData.nodes.find(n => n.id === connection.remappedSource)?.name} →{' '}
                                {graphData.nodes.find(n => n.id === connection.remappedTarget)?.name}
                              </div>
                              <div className="text-muted-foreground">
                                Skipped {connection.skippedNodes.length} filtered node{connection.skippedNodes.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          ))}
                          {hierarchyTree.remappedConnections.length > 5 && (
                            <div className="text-xs text-center text-muted-foreground py-1">
                              ... and {hierarchyTree.remappedConnections.length - 5} more
                            </div>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            ) : (
              <div className="text-center py-4 sm:py-6 lg:py-8 w-full">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 mx-auto rounded-xl bg-muted/30 flex items-center justify-center mb-2 sm:mb-3 lg:mb-4">
                  <TreePine className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-muted-foreground/50" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1 sm:mb-2">No Hierarchy Available</h3>
                <p className="text-xs text-muted-foreground px-2 sm:px-4">
                  This node doesn&apos;t have any connected relationships in the graph
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
