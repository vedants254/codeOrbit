'use client';

import { useState, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Check,
  Layers,
  ActivityIcon as Function,
  Variable,
  Package,
  FileText,
  Code,
  Network,
  RotateCw,
  Info,
} from 'lucide-react';
import type { NodeFilter, FilterStats, GraphData } from '@/types/code-analysis';

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

interface CategoryInfo {
  name: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
}

interface HierarchyFiltersProps {
  graphData: GraphData;
  filter: NodeFilter;
  onFilterChange: (filter: NodeFilter) => void;
  filterStats?: FilterStats;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface FilterPreset {
  name: string;
  description: string;
  categories: string[];
  icon: React.ComponentType<{ className?: string }>;
}

// Predefined filter presets
const filterPresets: FilterPreset[] = [
  {
    name: 'Functions Only',
    description: 'Show only functions and their connections',
    categories: ['function'],
    icon: Function,
  },
  {
    name: 'Classes & Methods',
    description: 'Focus on object-oriented structures',
    categories: ['class', 'method'],
    icon: Layers,
  },
  {
    name: 'Core Logic',
    description: 'Functions, classes, and methods',
    categories: ['function', 'class', 'method'],
    icon: Code,
  },
  {
    name: 'Data Flow',
    description: 'Variables and their usage patterns',
    categories: ['variable', 'function'],
    icon: Variable,
  },
];

export function HierarchyFilters({
  graphData,
  filter,
  onFilterChange,
  filterStats,
  isCollapsed = false,
  onToggleCollapse,
}: HierarchyFiltersProps) {
  const [expandedSections, setExpandedSections] = useState({
    categories: true,
    settings: false,
    presets: false,
  });

  // Calculate available categories and their counts
  const categoryInfo = useMemo((): CategoryInfo[] => {
    const categoryCounts = new Map<string, number>();
    
    for (const node of graphData.nodes) {
      const category = node.category.toLowerCase();
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
    
    return Array.from(categoryCounts.entries())
      .map(([category, count]) => ({
        name: category,
        count,
        icon: categoryIcons[category as keyof typeof categoryIcons] || Network,
        color: categoryColors[category as keyof typeof categoryColors] || '#A1887F',
        label: category.charAt(0).toUpperCase() + category.slice(1),
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [graphData.nodes]);

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleCategoryToggle = useCallback((category: string, checked: boolean) => {
    const newCategories = checked
      ? [...filter.categories, category]
      : filter.categories.filter(c => c !== category);
    
    onFilterChange({
      ...filter,
      categories: newCategories,
    });
  }, [filter, onFilterChange]);

  const handleSelectAll = useCallback(() => {
    onFilterChange({
      ...filter,
      categories: categoryInfo.map(cat => cat.name),
    });
  }, [filter, onFilterChange, categoryInfo]);

  const handleClearAll = useCallback(() => {
    onFilterChange({
      ...filter,
      categories: [],
    });
  }, [filter, onFilterChange]);

  const handlePresetApply = useCallback((preset: FilterPreset) => {
    onFilterChange({
      ...filter,
      categories: preset.categories,
    });
  }, [filter, onFilterChange]);

  const handleReset = useCallback(() => {
    onFilterChange({
      categories: [],
      includeRemappedConnections: true,
      skipFilteredNodes: true,
    });
  }, [onFilterChange]);

  const isActive = filter.categories.length > 0;
  const selectedCategoriesSet = new Set(filter.categories);

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between p-2 border-b border-border/20 bg-background/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8"
          >
            <Filter className="h-4 w-4" />
          </Button>
          {isActive && (
            <Badge variant="default" className="text-xs">
              {filter.categories.length} filters
            </Badge>
          )}
        </div>
        {filterStats && (
          <div className="text-xs text-muted-foreground">
            {filterStats.totalNodesAfterFilter}/{filterStats.totalNodesBeforeFilter} nodes
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col border-b border-border/20 bg-background/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/10">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Smart Filters</h3>
          {isActive && (
            <Badge variant="default" className="text-xs">
              {filter.categories.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-7 w-7"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter Stats */}
      {filterStats && isActive && (
        <div className="px-3 py-2 bg-muted/20 border-b border-border/10">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nodes:</span>
              <span className="font-medium">
                {filterStats.totalNodesAfterFilter}/{filterStats.totalNodesBeforeFilter}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Remapped:</span>
              <span className="font-medium">{filterStats.remappedConnections}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {/* Quick Presets */}
        <Collapsible
          open={expandedSections.presets}
          onOpenChange={() => toggleSection('presets')}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-8 px-3 rounded-none border-b border-border/10"
            >
              <div className="flex items-center gap-2 text-xs">
                <RotateCw className="h-3 w-3" />
                <span>Quick Presets</span>
              </div>
              {expandedSections.presets ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 py-2 space-y-2">
            {filterPresets.map((preset) => {
              const Icon = preset.icon;
              const isApplied = preset.categories.length === filter.categories.length &&
                preset.categories.every(cat => filter.categories.includes(cat));
              
              return (
                <Button
                  key={preset.name}
                  variant={isApplied ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handlePresetApply(preset)}
                  className="w-full justify-start text-xs h-8"
                >
                  <Icon className="h-3 w-3 mr-2" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-muted-foreground">{preset.description}</div>
                  </div>
                  {isApplied && <Check className="h-3 w-3" />}
                </Button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        {/* Category Selection */}
        <Collapsible
          open={expandedSections.categories}
          onOpenChange={() => toggleSection('categories')}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-8 px-3 rounded-none border-b border-border/10"
            >
              <div className="flex items-center gap-2 text-xs">
                <Layers className="h-3 w-3" />
                <span>Node Categories</span>
                {filter.categories.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                    {filter.categories.length}/{categoryInfo.length}
                  </Badge>
                )}
              </div>
              {expandedSections.categories ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 py-2">
            {/* Select All/Clear All */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="flex-1 h-7 text-xs"
              >
                <Check className="h-3 w-3 mr-1" />
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="flex-1 h-7 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>

            {/* Category Checkboxes */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {categoryInfo.map((category) => {
                const Icon = category.icon;
                const isChecked = selectedCategoriesSet.has(category.name);
                
                return (
                  <div key={category.name} className="flex items-center gap-2 group">
                    <Checkbox
                      id={`category-${category.name}`}
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        handleCategoryToggle(category.name, checked === true)
                      }
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label
                      htmlFor={`category-${category.name}`}
                      className="flex-1 flex items-center gap-2 cursor-pointer text-xs hover:text-foreground transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="flex-1 font-medium">{category.label}</span>
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0.5 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                      >
                        {category.count}
                      </Badge>
                    </label>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Advanced Settings */}
        <Collapsible
          open={expandedSections.settings}
          onOpenChange={() => toggleSection('settings')}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-8 px-3 rounded-none"
            >
              <div className="flex items-center gap-2 text-xs">
                <Network className="h-3 w-3" />
                <span>Connection Settings</span>
              </div>
              {expandedSections.settings ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 py-2 space-y-3 border-t border-border/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="skip-filtered" className="text-xs font-medium">
                  Smart Remapping
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        When enabled, connections skip over filtered nodes to maintain graph connectivity.
                        For example: A → (filtered) → C becomes A → C.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="skip-filtered"
                checked={filter.skipFilteredNodes}
                onCheckedChange={(checked) =>
                  onFilterChange({
                    ...filter,
                    skipFilteredNodes: checked,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="include-remapped" className="text-xs font-medium">
                  Show Remapped Info
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Display visual indicators for connections that were remapped through filtered nodes.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="include-remapped"
                checked={filter.includeRemappedConnections}
                onCheckedChange={(checked) =>
                  onFilterChange({
                    ...filter,
                    includeRemappedConnections: checked,
                  })
                }
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}