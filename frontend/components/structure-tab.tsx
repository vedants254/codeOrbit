'use client';

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Search,
  X,
  Filter,
  EyeOff,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useResultData } from '@/context/ResultDataContext';
import Link from 'next/link';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
  extension?: string;
  selected?: boolean;
}

export function StructureTab() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [copyingText, setCopyingText] = useState(false);

  const { output } = useResultData();

  // Parse repository structure from output
  useEffect(() => {
    if (output) {
      const tree = parseRepositoryStructure(output);
      setFileTree(tree);

      // Expand ALL folders by default
      const allDirPaths = new Set<string>();
      const collectAllDirPaths = (nodes: FileNode[]) => {
        nodes.forEach((node) => {
          if (node.type === 'directory') {
            allDirPaths.add(node.path);
            if (node.children) {
              collectAllDirPaths(node.children);
            }
          }
        });
      };
      collectAllDirPaths(tree);
      setExpandedFolders(allDirPaths);

      // Select ALL files by default
      const allFilePaths = new Set<string>();
      const collectAllFilePaths = (nodes: FileNode[]) => {
        nodes.forEach((node) => {
          if (node.type === 'file') {
            allFilePaths.add(node.path);
          }
          if (node.children) {
            collectAllFilePaths(node.children);
          }
        });
      };
      collectAllFilePaths(tree);
      setSelectedFiles(allFilePaths);

      // Initialize all filters as active (showing all file types)
      const extensions = new Set<string>();
      const collectExtensions = (nodes: FileNode[]) => {
        nodes.forEach((node) => {
          if (node.type === 'file' && node.extension) {
            extensions.add(node.extension);
          }
          if (node.children) {
            collectExtensions(node.children);
          }
        });
      };
      collectExtensions(tree);
      setActiveFilters(extensions);
    }
  }, [output]);

  const parseRepositoryStructure = (text: string): FileNode[] => {
    const tree: FileNode[] = [];
    const rootMap: Record<string, FileNode> = {};

    // Extract files and their content
    const fileContentSections = text.split('---\nFile:').slice(1);

    fileContentSections.forEach((section) => {
      const firstNewlineIndex = section.indexOf('\n');
      const filePath = section.substring(0, firstNewlineIndex).trim();
      const content = section.substring(section.indexOf('\n---\n') + 5).trim();

      // Create file hierarchy
      const pathParts = filePath.split('/');
      let currentPath = '';
      let parentPath = '';

      // Create directory nodes
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!rootMap[currentPath]) {
          const dirNode: FileNode = {
            name: part,
            path: currentPath,
            type: 'directory',
            children: [],
            selected: false,
          };
          rootMap[currentPath] = dirNode;

          if (parentPath) {
            rootMap[parentPath].children = rootMap[parentPath].children || [];
            rootMap[parentPath].children!.push(dirNode);
          } else {
            tree.push(dirNode);
          }
        }
      }

      // Create file node
      const fileName = pathParts[pathParts.length - 1];
      const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
      const fileNode: FileNode = {
        name: fileName,
        path: filePath,
        type: 'file',
        content: content,
        extension: extension,
        selected: false,
      };

      if (currentPath) {
        rootMap[currentPath].children = rootMap[currentPath].children || [];
        rootMap[currentPath].children!.push(fileNode);
      } else {
        tree.push(fileNode);
      }
    });

    return tree;
  };

  const getAllDescendantFilePaths = (node: FileNode): string[] => {
    let paths: string[] = [];
    if (node.type === 'file') {
      paths.push(node.path);
    }
    if (node.children) {
      for (const child of node.children) {
        paths = paths.concat(getAllDescendantFilePaths(child));
      }
    }
    return paths;
  };

  const getDirectorySelectionState = (directoryNode: FileNode): 'all' | 'some' | 'none' => {
    const descendantFilePaths = getAllDescendantFilePaths(directoryNode);
    if (descendantFilePaths.length === 0) {
      return 'none';
    }

    const selectedCount = descendantFilePaths.filter((path) => selectedFiles.has(path)).length;

    if (selectedCount === 0) return 'none';
    if (selectedCount === descendantFilePaths.length) return 'all';
    return 'some';
  };

  const toggleDirectorySelection = (directoryNode: FileNode) => {
    const descendantFilePaths = getAllDescendantFilePaths(directoryNode);
    const selectionState = getDirectorySelectionState(directoryNode);

    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (selectionState === 'all') {
        descendantFilePaths.forEach((path) => newSet.delete(path));
      } else {
        // 'none' or 'some'
        descendantFilePaths.forEach((path) => newSet.add(path));
      }
      return newSet;
    });
  };

  // Get all unique file extensions
  const fileExtensions = useMemo(() => {
    const extensions = new Set<string>();
    const collectExtensions = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file' && node.extension) {
          extensions.add(node.extension);
        }
        if (node.children) {
          collectExtensions(node.children);
        }
      });
    };
    collectExtensions(fileTree);
    return Array.from(extensions).sort();
  }, [fileTree]);

  // Get file counts by extension
  const getFileCount = (extension: string): number => {
    let count = 0;
    const countFiles = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file' && node.extension === extension) {
          count++;
        }
        if (node.children) {
          countFiles(node.children);
        }
      });
    };
    countFiles(fileTree);
    return count;
  };

  // Get selected count for specific extension
  const getSelectedCountForExtension = (extension: string): number => {
    let count = 0;
    const countSelected = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file' && node.extension === extension && selectedFiles.has(node.path)) {
          count++;
        }
        if (node.children) {
          countSelected(node.children);
        }
      });
    };
    countSelected(fileTree);
    return count;
  };

  // Filter files for display based on search term only
  const displayTree = useMemo(() => {
    if (!searchTerm) return fileTree;

    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .map((node) => {
          if (node.type === 'directory') {
            const filteredChildren = node.children ? filterNodes(node.children) : [];
            if (
              filteredChildren.length > 0 ||
              node.name.toLowerCase().includes(searchTerm.toLowerCase())
            ) {
              return { ...node, children: filteredChildren };
            }
            return null;
          } else {
            // File filtering by search term only
            const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase());
            if (matchesSearch) {
              return node;
            }
            return null;
          }
        })
        .filter(Boolean) as FileNode[];
    };

    return filterNodes(fileTree);
  }, [fileTree, searchTerm]);

  const generateStructureTree = useCallback((nodes: FileNode[], prefix = ''): string => {
    let treeString = '';
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      if (selectedFiles.has(node.path) || node.type === 'directory') {
        if (node.type === 'directory') {
          const descendantFilePaths = getAllDescendantFilePaths(node);
          const hasSelectedChildren = descendantFilePaths.some((p) => selectedFiles.has(p));
          if (hasSelectedChildren) {
            treeString += `${prefix}${connector}${node.name}/\n`;
            if (node.children) {
              const newPrefix = prefix + (isLast ? '    ' : '│   ');
              treeString += generateStructureTree(node.children, newPrefix);
            }
          }
        } else {
          treeString += `${prefix}${connector}${node.name}\n`;
        }
      }
    });
    return treeString;
  }, [selectedFiles, getAllDescendantFilePaths]);

  const selectedContent = useMemo(() => {
    const content: string[] = [];
    const processNode = (node: FileNode) => {
      if (selectedFiles.has(node.path)) {
        if (node.type === 'file' && node.content) {
          content.push(`---\nFile: ${node.path}\n---\n${node.content}`);
        }
      }
      if (node.children) {
        node.children.forEach(processNode);
      }
    };
    fileTree.forEach(processNode);
    const structureTree = generateStructureTree(fileTree);
    return (structureTree ? `\`\`\`\n${structureTree}\`\`\`\n\n` : '') + content.join('\n\n');
  }, [fileTree, selectedFiles, generateStructureTree]);

  /*
     Helper functions for toggling folders and file selections
    */
  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const toggleFileSelection = (node: FileNode, type: 'file' | 'directory') => {
    if (type === 'directory') {
      toggleDirectorySelection(node);
    } else {
      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(node.path)) {
          newSet.delete(node.path);
        } else {
          newSet.add(node.path);
        }
        return newSet;
      });
    }
  };

  const handleExtensionFilterToggle = (extension: string) => {
    const isCurrentlyActive = activeFilters.has(extension);

    setActiveFilters((prev) => {
      const newFilters = new Set(prev);
      if (isCurrentlyActive) {
        newFilters.delete(extension);
      } else {
        newFilters.add(extension);
      }
      return newFilters;
    });

    // Update file selections based on filter state
    const filesToUpdate = new Set<string>();
    const collectFilesWithExtension = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file' && node.extension === extension) {
          filesToUpdate.add(node.path);
        }
        if (node.children) {
          collectFilesWithExtension(node.children);
        }
      });
    };
    collectFilesWithExtension(fileTree);

    setSelectedFiles((current) => {
      const newSelected = new Set(current);
      if (isCurrentlyActive) {
        // Deactivating filter - uncheck all files with this extension
        filesToUpdate.forEach((path) => newSelected.delete(path));
      } else {
        // Activating filter - check all files with this extension
        filesToUpdate.forEach((path) => newSelected.add(path));
      }
      return newSelected;
    });
  };

  const selectAll = () => {
    const allFilePaths: string[] = [];
    const collectAllFilePaths = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file') {
          allFilePaths.push(node.path);
        }
        if (node.children) {
          collectAllFilePaths(node.children);
        }
      });
    };
    collectAllFilePaths(displayTree);
    setSelectedFiles(new Set(allFilePaths));
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  const expandAll = () => {
    const allDirPaths = new Set<string>();
    const collectDirPaths = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'directory') {
          allDirPaths.add(node.path);
          if (node.children) {
            collectDirPaths(node.children);
          }
        }
      });
    };
    collectDirPaths(displayTree);
    setExpandedFolders(allDirPaths);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const handleGenerateTextFile = async () => {
    setCopyingText(true);
    try {
      await navigator.clipboard.writeText(selectedContent);
      // Show success feedback
      setTimeout(() => setCopyingText(false), 1000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopyingText(false);
    }
  };

  const downloadSelectedFiles = () => {
    const blob = new Blob([selectedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected-files.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSelectedCount = () => {
    return Array.from(selectedFiles).filter((path) => {
      const findNode = (nodes: FileNode[]): FileNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      const node = findNode(fileTree);
      return node?.type === 'file';
    }).length;
  };

  const renderTree = (nodes: FileNode[], level = 0): React.ReactNode => {
    return nodes
      .sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        const isExpanded = expandedFolders.has(node.path);
        let isSelected: boolean | 'indeterminate' = false;

        if (node.type === 'directory') {
          const selectionState = getDirectorySelectionState(node);
          if (selectionState === 'all') {
            isSelected = true;
          } else if (selectionState === 'some') {
            isSelected = 'indeterminate';
          }
        } else {
          isSelected = selectedFiles.has(node.path);
        }

        const isFileTypeFiltered =
          node.type === 'file' && node.extension && !activeFilters.has(node.extension);

        return (
          <div key={node.path} className="select-none">
            <div
              className={cn(
                'flex items-center py-2 px-3 hover:bg-muted/50 rounded-lg group transition-all duration-200',
                level > 0 && 'ml-4',
                isFileTypeFiltered && 'opacity-50',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleFileSelection(node, node.type)}
                className="mr-3 h-4 w-4"
                disabled={isFileTypeFiltered ? true : false}
              />

              {node.type === 'directory' ? (
                <>
                  <button
                    onClick={() => toggleFolder(node.path)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {isExpanded ? (
                      <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{node.name}</span>
                  </button>
                  {node.children && (
                    <Badge variant="secondary" className="text-xs px-2 py-1 rounded-full ml-2">
                      {node.children.length}
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  <div className="w-4 h-4 mr-2 flex-shrink-0" />
                  <File className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{node.name}</span>
                  <div className="flex items-center gap-2 ml-2">
                    {isFileTypeFiltered && <EyeOff className="h-3 w-3 text-muted-foreground" />}
                    {node.extension && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-md',
                          activeFilters.has(node.extension)
                            ? 'border-primary/50 text-primary'
                            : 'border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {node.extension}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>

            {node.type === 'directory' && isExpanded && node.children && (
              <div className="ml-3 border-l-2 border-border/30 pl-3 mt-1">
                {renderTree(node.children, level + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  const totalFiles = useMemo(() => {
    let count = 0;
    const countFiles = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'file') count++;
        if (node.children) countFiles(node.children);
      });
    };
    countFiles(fileTree);
    return count;
  }, [fileTree]);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Left Panel: Controls and File Tree */}
      <div className="w-full md:w-1/2 lg:w-1/3 space-y-4">
        {/* Token Count and Selection Counter */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 flex items-center justify-between flex-wrap gap-4 px-4 py-2 bg-muted/50 rounded-xl border">
            {output ? (
              <div className="flex flex-col gap-4">
                <Badge variant="outline" className="px-3 py-1">
                  Token Count: ~{Math.floor(output.length / 4)}
                </Badge>
                <Link
                  href="https://simonwillison.net/2023/Jun/8/gpt-tokenizers/"
                  target="_blank"
                  className="text-sm text-muted-foreground ml-2"
                >
                  using{' '}
                  <span className="text-blue-600 underline cursor-pointer">
                    cl100k_base tokenizer
                  </span>
                </Link>
              </div>
            ) : null}
            {/* Selection Counter */}
            <div className="flex items-center justify-center sm:justify-end gap-4 px-4 py-2 bg-muted/50 rounded-xl border">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">{getSelectedCount()}</div>
                <div className="text-xs text-muted-foreground">Selected</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <div className="text-lg font-bold">{totalFiles}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files and folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-12 py-3 text-sm rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Quick Controls */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={selectAll} className="text-xs rounded-lg">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll} className="text-xs rounded-lg">
            <Circle className="h-3 w-3 mr-1" />
            Deselect All
          </Button>
          <Button variant="outline" size="sm" onClick={expandAll} className="text-xs rounded-lg">
            <ChevronDown className="h-3 w-3 mr-1" />
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs rounded-lg">
            <ChevronRight className="h-3 w-3 mr-1" />
            Collapse All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs rounded-lg ml-auto"
          >
            <Filter className="h-3 w-3 mr-1" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
        </div>

        {/* File Type Filters - Collapsible */}
        {showFilters && (
          <div className="bg-muted/30 rounded-xl p-4 border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">File Type Filters</h3>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilters(new Set())}
                  className="text-xs h-7"
                >
                  Clear All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilters(new Set(fileExtensions))}
                  className="text-xs h-7"
                >
                  Select All
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {fileExtensions.map((ext) => {
                const isActive = activeFilters.has(ext);
                const totalCount = getFileCount(ext);
                const selectedCount = getSelectedCountForExtension(ext);

                return (
                  <div
                    key={ext}
                    onClick={() => handleExtensionFilterToggle(ext)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 p-1.5 rounded-md border text-xs font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border',
                    )}
                  >
                    <Checkbox
                      checked={isActive}
                      className={cn('h-4 w-4', isActive && 'border-primary-foreground')}
                    />
                    <span className="font-mono">.{ext}</span>
                    <Badge
                      variant={isActive ? 'secondary' : 'outline'}
                      className="text-xs px-1.5 py-0.5"
                    >
                      {selectedCount}/{totalCount}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* File Tree - Main Content */}
        <div className="border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Repository Structure</span>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-4">
            {displayTree.length > 0 ? (
              <div className="space-y-1">{renderTree(displayTree)}</div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-base font-medium">No files match your search</p>
                <p className="text-sm">Try adjusting your search terms</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Output */}
      <div className="w-full md:w-1/2 lg:w-2/3 space-y-4">
        <div className="bg-muted/30 rounded-xl p-4 border border-border sticky top-6">
          <h3 className="text-base font-semibold mb-4">Selected Files Output</h3>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                onClick={handleGenerateTextFile}
                disabled={getSelectedCount() === 0}
                className="flex-1 sm:flex-none h-11 bg-primary hover:bg-primary/90 font-medium rounded-xl shadow-sm"
              >
                {copyingText ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Copy Markdown
                  </>
                )}
              </Button>

              <Button
                onClick={downloadSelectedFiles}
                disabled={getSelectedCount() === 0}
                className="flex-1 sm:flex-none h-11 bg-secondary hover:bg-secondary/90 text-primary shadow-sm font-medium rounded-xl"
              >
                <Download className="h-4 w-4 mr-2" />
                Download as .txt
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-background rounded-xl border border-border p-4 mt-4 max-h-[80vh] overflow-y-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed">
            {selectedContent ? selectedContent : 'No files selected or content available.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
