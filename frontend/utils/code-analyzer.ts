import type {
  CodeReference,
  Usage,
  ReferenceFile,
  ReferenceChain,
  GraphData,
} from '../types/code-analysis';

/**
 * Finds function usages in code with context - improved version
 */
export function findFunctionUsages(code: string, functionName: string): Usage[] {
  if (!code || !functionName) return [];

  const usages: Usage[] = [];
  const lines = code.split('\n');

  // More comprehensive patterns for different usage types
  const patterns = [
    {
      type: 'import' as const,
      regex: new RegExp(`import\\s*{[^}]*\\b${functionName}\\b[^}]*}\\s*from`, 'gi'),
    },
    { type: 'import' as const, regex: new RegExp(`import\\s+${functionName}\\s+from`, 'gi') },
    {
      type: 'export' as const,
      regex: new RegExp(`export\\s*{[^}]*\\b${functionName}\\b[^}]*}`, 'gi'),
    },
    {
      type: 'export' as const,
      regex: new RegExp(`export\\s+(?:default\\s+)?${functionName}\\b`, 'gi'),
    },
    { type: 'constructor' as const, regex: new RegExp(`new\\s+${functionName}\\s*\\(`, 'gi') },
    { type: 'method' as const, regex: new RegExp(`\\.${functionName}\\s*\\(`, 'gi') },
    { type: 'property' as const, regex: new RegExp(`\\.${functionName}\\b(?!\\s*\\()`, 'gi') },
    { type: 'call' as const, regex: new RegExp(`\\b${functionName}\\s*\\(`, 'gi') },
    // Also look for the function name in general (fallback)
    { type: 'call' as const, regex: new RegExp(`\\b${functionName}\\b`, 'gi') },
  ];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    patterns.forEach(({ type, regex }) => {
      let match: RegExpExecArray | null;
      // Reset regex lastIndex for global regex
      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        // Avoid infinite loops with global regex
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }

        const usage: Usage = {
          line: lineNumber,
          column: match.index,
          type,
          context: line.trim(),
          fullContext: extractCodeContext(code, lineNumber, 3),
          functionScope: findFunctionScope(lines, index),
          usagePattern: determineUsagePattern(line, match.index, functionName),
        };

        // Avoid duplicates on the same line
        const matchIndex = match.index; // Store match.index to avoid null check issues
        const isDuplicate = usages.some(
          (existing) =>
            existing.line === lineNumber &&
            existing.type === type &&
            existing.column === matchIndex,
        );

        if (!isDuplicate) {
          usages.push(usage);
        }
      }
    });
  });

  return usages;
}

/**
 * Extracts code context around a specific line
 */
export function extractCodeContext(code: string, lineNumber: number, contextLines = 5): string {
  const lines = code.split('\n');
  const startLine = Math.max(0, lineNumber - contextLines - 1);
  const endLine = Math.min(lines.length, lineNumber + contextLines);

  return lines
    .slice(startLine, endLine)
    .map((line, index) => {
      const actualLineNumber = startLine + index + 1;
      const isTargetLine = actualLineNumber === lineNumber;
      const prefix = isTargetLine ? '►' : ' ';
      return `${prefix} ${actualLineNumber.toString().padStart(3, ' ')} │ ${line}`;
    })
    .join('\n');
}

/**
 * Detects the type of usage based on code context
 */
export function detectUsageType(codeSnippet: string, functionName: string): Usage['type'] {
  if (codeSnippet.includes('import') && codeSnippet.includes(functionName)) {
    return 'import';
  }
  if (codeSnippet.includes('export') && codeSnippet.includes(functionName)) {
    return 'export';
  }
  if (codeSnippet.includes(`new ${functionName}`)) {
    return 'constructor';
  }
  if (codeSnippet.includes(`.${functionName}(`)) {
    return 'method';
  }
  if (codeSnippet.includes(`.${functionName}`) && !codeSnippet.includes(`${functionName}(`)) {
    return 'property';
  }
  if (codeSnippet.includes(`${functionName}(`)) {
    return 'call';
  }

  return 'call'; // default
}

/**
 * Finds the function scope for a given line
 */
function findFunctionScope(lines: string[], targetIndex: number): string | undefined {
  // Look backwards to find the containing function
  for (let i = targetIndex; i >= 0; i--) {
    const line = lines[i].trim();

    // Match function declarations
    const functionMatch = line.match(
      /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:function|$$[^)]*$$\s*=>)|class\s+(\w+)|(\w+)\s*$$[^)]*$$\s*{)/,
    );
    if (functionMatch) {
      return functionMatch[1] || functionMatch[2] || functionMatch[3] || functionMatch[4];
    }

    // Match method definitions
    const methodMatch = line.match(/(\w+)\s*$$[^)]*$$\s*{/);
    if (methodMatch) {
      return methodMatch[1];
    }
  }

  return undefined;
}

/**
 * Determines the usage pattern description
 */
function determineUsagePattern(line: string, matchIndex: number, functionName: string): string {
  const beforeMatch = line.substring(0, matchIndex).trim();
  const afterMatch = line.substring(matchIndex + functionName.length).trim();

  if (beforeMatch.includes('import')) return 'Module import';
  if (beforeMatch.includes('export')) return 'Module export';
  if (beforeMatch.includes('return')) return 'Return statement';
  if (beforeMatch.includes('await')) return 'Async call';
  if (beforeMatch.includes('const') || beforeMatch.includes('let') || beforeMatch.includes('var')) {
    return 'Variable assignment';
  }
  if (beforeMatch.includes('if') || beforeMatch.includes('while') || beforeMatch.includes('for')) {
    return 'Conditional/loop';
  }
  if (afterMatch.startsWith('(')) return 'Function call';
  if (beforeMatch.includes('.')) return 'Method invocation';

  return 'Direct usage';
}

/**
 * Builds dependency chain up to specified depth
 */
export function buildDependencyChain(
  nodes: CodeReference[],
  edges: GraphData['edges'],
  startNodeId: string,
  maxDepth: number,
): ReferenceChain[] {
  const visited = new Set<string>();

  function buildChain(nodeId: string, depth: number): ReferenceChain | null {
    if (depth > maxDepth || visited.has(nodeId)) return null;

    visited.add(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    // Find connected nodes
    const connectedEdges = edges.filter((e) => e.source === nodeId || e.target === nodeId);
    const children: ReferenceChain[] = [];

    if (depth < maxDepth) {
      connectedEdges.forEach((edge) => {
        const childNodeId = edge.source === nodeId ? edge.target : edge.source;
        const childChain = buildChain(childNodeId, depth + 1);
        if (childChain) {
          children.push(childChain);
        }
      });
    }

    // Find usages in this node
    const usages = node.code
      ? findFunctionUsages(node.code, nodes.find((n) => n.id === startNodeId)?.name || '')
      : [];

    return {
      depth,
      node,
      usages,
      children,
    };
  }

  const rootChain = buildChain(startNodeId, 0);
  return rootChain ? [rootChain] : [];
}

/**
 * Analyzes references for a selected node using actual graph connections
 */
export function analyzeReferences(
  selectedNode: CodeReference,
  graphData: GraphData,
  maxDepth = 3,
): ReferenceFile[] {
  const referenceFiles: Map<string, ReferenceFile> = new Map();

  // Find all edges connected to the selected node
  const connectedEdges = graphData.edges.filter(
    (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
  );

  // Get all connected node IDs
  const connectedNodeIds = new Set<string>();
  connectedEdges.forEach((edge) => {
    if (edge.source === selectedNode.id) {
      connectedNodeIds.add(edge.target);
    } else {
      connectedNodeIds.add(edge.source);
    }
  });

  // Process each connected node
  connectedNodeIds.forEach((nodeId) => {
    const connectedNode = graphData.nodes.find((n) => n.id === nodeId);
    if (!connectedNode || !connectedNode.file || connectedNode.id === selectedNode.id) return;

    // Find the relationship type from the edge
    const edge = connectedEdges.find(
      (e) =>
        (e.source === selectedNode.id && e.target === nodeId) ||
        (e.target === selectedNode.id && e.source === nodeId),
    );
    const relationship = edge?.relationship || 'references';

    // Create usage based on the graph relationship and actual code
    const usages: Usage[] = [];

    // If the connected node has code, try to find actual usage
    if (connectedNode.code) {
      const foundUsages = findFunctionUsages(connectedNode.code, selectedNode.name);
      usages.push(...foundUsages);
    }

    // If no usages found in code but there's a graph connection, create a synthetic usage
    if (usages.length === 0) {
      // Determine usage type from relationship
      let usageType: Usage['type'] = 'call';
      if (relationship.toLowerCase().includes('import')) usageType = 'import';
      else if (relationship.toLowerCase().includes('export')) usageType = 'export';
      else if (relationship.toLowerCase().includes('method')) usageType = 'method';
      else if (relationship.toLowerCase().includes('property')) usageType = 'property';
      else if (
        relationship.toLowerCase().includes('constructor') ||
        relationship.toLowerCase().includes('new')
      )
        usageType = 'constructor';

      const syntheticUsage: Usage = {
        line: connectedNode.start_line || 1,
        column: 0,
        type: usageType,
        context: `${relationship} ${selectedNode.name}`,
        fullContext:
          connectedNode.code || `// ${connectedNode.name} ${relationship} ${selectedNode.name}`,
        functionScope: connectedNode.name,
        usagePattern: `Graph relationship: ${relationship}`,
      };
      usages.push(syntheticUsage);
    }

    if (usages.length > 0) {
      const file = connectedNode.file;
      const fileName = file.split('/').pop() || file;
      const relativePath = file.replace(/^[^/]*-[a-f0-9]{40}\//, './');

      if (referenceFiles.has(file)) {
        const existing = referenceFiles.get(file)!;
        existing.usages.push(...usages);
        existing.referencingNodes.push(connectedNode);
        existing.totalUsages += usages.length;
      } else {
        referenceFiles.set(file, {
          file,
          fileName,
          relativePath,
          usages,
          totalUsages: usages.length,
          referencingNodes: [connectedNode],
        });
      }
    }
  });

  // Also check for multi-level connections (up to maxDepth)
  if (maxDepth > 1) {
    const processedNodes = new Set([selectedNode.id]);

    const findDeepConnections = (currentNodeIds: Set<string>, currentDepth: number) => {
      if (currentDepth >= maxDepth) return;

      const nextLevelNodes = new Set<string>();

      currentNodeIds.forEach((nodeId) => {
        const deepEdges = graphData.edges.filter(
          (edge) =>
            (edge.source === nodeId || edge.target === nodeId) &&
            !processedNodes.has(edge.source) &&
            !processedNodes.has(edge.target),
        );

        deepEdges.forEach((edge) => {
          const targetNodeId = edge.source === nodeId ? edge.target : edge.source;
          if (!processedNodes.has(targetNodeId)) {
            nextLevelNodes.add(targetNodeId);
            processedNodes.add(targetNodeId);

            const targetNode = graphData.nodes.find((n) => n.id === targetNodeId);
            if (targetNode && targetNode.file && targetNode.code) {
              const deepUsages = findFunctionUsages(targetNode.code, selectedNode.name);

              if (deepUsages.length > 0) {
                const file = targetNode.file;
                const fileName = file.split('/').pop() || file;
                const relativePath = file.replace(/^[^/]*-[a-f0-9]{40}\//, './');

                // Mark these as indirect references
                const indirectUsages = deepUsages.map((usage) => ({
                  ...usage,
                  usagePattern: `${usage.usagePattern} (depth ${currentDepth + 1})`,
                }));

                if (referenceFiles.has(file)) {
                  const existing = referenceFiles.get(file)!;
                  existing.usages.push(...indirectUsages);
                  existing.totalUsages += indirectUsages.length;
                } else {
                  referenceFiles.set(file, {
                    file,
                    fileName,
                    relativePath,
                    usages: indirectUsages,
                    totalUsages: indirectUsages.length,
                    referencingNodes: [targetNode],
                  });
                }
              }
            }
          }
        });
      });

      if (nextLevelNodes.size > 0) {
        findDeepConnections(nextLevelNodes, currentDepth + 1);
      }
    };

    findDeepConnections(connectedNodeIds, 1);
  }

  return Array.from(referenceFiles.values()).sort((a, b) => b.totalUsages - a.totalUsages);
}
