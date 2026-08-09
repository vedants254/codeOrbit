'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  GraphSearchEngine,
  type GraphNode,
  type SearchResult,
  type SearchFilter,
  type SearchOptions,
} from '@/lib/search-utils';

export interface UseGraphSearchOptions {
  nodes: GraphNode[];
  initialQuery?: string;
  debounceMs?: number;
  maxResults?: number;
  searchThreshold?: number;
}

export interface UseGraphSearchReturn {
  // Search state
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  hasResults: boolean;
  
  // Filters
  filters: SearchFilter;
  setFilters: (filters: SearchFilter) => void;
  availableFilters: {
    categories: string[];
    fileExtensions: string[];
    directories: string[];
  };
  
  // Suggestions
  suggestions: string[];
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  
  // Highlighting
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  
  // Search actions
  clearSearch: () => void;
  searchNodes: (options: SearchOptions) => SearchResult[];
  selectResult: (result: SearchResult) => void;
  
  // Search history
  searchHistory: string[];
  addToHistory: (query: string) => void;
  clearHistory: () => void;
  
  // Quick actions
  searchByCategory: (category: string) => void;
  searchByFile: (filename: string) => void;
  
  // Performance
  searchStats: {
    totalNodes: number;
    filteredNodes: number;
    searchTime: number;
  };
}

const SEARCH_HISTORY_KEY = 'graph_search_history';
const MAX_HISTORY_ITEMS = 10;

export function useGraphSearch({
  nodes,
  initialQuery = '',
  debounceMs = 300,
  maxResults = 50,
  searchThreshold = 0.2,
}: UseGraphSearchOptions): UseGraphSearchReturn {
  // Core search state
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState<SearchFilter>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchStats, setSearchStats] = useState({
    totalNodes: 0,
    filteredNodes: 0,
    searchTime: 0,
  });

  // Refs for debouncing and search engine
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const searchEngineRef = useRef<GraphSearchEngine | null>(null);
  const lastSearchRef = useRef<string>('');

  // Initialize search engine when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      searchEngineRef.current = new GraphSearchEngine(nodes);
      setSearchStats(prev => ({ ...prev, totalNodes: nodes.length }));
      
      // Show all nodes by default when first loading
      if (!query.trim() && (!filters || Object.keys(filters).length === 0)) {
        const allResults = nodes.slice(0, maxResults).map(node => ({
          node,
          score: 1,
          matchedFields: [] as string[],
          highlightRanges: [] as Array<{ field: string; start: number; end: number }>
        }));
        setResults(allResults);
      }
    }
  }, [nodes, query, filters, maxResults]);

  // Load search history on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (savedHistory) {
        setSearchHistory(JSON.parse(savedHistory));
      }
    } catch (error) {
      console.warn('Failed to load search history:', error);
    }
  }, []);

  // Memoized available filters
  const availableFilters = useMemo(() => {
    if (!searchEngineRef.current) {
      return { categories: [], fileExtensions: [], directories: [] };
    }
    return searchEngineRef.current.getAvailableFilters();
  }, [nodes]);

  // Debounced search function
  const performSearch = useCallback(
    (searchQuery: string, searchFilters: SearchFilter) => {
      if (!searchEngineRef.current) return;

      const startTime = performance.now();
      setIsSearching(true);

      try {
        const searchOptions: SearchOptions = {
          query: searchQuery,
          filters: searchFilters,
          maxResults,
          threshold: searchThreshold,
        };

        const searchResults = searchEngineRef.current.search(searchOptions);
        const endTime = performance.now();

        setResults(searchResults);
        setSearchStats(prev => ({
          ...prev,
          filteredNodes: searchResults.length,
          searchTime: endTime - startTime,
        }));

        // Update highlighted nodes
        const nodeIds = new Set(searchResults.map(result => result.node.id));
        setHighlightedNodeIds(nodeIds);

        // Update suggestions if query has changed
        if (searchQuery !== lastSearchRef.current) {
          const newSuggestions = searchEngineRef.current.getSearchSuggestions(searchQuery);
          setSuggestions(newSuggestions);
          lastSearchRef.current = searchQuery;
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
        setHighlightedNodeIds(new Set());
      } finally {
        setIsSearching(false);
      }
    },
    [maxResults, searchThreshold],
  );

  // Debounced search effect with performance optimization
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Skip search for very short queries to improve performance, but allow filter-only searches
    if (query.length > 0 && query.length < 2) {
      setResults([]);
      setHighlightedNodeIds(new Set());
      return;
    }

    // Check if we have filters but no query - trigger immediate search
    const hasFilters = filters && (filters.categories?.length || filters.fileExtensions?.length || filters.directories?.length);
    if (!query.trim() && !hasFilters) {
      setResults([]);
      setHighlightedNodeIds(new Set());
      return;
    }

    // Use longer debounce for large graphs, but immediate for filter-only searches
    const adaptiveDebounce = (!query.trim() && hasFilters) ? 0 : 
      (nodes.length > 1000 ? Math.max(debounceMs, 500) : debounceMs);

    debounceTimeoutRef.current = setTimeout(() => {
      performSearch(query, filters);
    }, adaptiveDebounce);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, filters, performSearch, debounceMs, nodes.length]);

  // Search actions
  const searchNodes = useCallback(
    (options: SearchOptions): SearchResult[] => {
      if (!searchEngineRef.current) return [];
      return searchEngineRef.current.search(options);
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setHighlightedNodeIds(new Set());
    setSuggestions([]);
    setShowSuggestions(false);
    setFilters({});
    lastSearchRef.current = '';
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    setHighlightedNodeIds(new Set([result.node.id]));
    setShowSuggestions(false);
  }, []);

  // History management
  const addToHistory = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    try {
      setSearchHistory(prev => {
        const newHistory = [searchQuery, ...prev.filter(item => item !== searchQuery)]
          .slice(0, MAX_HISTORY_ITEMS);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
        return newHistory;
      });
    } catch (error) {
      console.warn('Failed to save search history:', error);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setSearchHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.warn('Failed to clear search history:', error);
    }
  }, []);

  // Quick search actions
  const searchByCategory = useCallback((category: string) => {
    setQuery('');
    setFilters(prev => ({
      ...prev,
      categories: [category],
    }));
    // Trigger immediate search for category filter
    if (searchEngineRef.current) {
      const searchOptions: SearchOptions = {
        query: '',
        filters: { categories: [category] },
        maxResults,
        threshold: searchThreshold,
      };
      const searchResults = searchEngineRef.current.search(searchOptions);
      setResults(searchResults);
      setSearchStats(prev => ({
        ...prev,
        filteredNodes: searchResults.length,
        searchTime: 0,
      }));
      const nodeIds = new Set(searchResults.map(result => result.node.id));
      setHighlightedNodeIds(nodeIds);
    }
  }, [maxResults, searchThreshold]);

  const searchByFile = useCallback((filename: string) => {
    setQuery(filename);
    setFilters({});
  }, []);

  // Enhanced setQuery with history tracking
  const setQueryWithHistory = useCallback((newQuery: string) => {
    setQuery(newQuery);
    if (newQuery.trim() && newQuery !== query) {
      // Add to history after a delay to avoid adding every keystroke
      const timeoutId = setTimeout(() => {
        addToHistory(newQuery);
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [query, addToHistory]);

  // Computed properties
  const hasResults = results.length > 0;

  return {
    // Search state
    query,
    setQuery: setQueryWithHistory,
    results,
    isSearching,
    hasResults,
    
    // Filters
    filters,
    setFilters,
    availableFilters,
    
    // Suggestions
    suggestions,
    showSuggestions,
    setShowSuggestions,
    
    // Highlighting
    highlightedNodeIds,
    setHighlightedNodeIds,
    
    // Search actions
    clearSearch,
    searchNodes,
    selectResult,
    
    // Search history
    searchHistory,
    addToHistory,
    clearHistory,
    
    // Quick actions
    searchByCategory,
    searchByFile,
    
    // Performance
    searchStats,
  };
}