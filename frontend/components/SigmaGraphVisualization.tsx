'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useResultData } from '@/context/ResultDataContext';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';
import { generateGraphFromGithub, generateGraphFromZip } from '@/utils/api';
import type {
  GraphResponse,
  GraphNode as ApiGraphNode,
  GraphEdge as ApiGraphEdge,
} from '@/api-client/types.gen';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import type { SigmaGraphInnerData } from './SigmaGraphInner';

const SigmaGraphInner = dynamic(() => import('./SigmaGraphInner'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-full">
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <div className="text-center space-y-2">
          <p className="text-xs sm:text-sm font-medium text-foreground">Initializing</p>
          <p className="text-xs text-muted-foreground">Setting up Sigma visualization...</p>
        </div>
      </div>
    </div>
  ),
});

interface GraphNode extends ApiGraphNode {
  line: number;
}

type GraphEdge = ApiGraphEdge;

interface ApiResponse {
  html_url: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SigmaGraphVisualizationProps {
  onError?: (error: string) => void;
  setParentActiveTab?: (tab: string) => void;
}

const apiCache = new Map<string, { data: ApiResponse; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

function isCacheValid(entry: { data: ApiResponse; timestamp: number }) {
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

function transformApiResponse(response: GraphResponse): ApiResponse {
  const transformedNodes: GraphNode[] = response.nodes.map((node) => ({
    ...node,
    line: node.start_line || 0,
  }));
  return {
    html_url: response.html_url ?? '',
    nodes: transformedNodes,
    edges: response.edges,
  };
}

export default function SigmaGraphVisualization({
  onError,
  setParentActiveTab,
}: SigmaGraphVisualizationProps) {
  const {
    sourceType,
    sourceData,
    setSelectedFilePath,
    setSelectedFileLine,
    setCodeViewerSheetOpen,
    selectedFilePath,
    selectedFileLine,
  } = useResultData();
  const { data: session } = useSession();
  const generateGraphFromGithubWithAuth = useApiWithAuth(generateGraphFromGithub);
  const generateGraphFromZipWithAuth = useApiWithAuth(generateGraphFromZip);

  const [graphData, setGraphData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIsClient(true), []);

  const isGitHubSourceData = useCallback(
    (data: unknown): data is { repo_url: string; access_token?: string; branch?: string } =>
      !!data && typeof data === 'object' && 'repo_url' in (data as Record<string, unknown>),
    [],
  );

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

    const cached = apiCache.get(requestKey);
    if (cached && isCacheValid(cached)) {
      setGraphData(cached.data);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        let response: GraphResponse;
        if (sourceType === 'github' && sourceData && isGitHubSourceData(sourceData)) {
          response = await generateGraphFromGithubWithAuth({
            ...sourceData,
            jwt_token: session?.jwt_token || undefined,
          });
        } else if (sourceType === 'zip' && sourceData instanceof File) {
          response = await generateGraphFromZipWithAuth(sourceData, session?.jwt_token || '');
        } else {
          throw new Error('Invalid source type or data');
        }

        if (!cancelled) {
          const transformed = transformApiResponse(response);
          apiCache.set(requestKey, { data: transformed, timestamp: Date.now() });
          setGraphData(transformed);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load graph data';
          setError(msg);
          onError?.(msg);
          setGraphData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    requestKey,
    isClient,
    sourceType,
    sourceData,
    onError,
    generateGraphFromGithubWithAuth,
    generateGraphFromZipWithAuth,
    session?.jwt_token,
    isGitHubSourceData,
  ]);

  // Always compute innerData to respect hooks rules; provide empty arrays when graphData is null
  const innerData: SigmaGraphInnerData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };
    return {
      nodes: graphData.nodes.map((n) => ({ id: n.id, name: n.name, category: n.category })),
      edges: graphData.edges.map((e, idx) => ({
        id: (e as { id?: string }).id ?? `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
      })),
    };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setActiveNodeId(nodeId);
      const node = graphData?.nodes.find((n) => n.id === nodeId);
      if (node && node.file) {
        setSelectedFilePath(node.file);
        setSelectedFileLine(typeof node.start_line === 'number' ? node.start_line : 1);
        setCodeViewerSheetOpen(true);
        setParentActiveTab?.('explorer');
      }
    },
    [
      graphData?.nodes,
      setSelectedFilePath,
      setSelectedFileLine,
      setCodeViewerSheetOpen,
      setParentActiveTab,
    ],
  );

  // Focus node in Sigma when explorer selects a file/line
  useEffect(() => {
    if (!graphData || !selectedFilePath) return;
    const candidates = graphData.nodes.filter((n) => n.file === selectedFilePath);
    if (candidates.length === 0) return;
    let target = candidates[0];
    if (selectedFileLine) {
      target = candidates.reduce((best, cur) => {
        const b = typeof best.start_line === 'number' ? best.start_line : Number.MAX_SAFE_INTEGER;
        const c = typeof cur.start_line === 'number' ? cur.start_line : Number.MAX_SAFE_INTEGER;
        return Math.abs(c - selectedFileLine) < Math.abs(b - selectedFileLine) ? cur : best;
      }, target);
    }
    if (target?.id) setActiveNodeId(target.id);
  }, [graphData, selectedFilePath, selectedFileLine]);

  if (!isClient) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <div className="text-center space-y-2">
            <p className="text-xs sm:text-sm font-medium text-foreground">Initializing</p>
            <p className="text-xs text-muted-foreground">Setting up Sigma visualization...</p>
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
            <p className="text-xs sm:text-sm text-muted-foreground">
              This may take a few moments...
            </p>
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
            onClick={() => window.location.reload()}
            className="rounded-xl text-xs sm:text-sm"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center space-y-4 p-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-muted/50 flex items-center justify-center">
            <Network className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/80" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-medium text-foreground">
              No Graph Data Available
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Graph API returned no nodes.</p>
          </div>
        </div>
      </div>
    );
  }

  if (innerData.nodes.length === 0) return null;

  return (
    <div ref={containerRef} className="relative w-full h-full">

      <SigmaGraphInner
        data={innerData}
        onNodeClick={handleNodeClick}
        focusedNodeId={activeNodeId}
        nodeCategories={{
          modules: {
            color: '#3b82f6',
            icon: () => null,
            label: 'Modules',
            description: 'Module files',
          },
          directory: {
            color: '#f59e0b',
            icon: () => null,
            label: 'Directory',
            description: 'Directory structures',
          },
          class: {
            color: '#10b981',
            icon: () => null,
            label: 'Class',
            description: 'Class definitions',
          },
          function: {
            color: '#8b5cf6',
            icon: () => null,
            label: 'Function',
            description: 'Function definitions',
          },
          variable: {
            color: '#ef4444',
            icon: () => null,
            label: 'Variable',
            description: 'Variable declarations',
          },
          other: {
            color: '#90A4AE',
            icon: () => null,
            label: 'Other',
            description: 'Other elements',
          },
        }}
      />
    </div>
  );
}
