'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
  useCamera,
} from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import { MultiDirectedGraph } from 'graphology';
import { useLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';
import { useLayoutForce } from '@react-sigma/layout-force';
import { useLayoutNoverlap } from '@react-sigma/layout-noverlap';
import { useLayoutCircular } from '@react-sigma/layout-circular';
import { useLayoutRandom } from '@react-sigma/layout-random';
import { animateNodes } from 'sigma/utils';
import { EdgeArrowProgram, NodeCircleProgram } from 'sigma/rendering';
import { EdgeCurvedArrowProgram, createEdgeCurveProgram } from '@sigma/edge-curve';
import SigmaShareButton from '@/components/SigmaShareButton';
// Layout control imports commented out for now
/* 
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
*/
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  // LayoutGrid,
  Shuffle,
  RotateCw,
  // Zap,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Focus,
  // Pause,
} from 'lucide-react';

type InnerNode = { id: string; name: string; category?: string };
type InnerEdge = { id?: string; source: string; target: string };

export interface SigmaGraphInnerData {
  nodes: InnerNode[];
  edges: InnerEdge[];
}

interface NodeCategories {
  [key: string]: {
    color: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
  };
}

// Use the same color mapping system as ReagraphVisualization
function getColorForCategory(category?: string, nodeCategories?: NodeCategories): string {
  if (!category || !nodeCategories) return '#90A4AE';
  const key = category.toLowerCase();
  return nodeCategories[key]?.color || nodeCategories['other']?.color || '#90A4AE';
}

// Get a lighter version of a color for hover states
function getLighterColor(color: string): string {
  // Convert hex to RGB and lighten
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Lighten by increasing RGB values
  const lighten = (c: number) => Math.min(255, Math.floor(c + (255 - c) * 0.3));

  const newR = lighten(r).toString(16).padStart(2, '0');
  const newG = lighten(g).toString(16).padStart(2, '0');
  const newB = lighten(b).toString(16).padStart(2, '0');

  return `#${newR}${newG}${newB}`;
}

// Get connected nodes for a given node
function getConnectedNodes(graph: MultiDirectedGraph, nodeId: string): Set<string> {
  const connected = new Set<string>();
  try {
    // Add neighbors (both in and out)
    graph.forEachNeighbor(nodeId, (neighbor) => {
      connected.add(neighbor);
    });
  } catch {
    // Node might not exist
  }
  return connected;
}

// Calculate node depths from a root node using BFS
function calculateNodeDepths(
  graph: MultiDirectedGraph,
  rootNodeId: string,
  maxDepth: number,
): Map<string, number> {
  const depths = new Map<string, number>();
  if (!rootNodeId || !graph.hasNode(rootNodeId)) return depths;

  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    if (visited.has(nodeId) || depth > maxDepth) continue;
    visited.add(nodeId);
    depths.set(nodeId, depth);

    // Add all neighbors to queue with increased depth
    try {
      graph.forEachNeighbor(nodeId, (neighborId) => {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      });
    } catch {
      // Node might not exist
    }
  }

  return depths;
}

// Get nodes within hierarchical depth for isolate mode
function getNodesWithinDepth(
  graph: MultiDirectedGraph,
  rootNodeId: string,
  maxDepth: number,
): Set<string> {
  const nodesInDepth = new Set<string>();
  if (!rootNodeId || !graph.hasNode(rootNodeId)) return nodesInDepth;

  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    if (visited.has(nodeId) || depth > maxDepth) continue;
    visited.add(nodeId);
    nodesInDepth.add(nodeId);

    // Add all neighbors to queue with increased depth
    try {
      graph.forEachNeighbor(nodeId, (neighborId) => {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      });
    } catch {
      // Node might not exist
    }
  }

  return nodesInDepth;
}

const sigmaContainerStyle: React.CSSProperties = {
  height: '100%',
  width: '100%',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)',
};

// Enhanced Sigma settings with better spacing and visibility
const enhancedSigmaSettings = {
  allowInvalidContainer: true,
  renderLabels: true,
  renderEdgeLabels: false,
  nodeProgramClasses: {
    circle: NodeCircleProgram,
  },
  edgeProgramClasses: {
    arrow: EdgeArrowProgram,
    curvedArrow: EdgeCurvedArrowProgram,
    curvedNoArrow: createEdgeCurveProgram(),
  },
  labelFont: 'Arial, sans-serif',
  labelSize: 11, // Slightly smaller to reduce overlap
  labelWeight: '500',
  labelColor: { color: '#374151' },
  labelGridCellSize: 80, // Increased for better label spacing
  labelRenderedSizeThreshold: 8, // Lower threshold to show more labels
  labelDensity: 0.8, // Reduce label density to prevent overlap
  edgeLabelFont: 'Arial, sans-serif',
  edgeLabelSize: 9,
  edgeLabelColor: { color: '#6b7280' },
  minCameraRatio: 0.03, // Allow more zoom out to see spread
  maxCameraRatio: 12,
  enableEdgeEvents: true,
  hideEdgesOnMove: true,
  hideLabelsOnMove: false,
  zIndex: true,
  // Performance optimizations for better rendering
  itemSizesReference: 'positions' as const,
  touchAction: 'none',
};

// Node dragging component
function GraphEvents({ enableNodeDrag = true }: { enableNodeDrag?: boolean }) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  useEffect(() => {
    if (!enableNodeDrag) return;

    registerEvents({
      downNode: (e) => {
        setDraggedNode(e.node);
        sigma.getGraph().setNodeAttribute(e.node, 'highlighted', true);
      },
      mousemovebody: (e) => {
        if (!draggedNode) return;
        const pos = sigma.viewportToGraph(e);
        sigma.getGraph().setNodeAttribute(draggedNode, 'x', pos.x);
        sigma.getGraph().setNodeAttribute(draggedNode, 'y', pos.y);
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      },
      mouseup: () => {
        if (draggedNode) {
          setDraggedNode(null);
          sigma.getGraph().removeNodeAttribute(draggedNode, 'highlighted');
        }
      },
      mousedown: (e) => {
        const mouseEvent = e.original as MouseEvent;
        if (mouseEvent.buttons !== 0 && !sigma.getCustomBBox()) {
          sigma.setCustomBBox(sigma.getBBox());
        }
      },
    });
  }, [registerEvents, sigma, draggedNode, enableNodeDrag]);

  return null;
}

function LoadGraph({
  data,
  onNodeClick,
  focusedNodeId,
  nodeCategories,
  hierarchyDepth,
  selectedRootNodeId,
  viewMode = 'highlight',
  onDoubleClick,
  setIsInitialLayoutComplete,
  setApplyLayoutRef,
}: {
  data: SigmaGraphInnerData;
  onNodeClick?: (nodeId: string) => void;
  focusedNodeId?: string | null;
  nodeCategories?: NodeCategories;
  hierarchyDepth?: number;
  selectedRootNodeId?: string;
  viewMode?: 'highlight' | 'isolate';
  onDoubleClick?: (nodeId: string) => void;
  setIsInitialLayoutComplete: (complete: boolean) => void;
  setApplyLayoutRef: (fn: ((layoutType: string, animate?: boolean) => void) | null) => void;
}) {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const [connectedNodes, setConnectedNodes] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [nodeDepths, setNodeDepths] = useState<Map<string, number>>(new Map());
  const [isolateNodes, setIsolateNodes] = useState<Set<string>>(new Set());
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickNode, setLastClickNode] = useState<string | null>(null);

  // Enhanced layout hooks with balanced spacing
  const layoutForceAtlas2 = useLayoutForceAtlas2({
    iterations: 300,
    settings: {
      // Balanced settings for good spacing without over-spreading
      linLogMode: false,
      outboundAttractionDistribution: true,
      adjustSizes: false,
      edgeWeightInfluence: 0,
      scalingRatio: 2.5, // Reduced from 4 for less spreading
      strongGravityMode: false,
      gravity: 1, // Increased to bring nodes closer
      slowDown: 5,
      barnesHutOptimize: true,
      barnesHutTheta: 0.8,
    },
  });
  const layoutForce = useLayoutForce({
    maxIterations: 100,
    settings: {
      attraction: 0.0003, // Increased attraction to bring nodes closer
      repulsion: 0.03, // Reduced repulsion for less spreading
      gravity: 0.02, // Increased gravity for more compactness
      inertia: 0.3,
      maxMove: 120, // Reduced max movement
    },
  });
  const layoutNoverlap = useLayoutNoverlap({
    maxIterations: 120, // Reduced iterations
    settings: {
      margin: 8, // Reduced margin for closer nodes
      expansion: 1.15, // Less expansion
      gridSize: 1,
      ratio: 1.1, // Reduced ratio
      speed: 3,
    },
  });
  const layoutCircular = useLayoutCircular();
  const layoutRandom = useLayoutRandom();

  // Stable layout application function (not recreated on every render)
  const applyLayoutStable = useCallback(
    (layoutType: string, animate = true) => {
      const graph = sigma.getGraph();
      if (!graph || graph.order === 0) return;

      try {
        let positions: Record<string, { x: number; y: number }> = {};

        switch (layoutType) {
          case 'forceatlas2':
            positions = layoutForceAtlas2.positions() as Record<string, { x: number; y: number }>;
            break;
          case 'force':
            positions = layoutForce.positions() as Record<string, { x: number; y: number }>;
            break;
          case 'noverlap':
            positions = layoutNoverlap.positions() as Record<string, { x: number; y: number }>;
            break;
          case 'circular':
            positions = layoutCircular.positions() as Record<string, { x: number; y: number }>;
            break;
          case 'random':
            positions = layoutRandom.positions() as Record<string, { x: number; y: number }>;
            break;
          case 'grid':
            const nodeCount = graph.order;
            const cols = Math.ceil(Math.sqrt(nodeCount));
            const spacing = 80;
            positions = {};
            let idx = 0;
            graph.forEachNode((nodeId) => {
              const row = Math.floor(idx / cols);
              const col = idx % cols;
              positions[nodeId] = {
                x: col * spacing - (cols * spacing) / 2,
                y: row * spacing - (Math.ceil(nodeCount / cols) * spacing) / 2,
              };
              idx++;
            });
            break;
          default:
            console.warn('Unknown layout type:', layoutType);
            return;
        }

        if (animate && Object.keys(positions).length > 0) {
          animateNodes(graph, positions, { duration: 400 });
        } else if (Object.keys(positions).length > 0) {
          graph.forEachNode((node) => {
            if (positions[node]) {
              graph.setNodeAttribute(node, 'x', positions[node].x);
              graph.setNodeAttribute(node, 'y', positions[node].y);
            }
          });
          sigma.refresh();
        }
      } catch (error) {
        console.error('Layout failed:', error);
      }
    },
    [sigma],
  );

  // Expose layout function to parent component
  useEffect(() => {
    setApplyLayoutRef(() => applyLayoutStable);
    return () => setApplyLayoutRef(null);
  }, [applyLayoutStable, setApplyLayoutRef]);

  // Update node appearance based on states (optimized to prevent constant refreshing)
  const updateNodeAppearance = useCallback(
    (graph: MultiDirectedGraph) => {
      graph.forEachNode((nodeId) => {
        const nodeData = data.nodes.find((n) => n.id === nodeId);
        const originalColor = getColorForCategory(nodeData?.category, nodeCategories);
        const baseSize = graph.getNodeAttribute(nodeId, 'originalSize') || 8;
        const nodeDepth = nodeDepths.get(nodeId);

        let size = baseSize;
        let color = originalColor;
        let borderColor = 'transparent';
        let borderSize = 0;
        let hidden = false;

        // Isolate mode: show only nodes within depth from selected root
        if (viewMode === 'isolate' && selectedRootNodeId && hierarchyDepth !== undefined) {
          if (!isolateNodes.has(nodeId)) {
            hidden = true;
          } else if (nodeId === selectedRootNodeId) {
            // Root node - special highlighting
            size = baseSize * 1.6;
            borderColor = '#8b5cf6';
            borderSize = 4;
            color = getLighterColor(originalColor);
          } else if (nodeDepth !== undefined && nodeDepth <= hierarchyDepth) {
            // Within hierarchy depth - highlight based on depth level
            const depthIntensity = 1 - (nodeDepth / hierarchyDepth) * 0.4;
            size = baseSize * (1 + depthIntensity * 0.3);
            borderColor = '#8b5cf6';
            borderSize = Math.max(1, 3 - nodeDepth);
            color = getLighterColor(originalColor);
          }
        }
        // Highlight mode (original behavior)
        else if (viewMode === 'highlight') {
          // Hierarchy depth highlighting (takes precedence when enabled)
          if (selectedRootNodeId && hierarchyDepth && nodeDepth !== undefined) {
            if (nodeId === selectedRootNodeId) {
              // Root node - special highlighting
              size = baseSize * 1.6;
              borderColor = '#8b5cf6'; // Purple border for root
              borderSize = 4;
              color = getLighterColor(originalColor);
            } else if (nodeDepth <= hierarchyDepth) {
              // Within hierarchy depth - highlight based on depth level
              const depthIntensity = 1 - (nodeDepth / hierarchyDepth) * 0.4; // Fade based on depth
              size = baseSize * (1 + depthIntensity * 0.3);
              borderColor = '#8b5cf6';
              borderSize = Math.max(1, 3 - nodeDepth);
              color = getLighterColor(originalColor);
            } else {
              // Outside hierarchy depth - dim significantly
              color = originalColor + '30';
            }
          }
          // Focus state (only if hierarchy is not active)
          else if (nodeId === focusedNodeId) {
            size = baseSize * 1.8;
            borderColor = '#6b7280';
            borderSize = 3;
            color = getLighterColor(originalColor);
          }
          // Connected to focused node
          else if (focusedNodeId && connectedNodes.has(nodeId)) {
            size = baseSize * 1.1;
            color = getLighterColor(originalColor);
          }
          // Hover state (only if not focused and no hierarchy)
          else if (!focusedNodeId && !selectedRootNodeId && nodeId === hoveredNode) {
            size = baseSize * 1.2;
            color = getLighterColor(originalColor);
          }
          // Connected to hovered node
          else if (
            !focusedNodeId &&
            !selectedRootNodeId &&
            hoveredNode &&
            connectedNodes.has(nodeId)
          ) {
            color = getLighterColor(originalColor);
          }
          // Dimmed state
          else if (
            (focusedNodeId && !connectedNodes.has(nodeId) && nodeId !== focusedNodeId) ||
            (!focusedNodeId &&
              !selectedRootNodeId &&
              hoveredNode &&
              !connectedNodes.has(nodeId) &&
              nodeId !== hoveredNode)
          ) {
            color = originalColor + '60';
          }
        }

        graph.mergeNodeAttributes(nodeId, {
          size,
          color,
          borderColor,
          borderSize,
          hidden,
        });

        // For isolated nodes, ensure they have proper positions (only on first switch)
        if (
          viewMode === 'isolate' &&
          !hidden &&
          isolateNodes.has(nodeId) &&
          !layoutAppliedRef.current
        ) {
          const currentX = graph.getNodeAttribute(nodeId, 'x');
          const currentY = graph.getNodeAttribute(nodeId, 'y');

          // If node is at origin or has invalid position, give it a random position
          if (!currentX || !currentY || (Math.abs(currentX) < 0.1 && Math.abs(currentY) < 0.1)) {
            graph.setNodeAttribute(nodeId, 'x', (Math.random() - 0.5) * 100);
            graph.setNodeAttribute(nodeId, 'y', (Math.random() - 0.5) * 100);
          }
        }
      });

      // Update edges
      graph.forEachEdge((edgeId, _attributes, source, target) => {
        let color = '#e5e7eb';
        let size = 0.8;
        let hidden = false;

        // Isolate mode: hide edges not connecting nodes within depth
        if (viewMode === 'isolate' && selectedRootNodeId && hierarchyDepth !== undefined) {
          if (!isolateNodes.has(source) || !isolateNodes.has(target)) {
            hidden = true;
          } else {
            const sourceDepth = nodeDepths.get(source);
            const targetDepth = nodeDepths.get(target);

            if (
              sourceDepth !== undefined &&
              targetDepth !== undefined &&
              sourceDepth <= hierarchyDepth &&
              targetDepth <= hierarchyDepth
            ) {
              color = '#000000';
              size = 1.2;
            }
          }
        }
        // Highlight mode (original behavior)
        else if (viewMode === 'highlight') {
          // Hierarchy depth edge highlighting (takes precedence)
          if (selectedRootNodeId && hierarchyDepth) {
            const sourceDepth = nodeDepths.get(source);
            const targetDepth = nodeDepths.get(target);

            if (
              sourceDepth !== undefined &&
              targetDepth !== undefined &&
              sourceDepth <= hierarchyDepth &&
              targetDepth <= hierarchyDepth
            ) {
              // Both nodes are within hierarchy depth - highlight edge
              color = '#000000'; // Black edges for hierarchy
              size = 1.2;
            } else {
              // Edge connects to nodes outside hierarchy depth - dim it
              color = '#e5e7eb30';
              size = 0.6;
            }
          }
          // Regular focus/hover highlighting (only if no hierarchy)
          else {
            const activeNode = focusedNodeId || hoveredNode;
            if (activeNode && (source === activeNode || target === activeNode)) {
              color = '#9ca3af';
              size = 1.5;
            } else if (activeNode && !connectedNodes.has(source) && !connectedNodes.has(target)) {
              color = '#e5e7eb50';
            }
          }
        }

        graph.mergeEdgeAttributes(edgeId, { color, size, hidden });
      });
    },
    [
      data.nodes,
      connectedNodes,
      focusedNodeId,
      hoveredNode,
      nodeCategories,
      nodeDepths,
      selectedRootNodeId,
      hierarchyDepth,
      viewMode,
      isolateNodes,
    ],
  );

  useEffect(() => {
    const graph = new MultiDirectedGraph();
    const currentNodeCount = data.nodes.length;

    // Enhanced node sizing based on graph size and connectivity
    // const minNodeSize = currentNodeCount > 1000 ? 16 : currentNodeCount > 500 ? 12 : 16; // 16 is the minimum size for the nodes
    // const maxNodeSize = currentNodeCount > 1000 ? 16 : currentNodeCount > 500 ? 28 : 36; // 36 is the maximum size for the nodes
    const minNodeSize = 12;
    const maxNodeSize = 12;

    // Calculate node degrees for size scaling
    const nodeDegrees = new Map<string, number>();
    for (const edge of data.edges) {
      nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
      nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
    }

    const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1);
    const minDegree = 1;
    const degreeRange = maxDegree - minDegree || 1;
    const sizeScale = maxNodeSize - minNodeSize;

    // Add nodes with enhanced styling and degree-based sizing
    for (const node of data.nodes) {
      const degree = nodeDegrees.get(node.id) || 1;
      // Use square root scaling for more pronounced size differences
      const normalizedDegree = (degree - minDegree) / degreeRange;
      const baseSize = Math.round(
        minNodeSize + sizeScale * Math.pow(normalizedDegree, 0.6), // Slightly more aggressive scaling
      );
      const baseColor = getColorForCategory(node.category, nodeCategories);

      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          label: node.name,
          size: baseSize,
          originalSize: baseSize,
          color: baseColor,
          originalColor: baseColor,
          degree: degree,
          type: 'circle',
          x: (Math.random() - 0.5) * 300, // Moderate initial spread
          y: (Math.random() - 0.5) * 300, // Moderate initial spread
        });
      }
    }

    // Performance optimized edge sizing
    const minEdgeSize = currentNodeCount > 1000 ? 0.5 : 0.8;

    // Add edges with enhanced styling and performance optimizations
    for (const edge of data.edges) {
      try {
        const edgeAttributes = {
          color: '#e5e7eb',
          size: minEdgeSize,
          type: 'curvedNoArrow' as const,
          originalWeight: 1,
        };

        if (edge.id) {
          graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, edgeAttributes);
        } else {
          graph.addDirectedEdge(edge.source, edge.target, edgeAttributes);
        }
      } catch {
        // Ignore duplicate/invalid edge errors if any
      }
    }

    // Load graph first, then apply initial layout with a delay to ensure stability
    loadGraph(graph);

    // Apply multi-stage layout for better node distribution
    setTimeout(() => {
      // First: Apply ForceAtlas2 for overall structure
      applyLayoutStable('forceatlas2', false);

      // Second: Apply NoOverlap to prevent node clustering
      setTimeout(() => {
        applyLayoutStable('noverlap', false);

        // Mark layout as complete after both layouts settle
        setTimeout(() => {
          setIsInitialLayoutComplete(true);
        }, 300);
      }, 200); // Wait for ForceAtlas2 to settle
    }, 50); // Brief delay to ensure graph is loaded
  }, [data, loadGraph, nodeCategories, applyLayoutStable]); // Include applyLayoutStable dependency

  // Skip layout recalculation when currentLayout changes since we always use ForceAtlas2
  // This prevents unnecessary layout refreshes when user clicks layout buttons

  // Calculate node depths when hierarchy parameters change
  useEffect(() => {
    if (!selectedRootNodeId || !hierarchyDepth) {
      setNodeDepths(new Map());
      return;
    }

    const graph = sigma.getGraph();
    if (!graph || graph.order === 0) return;

    const depths = calculateNodeDepths(graph, selectedRootNodeId, hierarchyDepth);
    setNodeDepths(depths);
  }, [selectedRootNodeId, hierarchyDepth, sigma, data]);

  // Calculate isolate nodes when isolate mode parameters change
  useEffect(() => {
    if (viewMode !== 'isolate' || !selectedRootNodeId || hierarchyDepth === undefined) {
      setIsolateNodes(new Set());
      return;
    }

    const graph = sigma.getGraph();
    if (!graph || graph.order === 0) return;

    const isolateNodeSet = getNodesWithinDepth(graph, selectedRootNodeId, hierarchyDepth);
    setIsolateNodes(isolateNodeSet);
  }, [viewMode, selectedRootNodeId, hierarchyDepth, sigma, data, applyLayoutStable]);

  // Track previous view mode to detect actual changes
  const prevViewModeRef = useRef<string>(viewMode);
  const layoutAppliedRef = useRef<boolean>(false);
  const layoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle layout recalculation when view mode changes
  useEffect(() => {
    const graph = sigma.getGraph();
    if (!graph || graph.order === 0) return;

    // Only apply layout if view mode actually changed
    if (prevViewModeRef.current === viewMode && layoutAppliedRef.current) {
      return;
    }

    prevViewModeRef.current = viewMode;
    layoutAppliedRef.current = false;

    // Clear any existing layout timeout
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current);
    }

    // Add delay to ensure visibility changes are applied first
    layoutTimeoutRef.current = setTimeout(() => {
      // Only recalculate layout when switching modes, not on every update
      if (!layoutAppliedRef.current) {
        applyLayoutStable('forceatlas2', true);
        layoutAppliedRef.current = true;

        // For isolate mode, also ensure proper camera positioning
        if (viewMode === 'isolate' && selectedRootNodeId) {
          setTimeout(() => {
            try {
              const display = sigma.getNodeDisplayData(selectedRootNodeId);
              if (display) {
                sigma.getCamera().animate(
                  {
                    x: display.x,
                    y: display.y,
                    ratio: 0.8, // Zoom in a bit for isolate mode
                  },
                  { duration: 500 },
                );
              }
            } catch {
              // Fallback: center the camera
              sigma.getCamera().animate({ x: 0.5, y: 0.5, ratio: 0.8 }, { duration: 500 });
            }
          }, 400);
        } else if (viewMode === 'highlight') {
          // Reset camera when exiting isolate mode
          setTimeout(() => {
            sigma.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1.1 }, { duration: 500 });
          }, 400);
        }
      }
    }, 200);

    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
      }
    };
  }, [viewMode, selectedRootNodeId, sigma, applyLayoutStable]);

  // Update connected nodes when focus changes (for hierarchy tab integration) - debounced
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (focusedNodeId) {
        const graph = sigma.getGraph();
        if (graph) {
          setConnectedNodes(getConnectedNodes(graph, focusedNodeId));
        }
      } else {
        setConnectedNodes(new Set());
      }
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [focusedNodeId, sigma]);

  // Update appearance when focus/hover changes (debounced to prevent excessive refreshing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const graph = sigma.getGraph();
      if (graph && graph.order > 0) {
        updateNodeAppearance(graph);
        sigma.refresh();
      }
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [connectedNodes, focusedNodeId, hoveredNode, sigma, updateNodeAppearance]);

  // Enhanced event handling with hover effects
  useEffect(() => {
    const isButtonPressed = (ev: MouseEvent | TouchEvent) => {
      if (ev.type.startsWith('mouse')) {
        return (ev as MouseEvent).buttons !== 0;
      }
      return false;
    };

    registerEvents({
      clickNode: ({ node }) => {
        const currentTime = Date.now();
        const nodeId = String(node);
        const isDoubleClick = currentTime - lastClickTime < 300 && lastClickNode === nodeId;

        if (isDoubleClick) {
          // Double-click: trigger isolate mode
          if (onDoubleClick) {
            onDoubleClick(nodeId);
          }
        }

        setLastClickTime(currentTime);
        setLastClickNode(nodeId);

        if (onNodeClick) onNodeClick(nodeId);
      },
      clickStage: () => {
        if (onNodeClick) {
          onNodeClick('');
        }
      },
      enterNode: ({ node, event }) => {
        if (!isButtonPressed(event.original)) {
          setHoveredNode(String(node));
        }
      },
      leaveNode: ({ event }) => {
        if (!isButtonPressed(event.original)) {
          setHoveredNode(null);
        }
      },
    });
  }, [registerEvents, onNodeClick, onDoubleClick, lastClickTime, lastClickNode]);

  // Camera animation when focusing on nodes (debounced)
  useEffect(() => {
    if (!focusedNodeId) return;

    const timeoutId = setTimeout(() => {
      try {
        const display = sigma.getNodeDisplayData(focusedNodeId);
        if (display) {
          const currentCamera = sigma.getCamera().getState();
          sigma.getCamera().animate(
            {
              x: display.x,
              y: display.y,
              ratio: currentCamera.ratio,
            },
            { duration: 300 },
          );
        }
      } catch {
        // no-op
      }
    }, 100); // 100ms debounce for camera movements

    return () => clearTimeout(timeoutId);
  }, [focusedNodeId, sigma]);

  return null;
}

// Enhanced zoom and camera controls
function ZoomControls({
  onReorganize,
  nodeCount,
  edgeCount,
}: {
  onReorganize?: () => void;
  nodeCount?: number;
  edgeCount?: number;
}) {
  const sigma = useSigma();
  const { zoomIn, zoomOut, reset } = useCamera({ duration: 200, factor: 1.5 });

  const handleResetView = useCallback(() => {
    try {
      sigma.setCustomBBox(null);
      sigma.refresh();
      const graph = sigma.getGraph();

      if (!graph?.order || graph.nodes().length === 0) {
        reset();
        return;
      }

      sigma.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1.1 }, { duration: 1000 });
    } catch (error) {
      console.error('Error resetting view:', error);
      reset();
    }
  }, [sigma, reset]);

  const handleRotate = useCallback(() => {
    const camera = sigma.getCamera();
    const currentAngle = camera.angle;
    camera.animate({ angle: currentAngle + Math.PI / 8 }, { duration: 200 });
  }, [sigma]);

  const handleRotateCounterClockwise = useCallback(() => {
    const camera = sigma.getCamera();
    const currentAngle = camera.angle;
    camera.animate({ angle: currentAngle - Math.PI / 8 }, { duration: 200 });
  }, [sigma]);

  return (
    <div className="absolute bottom-3 left-3 z-10">
      <div className="flex flex-col gap-1 bg-background/90 backdrop-blur-sm border border-border/60 rounded-xl p-1">
        <SigmaShareButton
          nodeCount={nodeCount}
          edgeCount={edgeCount}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          showTooltip={true}
        />
        {onReorganize && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReorganize}
            className="h-8 w-8 p-0"
            title="Reorganize Layout"
          >
            <Shuffle className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRotate}
          className="h-8 w-8 p-0"
          title="Rotate Clockwise"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRotateCounterClockwise}
          className="h-8 w-8 p-0"
          title="Rotate Counter-Clockwise"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleResetView}
          className="h-8 w-8 p-0"
          title="Reset View"
        >
          <Focus className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => zoomIn()}
          className="h-8 w-8 p-0"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => zoomOut()}
          className="h-8 w-8 p-0"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Layout control with animation - COMMENTED OUT FOR NOW
/* 
function LayoutControl({
  currentLayout,
  onLayoutChange,
}: {
  currentLayout: string;
  onLayoutChange: (layout: string) => void;
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleLayoutChange = useCallback(
    (newLayout: string) => {
      if (isAnimating) return;
      setIsAnimating(true);
      onLayoutChange(newLayout);

      // Reset animation state after layout completes
      setTimeout(() => setIsAnimating(false), 500);
    },
    [onLayoutChange, isAnimating],
  );

  return (
    <div className="flex items-center gap-2">
      {isAnimating && (
        <Button size="sm" variant="ghost" className="h-8 px-2">
          <Pause className="h-3 w-3" />
        </Button>
      )}
      <Select value={currentLayout} onValueChange={handleLayoutChange}>
        <SelectTrigger className="w-auto h-8 bg-background/90 backdrop-blur-sm border-border/60 rounded-xl px-3 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="forceatlas2" className="text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3" />
              Force Atlas 2
            </div>
          </SelectItem>
          <SelectItem value="force" className="text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3" />
              Force Directed
            </div>
          </SelectItem>
          <SelectItem value="noverlap" className="text-xs">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-3 w-3" />
              No Overlap
            </div>
          </SelectItem>
          <SelectItem value="circular" className="text-xs">
            <div className="flex items-center gap-2">
              <RotateCw className="h-3 w-3" />
              Circular
            </div>
          </SelectItem>
          <SelectItem value="grid" className="text-xs">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-3 w-3" />
              Grid
            </div>
          </SelectItem>
          <SelectItem value="random" className="text-xs">
            <div className="flex items-center gap-2">
              <Shuffle className="h-3 w-3" />
              Random
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
*/

export default function SigmaGraphInner({
  data,
  onNodeClick,
  focusedNodeId,
  nodeCategories,
  hierarchyDepth,
  selectedRootNodeId,
  viewMode = 'highlight',
  onDoubleClick,
}: {
  data: SigmaGraphInnerData;
  onNodeClick?: (nodeId: string) => void;
  focusedNodeId?: string | null;
  nodeCategories?: NodeCategories;
  hierarchyDepth?: number;
  selectedRootNodeId?: string;
  viewMode?: 'highlight' | 'isolate';
  onDoubleClick?: (nodeId: string) => void;
}) {
  const [isInitialLayoutComplete, setIsInitialLayoutComplete] = useState(false);
  const [applyLayoutRef, setApplyLayoutRef] = useState<
    ((layoutType: string, animate?: boolean) => void) | null
  >(null);
  const [forceShowLargeGraph, setForceShowLargeGraph] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset layout state when data changes
  useEffect(() => {
    setIsInitialLayoutComplete(false);
  }, [data]);

  // Reorganize layout function with multi-stage approach
  const handleReorganizeLayout = useCallback(() => {
    if (applyLayoutRef) {
      // Apply ForceAtlas2 first for structure
      applyLayoutRef('forceatlas2', true);

      // Then apply NoOverlap to spread out clustered nodes
      setTimeout(() => {
        if (applyLayoutRef) {
          applyLayoutRef('noverlap', true);
        }
      }, 800); // Wait for ForceAtlas2 animation to complete
    }
  }, [applyLayoutRef]);
  // Layout state commented out for now
  // const [currentLayout, setCurrentLayout] = useState<
  //   'forceatlas2' | 'circular' | 'grid' | 'random' | 'force' | 'noverlap'
  // >('forceatlas2');

  const nodeCount = data.nodes.length;
  const showPerformanceWarning = nodeCount > 3000;
  const showMaxWarning = nodeCount > 10000;

  if (showMaxWarning && !forceShowLargeGraph) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center space-y-4 p-8 max-w-md">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">Graph Too Large</h3>
            <p className="text-sm text-muted-foreground">
              This graph has {nodeCount.toLocaleString()} nodes, which exceeds the 10,000 node limit
              for optimal performance.
            </p>
            <p className="text-sm text-muted-foreground">
              Rendering this graph may affect performance and could potentially crash your browser.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setForceShowLargeGraph(true)}
            className="rounded-xl text-sm"
          >
            Show graph anyway
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Loading overlay during initial layout */}
      {!isInitialLayoutComplete && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Organizing Layout</p>
              <p className="text-xs text-muted-foreground">Calculating optimal positions...</p>
            </div>
          </div>
        </div>
      )}

      {/* Performance Warning - top center */}
      {showPerformanceWarning && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 max-w-md">
          <Alert className="bg-yellow-50/90 dark:bg-yellow-950/20 backdrop-blur-sm border-yellow-200 dark:border-yellow-800 rounded-xl">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
              Large graph ({nodeCount.toLocaleString()} nodes) - performance may be impacted
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Stats Badge - top right corner */}
      {/* <div className="absolute top-3 right-3 z-10">
        <Badge className="bg-background/90 backdrop-blur-sm border-border/60 text-foreground rounded-xl px-2 py-1 text-xs">
          {data.nodes.length}N • {data.edges.length}E
        </Badge>
      </div> */}

      <SigmaContainer
        style={sigmaContainerStyle}
        graph={MultiDirectedGraph}
        settings={enhancedSigmaSettings}
      >
        <GraphEvents enableNodeDrag={true} />
        <LoadGraph
          data={data}
          onNodeClick={onNodeClick}
          focusedNodeId={focusedNodeId}
          nodeCategories={nodeCategories}
          hierarchyDepth={hierarchyDepth}
          selectedRootNodeId={selectedRootNodeId}
          viewMode={viewMode}
          onDoubleClick={onDoubleClick}
          setIsInitialLayoutComplete={setIsInitialLayoutComplete}
          setApplyLayoutRef={setApplyLayoutRef}
        />

        {/* Enhanced Zoom Controls - bottom left corner */}
        <ZoomControls
          onReorganize={handleReorganizeLayout}
          nodeCount={data.nodes.length}
          edgeCount={data.edges.length}
        />

        {/* Enhanced Layout Controls - bottom right corner */}
        {/* <div className="absolute bottom-3 right-3 z-10">
          <LayoutControl
            currentLayout={currentLayout}
            onLayoutChange={(layout) => setCurrentLayout(layout as typeof currentLayout)}
          />
        </div> */}
      </SigmaContainer>
    </div>
  );
}
