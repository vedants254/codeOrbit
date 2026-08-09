import React from 'react';
import type { GraphNode as ApiGraphNode } from '@/api-client/types.gen';

export interface GraphNode extends ApiGraphNode {
  line: number;
  inDegree?: number;
  outDegree?: number;
  connectedFiles?: string[];
}

export interface SearchResult {
  node: GraphNode;
  score: number;
  matchedFields: string[];
  highlightRanges: Array<{ field: string; start: number; end: number }>;
}

export interface SearchFilter {
  categories?: string[];
  fileExtensions?: string[];
  directories?: string[];
  minConnections?: number;
  maxConnections?: number;
}

export interface SearchOptions {
  query: string;
  filters?: SearchFilter;
  maxResults?: number;
  threshold?: number;
}

export class FuzzyMatcher {
  private static levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // insertion
          matrix[j - 1][i] + 1, // deletion
          matrix[j - 1][i - 1] + substitutionCost, // substitution
        );
      }
    }
    
    return matrix[b.length][a.length];
  }

  static fuzzyScore(query: string, target: string): number {
    if (!query || !target) return 0;
    
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Exact match gets highest score
    if (targetLower === queryLower) return 1.0;
    
    // Contains match gets high score
    if (targetLower.includes(queryLower)) {
      const ratio = queryLower.length / targetLower.length;
      return 0.8 + (0.2 * ratio);
    }
    
    // Check if target starts with query for better scoring
    if (targetLower.startsWith(queryLower)) {
      const ratio = queryLower.length / targetLower.length;
      return 0.7 + (0.2 * ratio);
    }
    
    // Fuzzy match using Levenshtein distance
    const distance = this.levenshteinDistance(queryLower, targetLower);
    const maxLength = Math.max(queryLower.length, targetLower.length);
    
    if (maxLength === 0) return 0;
    
    const similarity = 1 - (distance / maxLength);
    return Math.max(0, similarity - 0.1); // Lower penalty for better fuzzy matching
  }

  static findMatchRanges(query: string, target: string): Array<{ start: number; end: number }> {
    if (!query || !target) return [];
    
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    const ranges: Array<{ start: number; end: number }> = [];
    
    let searchIndex = 0;
    let queryIndex = 0;
    
    // Find all occurrences of query characters in order
    while (searchIndex < targetLower.length && queryIndex < queryLower.length) {
      if (targetLower[searchIndex] === queryLower[queryIndex]) {
        const start = searchIndex;
        let end = searchIndex;
        
        // Try to match consecutive characters
        while (
          end < targetLower.length - 1 &&
          queryIndex < queryLower.length - 1 &&
          targetLower[end + 1] === queryLower[queryIndex + 1]
        ) {
          end++;
          queryIndex++;
        }
        
        ranges.push({ start, end: end + 1 });
        queryIndex++;
      }
      searchIndex++;
    }
    
    return ranges;
  }
}

export class GraphSearchEngine {
  private nodes: GraphNode[];

  constructor(nodes: GraphNode[]) {
    this.nodes = nodes;
  }


  private applyFilters(nodes: GraphNode[], filters: SearchFilter): GraphNode[] {
    return nodes.filter(node => {
      // Category filter
      if (filters.categories?.length && !filters.categories.includes(node.category || '')) {
        return false;
      }
      
      // File extension filter
      if (filters.fileExtensions?.length && node.file) {
        const ext = node.file.split('.').pop()?.toLowerCase();
        if (!ext || !filters.fileExtensions.includes(ext)) {
          return false;
        }
      }
      
      // Directory filter
      if (filters.directories?.length && node.file) {
        const dir = node.file.split('/').slice(0, -1).join('/');
        if (!filters.directories.some(d => dir.startsWith(d))) {
          return false;
        }
      }
      
      // Connection count filters
      const connections = (node.inDegree || 0) + (node.outDegree || 0);
      if (filters.minConnections !== undefined && connections < filters.minConnections) {
        return false;
      }
      if (filters.maxConnections !== undefined && connections > filters.maxConnections) {
        return false;
      }
      
      return true;
    });
  }

  search(options: SearchOptions): SearchResult[] {
    const { query, filters, maxResults = 50, threshold = 0.2 } = options;
    
    if (!query.trim()) {
      // If no query but filters exist, return filtered results
      if (filters && (filters.categories?.length || filters.fileExtensions?.length || filters.directories?.length)) {
        return this.applyFilters(this.nodes, filters).slice(0, maxResults).map(node => ({
          node,
          score: 1,
          matchedFields: ['category'],
          highlightRanges: []
        }));
      }
      return [];
    }
    
    const results: SearchResult[] = [];
    const processedNodes = new Set<string>();
    
    // Search through all nodes
    for (const node of this.nodes) {
      if (processedNodes.has(node.id)) continue;
      processedNodes.add(node.id);
      
      const matchedFields: string[] = [];
      const highlightRanges: Array<{ field: string; start: number; end: number }> = [];
      let maxScore = 0;
      
      // Check name match
      const nameScore = FuzzyMatcher.fuzzyScore(query, node.name);
      if (nameScore > threshold) {
        maxScore = Math.max(maxScore, nameScore * 1.2); // Boost name matches
        matchedFields.push('name');
        const ranges = FuzzyMatcher.findMatchRanges(query, node.name);
        ranges.forEach(range => highlightRanges.push({ field: 'name', ...range }));
      }
      
      // Check file path match
      if (node.file) {
        const fileScore = FuzzyMatcher.fuzzyScore(query, node.file);
        if (fileScore > threshold) {
          maxScore = Math.max(maxScore, fileScore);
          matchedFields.push('file');
          const ranges = FuzzyMatcher.findMatchRanges(query, node.file);
          ranges.forEach(range => highlightRanges.push({ field: 'file', ...range }));
        }
      }
      
      // Check category match
      if (node.category) {
        const categoryScore = FuzzyMatcher.fuzzyScore(query, node.category);
        if (categoryScore > threshold) {
          maxScore = Math.max(maxScore, categoryScore * 0.8);
          matchedFields.push('category');
        }
      }
      
      // Check code content match
      if (node.code) {
        const codeSnippet = node.code.substring(0, 200);
        const codeScore = FuzzyMatcher.fuzzyScore(query, codeSnippet);
        if (codeScore > threshold) {
          maxScore = Math.max(maxScore, codeScore * 0.6);
          matchedFields.push('code');
          const ranges = FuzzyMatcher.findMatchRanges(query, codeSnippet);
          ranges.forEach(range => highlightRanges.push({ field: 'code', ...range }));
        }
      }
      
      if (maxScore > threshold && matchedFields.length > 0) {
        results.push({
          node,
          score: maxScore,
          matchedFields,
          highlightRanges
        });
      }
    }
    
    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);
    
    // Apply filters
    const filteredResults = filters 
      ? results.filter(result => this.applyFilters([result.node], filters).length > 0)
      : results;
    
    return filteredResults.slice(0, maxResults);
  }

  getSearchSuggestions(query: string, limit = 10): string[] {
    if (!query.trim()) return [];
    
    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();
    
    // Get suggestions from node names
    for (const node of this.nodes) {
      if (node.name.toLowerCase().includes(queryLower)) {
        suggestions.add(node.name);
      }
      
      // Add file names
      if (node.file) {
        const filename = node.file.split('/').pop();
        if (filename?.toLowerCase().includes(queryLower)) {
          suggestions.add(filename);
        }
      }
      
      // Add categories
      if (node.category?.toLowerCase().includes(queryLower)) {
        suggestions.add(node.category);
      }
    }
    
    return Array.from(suggestions).slice(0, limit);
  }

  getAvailableFilters(): {
    categories: string[];
    fileExtensions: string[];
    directories: string[];
  } {
    const categories = new Set<string>();
    const fileExtensions = new Set<string>();
    const directories = new Set<string>();
    
    for (const node of this.nodes) {
      if (node.category) categories.add(node.category);
      
      if (node.file) {
        const ext = node.file.split('.').pop();
        if (ext) fileExtensions.add(ext);
        
        const dir = node.file.split('/').slice(0, -1).join('/');
        if (dir) directories.add(dir);
      }
    }
    
    return {
      categories: Array.from(categories).sort(),
      fileExtensions: Array.from(fileExtensions).sort(),
      directories: Array.from(directories).sort()
    };
  }
}

export function highlightText(
  text: string,
  ranges: Array<{ start: number; end: number }>,
  className = 'bg-yellow-200 dark:bg-yellow-800'
): React.ReactNode[] {
  if (!ranges.length) return [text];
  
  const elements: React.ReactNode[] = [];
  let lastEnd = 0;
  
  ranges.forEach((range, index) => {
    // Add text before highlight
    if (range.start > lastEnd) {
      elements.push(text.slice(lastEnd, range.start));
    }
    
    // Add highlighted text
    elements.push(
      React.createElement('span', {
        key: index,
        className: className
      }, text.slice(range.start, range.end))
    );
    
    lastEnd = range.end;
  });
  
  // Add remaining text
  if (lastEnd < text.length) {
    elements.push(text.slice(lastEnd));
  }
  
  return elements;
}