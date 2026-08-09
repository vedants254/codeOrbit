'use client';

import { useMemo, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Filter, BarChart3, FileText, Loader2, AlertCircle, Check } from 'lucide-react';
import { ReferenceFileCard } from './reference-file-card';
import { analyzeReferences } from '../utils/code-analyzer';
import type { CodeReferenceProps } from '../types/code-analysis';

export function CodeReferenceAnalyzer({
  selectedNode,
  graphData,
  maxDepth = 3,
  onOpenFile,
}: CodeReferenceProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'calls' | 'imports' | 'methods'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Analyze references with memoization
  const referenceFiles = useMemo(() => {
    if (!selectedNode || !graphData) return [];

    setIsAnalyzing(true);
    try {
      const results = analyzeReferences(selectedNode, graphData, maxDepth);
      return results;
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedNode, graphData, maxDepth]);

  // Filter references based on active filter and search
  const filteredReferences = useMemo(() => {
    let filtered = referenceFiles;

    // Apply usage type filter
    if (activeFilter !== 'all') {
      filtered = filtered
        .map((file) => ({
          ...file,
          usages: file.usages.filter((usage) => {
            switch (activeFilter) {
              case 'calls':
                return usage.type === 'call' || usage.type === 'constructor';
              case 'imports':
                return usage.type === 'import' || usage.type === 'export';
              case 'methods':
                return usage.type === 'method' || usage.type === 'property';
              default:
                return true;
            }
          }),
        }))
        .filter((file) => file.usages.length > 0);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (file) =>
          file.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          file.relativePath.toLowerCase().includes(searchTerm.toLowerCase()) ||
          file.usages.some(
            (usage) =>
              usage.context.toLowerCase().includes(searchTerm.toLowerCase()) ||
              usage.functionScope?.toLowerCase().includes(searchTerm.toLowerCase()),
          ),
      );
    }

    return filtered;
  }, [referenceFiles, activeFilter, searchTerm]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalFiles = referenceFiles.length;
    const totalUsages = referenceFiles.reduce((sum, file) => sum + file.totalUsages, 0);
    const usageTypes = referenceFiles.reduce(
      (acc, file) => {
        file.usages.forEach((usage) => {
          acc[usage.type] = (acc[usage.type] || 0) + 1;
        });
        return acc;
      },
      {} as Record<string, number>,
    );

    return { totalFiles, totalUsages, usageTypes };
  }, [referenceFiles]);

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, []);

  if (!selectedNode) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 min-h-[200px]">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl bg-muted/30 flex items-center justify-center">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Select a Node</h3>
            <p className="text-xs text-muted-foreground">
              Click on any node in the graph to analyze its code references and usage patterns
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 min-h-[200px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 mx-auto animate-spin text-primary" />
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Analyzing References</h3>
            <p className="text-xs text-muted-foreground">Scanning code for usage patterns...</p>
          </div>
        </div>
      </div>
    );
  }

  if (referenceFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 min-h-[200px]">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl bg-muted/30 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Analyzing Connections</h3>
            <p className="text-xs text-muted-foreground">
              Found{' '}
              {
                graphData.edges.filter(
                  (e) => e.source === selectedNode.id || e.target === selectedNode.id,
                ).length
              }{' '}
              graph connections for{' '}
              <code className="bg-muted px-1 rounded text-xs">{selectedNode.name}</code>
            </p>
            <div className="text-xs text-muted-foreground space-y-1 pt-2">
              <p>
                Connected to:{' '}
                {
                  graphData.edges.filter(
                    (e) => e.source === selectedNode.id || e.target === selectedNode.id,
                  ).length
                }{' '}
                nodes
              </p>
              <p>Node category: {selectedNode.category}</p>
              <p>Has code: {selectedNode.code ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with Stats - Fixed */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-b border-border/20 bg-background/50 backdrop-blur-sm">
        <div className="space-y-2 sm:space-y-3">
          {/* Node Info */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary flex-shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {selectedNode.name}
            </h3>
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full flex-shrink-0"
            >
              {selectedNode.category}
            </Badge>
          </div>

          {/* Statistics */}
          <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground overflow-x-auto">
            <div className="flex items-center gap-1 flex-shrink-0">
              <FileText className="w-3 h-3" />
              <span>{stats.totalFiles} files</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <BarChart3 className="w-3 h-3" />
              <span>{stats.totalUsages} usages</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span>Depth: {maxDepth}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search - Fixed */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-b border-border/20 space-y-2 sm:space-y-3 bg-background/30 backdrop-blur-sm">
        {/* Filter Tabs */}
        <Tabs
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as 'all' | 'calls' | 'imports' | 'methods')}
        >
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-muted/30 h-8 sm:h-9">
            <TabsTrigger value="all" className="text-xs px-1 sm:px-2">
              <span className="hidden sm:inline">All </span>({stats.totalUsages})
            </TabsTrigger>
            <TabsTrigger value="calls" className="text-xs px-1 sm:px-2">
              <span className="hidden sm:inline">Calls </span>({stats.usageTypes.call || 0})
            </TabsTrigger>
            <TabsTrigger value="imports" className="text-xs px-1 sm:px-2">
              <span className="hidden sm:inline">Imports </span>(
              {(stats.usageTypes.import || 0) + (stats.usageTypes.export || 0)})
            </TabsTrigger>
            <TabsTrigger value="methods" className="text-xs px-1 sm:px-2">
              <span className="hidden sm:inline">Methods </span>(
              {(stats.usageTypes.method || 0) + (stats.usageTypes.property || 0)})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search files or usage context..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-xs sm:text-sm bg-background/80 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Reference Files List - Scrollable */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
            {filteredReferences.map((referenceFile, index) => (
              <ReferenceFileCard
                key={`${referenceFile.file}-${index}`}
                referenceFile={referenceFile}
                functionName={selectedNode.name}
                onOpenFile={onOpenFile}
                onCopyCode={handleCopyCode}
              />
            ))}

            {filteredReferences.length === 0 && (searchTerm || activeFilter !== 'all') && (
              <div className="text-center py-6 sm:py-8">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl bg-muted/30 flex items-center justify-center mb-3 sm:mb-4">
                  <Filter className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-2">No matches found</h3>
                <p className="text-xs text-muted-foreground px-4">
                  Try adjusting your filters or search terms
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-xs sm:text-sm h-8"
                  onClick={() => {
                    setSearchTerm('');
                    setActiveFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Copy Success Toast */}
      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm z-50">
          <Check className="w-4 h-4" />
          Code copied to clipboard
        </div>
      )}
    </div>
  );
}
