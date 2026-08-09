'use client';

import type React from 'react';

import type { JSX } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import {
  Folder,
  File,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  CopyCheck,
  Search,
  Expand,
  MinusCircle,
  FolderOpen,
  X,
  FileText,
  Menu,
  GripVertical,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useResultData } from '@/context/ResultDataContext';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

interface CodeViewerProps {
  className?: string;
}

export function CodeViewer({ className }: CodeViewerProps) {
  // Use repoContent from context
  const {
    output: repoContent,
    selectedFilePath,
    setSelectedFilePath,
    selectedFileLine,
  } = useResultData();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'explorer' | 'search'>('explorer');

  // Mobile and responsive states
  const [isMobileExplorerOpen, setIsMobileExplorerOpen] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(320); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Resizable functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Set min and max width constraints
      const minWidth = 240;
      const maxWidth = Math.min(600, containerRect.width * 0.6);

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setExplorerWidth(newWidth);
      }
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add mouse event listeners for resizing
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

  // Parse repository structure from formatted text
  useEffect(() => {
    if (repoContent) {
      try {
        const tree = parseRepositoryStructure(repoContent);
        setFileTree(tree);
        // Auto-expand first level directories for better UX
        const firstLevelDirs = tree
          .filter((node) => node.type === 'directory')
          .map((node) => node.path);
        setExpandedFolders(new Set(firstLevelDirs));
      } catch (error) {
        console.error('Error parsing repo structure:', error);
      }
    }
  }, [repoContent]);

  // Function to handle editor mount
  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  };

  // Highlight selected line when provided via context and reveal it in center
  useEffect(() => {
    if (!editorRef.current || !selectedFile || !selectedFileLine) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const lineNumber = Math.max(1, Math.min(selectedFileLine, lineCount));
    const maxCol = model.getLineMaxColumn(lineNumber);
    editor.setSelection({
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: maxCol,
    });
    editor.revealLineInCenter(lineNumber);
  }, [selectedFile, selectedFileLine]);

  const parseRepositoryStructure = (text: string): FileNode[] => {
    const tree: FileNode[] = [];
    const rootMap: Record<string, FileNode> = {};

    // Extract files and their content
    const fileContentSections = text.split('---\nFile:').slice(1);

    // Process each file
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
      const fileNode: FileNode = {
        name: fileName,
        path: filePath,
        type: 'file',
        content: content,
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

  const expandAllFolders = () => {
    const allPaths = new Set<string>();

    // Recursive function to collect all directory paths
    const collectDirPaths = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        if (node.type === 'directory') {
          allPaths.add(node.path);
          if (node.children) {
            collectDirPaths(node.children);
          }
        }
      });
    };

    collectDirPaths(fileTree);
    setExpandedFolders(allPaths);
  };

  const collapseAllFolders = () => {
    setExpandedFolders(new Set());
  };

  const handleFileSelect = (file: FileNode) => {
    setSelectedFile(file);
    // Close mobile explorer when file is selected
    setIsMobileExplorerOpen(false);
  };

  const copyFileContent = (file: FileNode) => {
    if (file.content) {
      navigator.clipboard.writeText(file.content);
      setCopyStatus((prev) => ({ ...prev, [file.path]: true }));
      setTimeout(() => {
        setCopyStatus((prev) => ({ ...prev, [file.path]: false }));
      }, 2000);
    }
  };

  const copyAllContent = () => {
    const allContent = getAllContent(fileTree);
    navigator.clipboard.writeText(allContent);
    setCopyStatus((prev) => ({ ...prev, all: true }));
    setTimeout(() => {
      setCopyStatus((prev) => ({ ...prev, all: false }));
    }, 2000);
  };

  const getAllContent = (nodes: FileNode[]): string => {
    let content = '';
    nodes.forEach((node) => {
      if (node.type === 'file' && node.content) {
        content += `// File: ${node.path}\n${node.content}\n\n`;
      } else if (node.type === 'directory' && node.children) {
        content += getAllContent(node.children);
      }
    });
    return content;
  };

  const copyFolderContent = (folderNode: FileNode) => {
    const folderContent = getFolderContent(folderNode);
    navigator.clipboard.writeText(folderContent);
    setCopyStatus((prev) => ({ ...prev, [folderNode.path]: true }));
    setTimeout(() => {
      setCopyStatus((prev) => ({ ...prev, [folderNode.path]: false }));
    }, 2000);
  };

  const getFolderContent = (folderNode: FileNode): string => {
    let content = `// Folder: ${folderNode.path}\n\n`;

    const processNode = (node: FileNode) => {
      if (node.type === 'file' && node.content) {
        content += `// File: ${node.path}\n${node.content}\n\n`;
      } else if (node.type === 'directory' && node.children) {
        node.children.forEach(processNode);
      }
    };

    if (folderNode.children) {
      folderNode.children.forEach(processNode);
    }

    return content;
  };

  // Determine language based on file extension
  const getLanguage = (filePath: string): string => {
    const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
      sh: 'shell',
      bash: 'shell',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rb: 'ruby',
      php: 'php',
      rust: 'rust',
      rs: 'rust',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
    };

    return languageMap[fileExtension] || 'plaintext';
  };

  // Filter files by search term
  const filterFilesBySearch = (nodes: FileNode[]): FileNode[] => {
    if (!searchTerm) return [];

    const results: FileNode[] = [];
    const searchLower = searchTerm.toLowerCase();

    const searchNodes = (nodeList: FileNode[]) => {
      nodeList.forEach((node) => {
        if (node.name.toLowerCase().includes(searchLower)) {
          results.push(node);
        }
        if (
          node.type === 'file' &&
          node.content &&
          node.content.toLowerCase().includes(searchLower)
        ) {
          if (!results.includes(node)) {
            results.push(node);
          }
        }
        if (node.type === 'directory' && node.children) {
          searchNodes(node.children);
        }
      });
    };

    searchNodes(nodes);
    return results;
  };

  // Auto-select file and expand folders when selectedFilePath changes
  useEffect(() => {
    if (!selectedFilePath || !fileTree.length) return;

    // Helper to find file node and collect parent paths
    const findFileAndParents = (
      nodes: FileNode[],
      targetPath: string,
      parents: string[] = [],
    ): { file: FileNode | null; parentPaths: string[] } => {
      for (const node of nodes) {
        if (node.type === 'file' && node.path === targetPath) {
          return { file: node, parentPaths: [...parents] };
        }
        if (node.type === 'directory' && node.children) {
          const result = findFileAndParents(node.children, targetPath, [...parents, node.path]);
          if (result.file) return result;
        }
      }
      return { file: null, parentPaths: [] };
    };

    const { file, parentPaths } = findFileAndParents(fileTree, selectedFilePath);
    if (file) {
      setSelectedFile(file);
      setActiveTab('explorer'); // Switch to explorer tab so user sees the file
      setExpandedFolders((prev) => {
        const newSet = new Set(prev);
        parentPaths.forEach((p) => newSet.add(p));
        return newSet;
      });
      // Optionally scroll to file in explorer
      setTimeout(() => {
        if (explorerRef.current) {
          const el = explorerRef.current.querySelector(`[data-file-path="${file.path}"]`);
          if (el && 'scrollIntoView' in el) {
            (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }
      }, 100);
      // Clear selectedFilePath to avoid future collision
      setTimeout(() => setSelectedFilePath?.(null), 200);
    }
  }, [selectedFilePath, fileTree, setSelectedFilePath]);

  const renderTree = (nodes: FileNode[], level = 0): JSX.Element[] => {
    return nodes
      .sort((a, b) => {
        // Sort directories first, then files
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        const isExpanded = expandedFolders.has(node.path);
        const isSelected = selectedFile?.path === node.path;

        if (node.type === 'directory') {
          return (
            <div key={node.path}>
              <div
                className={cn(
                  'flex items-center py-2 px-2 sm:px-3 cursor-pointer hover:bg-muted/50 rounded-lg sm:rounded-xl group transition-all duration-200',
                  level > 0 && 'ml-2 sm:ml-3',
                )}
                onClick={() => toggleFolder(node.path)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 flex-shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 flex-shrink-0 text-muted-foreground" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-500 flex-shrink-0" />
                ) : (
                  <Folder className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-500 flex-shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-medium truncate flex-grow">
                  {node.name}
                </span>
                <div className="flex items-center gap-1">
                  {node.children && (
                    <Badge
                      variant="secondary"
                      className="text-xs px-1.5 py-0.5 rounded-full hidden sm:inline-flex"
                    >
                      {node.children.length}
                    </Badge>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg hover:bg-background/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyFolderContent(node);
                            }}
                            aria-label="Copy folder content"
                          >
                            {copyStatus[node.path] ? (
                              <CopyCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy Folder Content</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
              {isExpanded && node.children && (
                <div className="ml-1 sm:ml-2 border-l border-border/30 pl-1 sm:pl-2 mt-1">
                  {renderTree(node.children, level + 1)}
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div key={node.path} className="group" data-file-path={node.path}>
              <div
                className={cn(
                  'flex items-center py-2 px-2 sm:px-3 cursor-pointer hover:bg-muted/50 rounded-lg sm:rounded-xl transition-all duration-200',
                  level > 0 && 'ml-2 sm:ml-3',
                  isSelected && 'bg-primary/10 text-primary border border-primary/20',
                )}
                onClick={() => handleFileSelect(node)}
              >
                <File className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 flex-shrink-0 text-muted-foreground" />
                <span className="text-xs sm:text-sm truncate flex-grow">{node.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {node.content && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1 py-0.5 rounded-md hidden sm:inline-flex"
                    >
                      {node.content.split('\n').length}L
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg hover:bg-background/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyFileContent(node);
                    }}
                    aria-label="Copy file content"
                  >
                    {copyStatus[node.path] ? (
                      <CopyCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        }
      });
  };

  const renderSearchResults = () => {
    const results = filterFilesBySearch(fileTree);
    if (results.length === 0) {
      return (
        <div className="p-4 text-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl sm:rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <Search className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-foreground">No results found</p>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search terms</p>
        </div>
      );
    }

    return (
      <div className="space-y-1 p-2">
        {results.map((file) => (
          <div
            key={file.path}
            className="p-2 sm:p-3 cursor-pointer hover:bg-muted/50 rounded-lg sm:rounded-xl flex items-center transition-all duration-200 group"
            onClick={() => handleFileSelect(file)}
          >
            {file.type === 'file' ? (
              <File className="w-3 h-3 sm:w-4 sm:h-4 mr-2 sm:mr-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <Folder className="w-3 h-3 sm:w-4 sm:h-4 mr-2 sm:mr-3 text-blue-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground truncate">{file.path}</p>
            </div>
            {file.type === 'file' && file.content && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0.5 rounded-md ml-2 hidden sm:inline-flex"
              >
                {file.content.split('\n').length}L
              </Badge>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full bg-background/60 backdrop-blur-xl rounded-xl sm:rounded-2xl overflow-hidden relative',
        className,
      )}
    >
      {/* Mobile Explorer Overlay */}
      {isMobileExplorerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="h-full w-full max-w-sm bg-background border-r border-border/30 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <h3 className="font-semibold text-sm">File Explorer</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileExplorerOpen(false)}
                className="h-8 w-8 rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              {/* Mobile Explorer Content - Same as desktop but in overlay */}
              <div className="flex flex-col h-full">
                {/* Tab Navigation */}
                <div className="flex-shrink-0 p-3 border-b border-border/30">
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'explorer' | 'search')}
                  >
                    <TabsList className="grid w-full grid-cols-2 bg-muted/30 backdrop-blur-sm rounded-xl">
                      <TabsTrigger
                        value="explorer"
                        className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
                      >
                        <Folder className="w-3 h-3 mr-1" />
                        Explorer
                      </TabsTrigger>
                      <TabsTrigger
                        value="search"
                        className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs"
                      >
                        <Search className="w-3 h-3 mr-1" />
                        Search
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Tab Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'explorer' | 'search')}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <TabsContent
                      value="explorer"
                      className="flex-1 flex flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                    >
                      {/* Explorer Actions */}
                      <div className="flex-shrink-0 p-3 border-b border-border/30 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          PROJECT FILES
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg"
                            onClick={expandAllFolders}
                          >
                            <Expand className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg"
                            onClick={collapseAllFolders}
                          >
                            <MinusCircle className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg"
                            onClick={copyAllContent}
                          >
                            {copyStatus.all ? (
                              <CopyCheck className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* File Tree */}
                      <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        {fileTree.length > 0 ? (
                          <div className="p-2">{renderTree(fileTree)}</div>
                        ) : (
                          <div className="p-4 text-center">
                            <div className="w-10 h-10 mx-auto rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                              <FileText className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                            <p className="text-xs font-medium text-foreground">
                              No files to display
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Upload a repository to get started
                            </p>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="search"
                      className="flex-1 flex flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                    >
                      {/* Search Input */}
                      <div className="flex-shrink-0 p-3 border-b border-border/30">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search files..."
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/50 border border-border/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                          {searchTerm && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-lg"
                              onClick={() => setSearchTerm('')}
                            >
                              <X className="w-2.5 h-2.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Search Results */}
                      <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        {searchTerm ? (
                          renderSearchResults()
                        ) : (
                          <div className="p-4 text-center">
                            <div className="w-10 h-10 mx-auto rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                              <Search className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                            <p className="text-xs font-medium text-foreground">
                              Search through files
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Type to search file names and content
                            </p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop File Explorer Sidebar */}
      <div
        className={cn(
          'hidden lg:flex flex-col border-r border-border/30 bg-background/40 backdrop-blur-sm transition-all duration-300',
          isExplorerCollapsed ? 'w-12' : '',
        )}
        style={{
          width: isExplorerCollapsed ? '48px' : `${explorerWidth}px`,
          minWidth: isExplorerCollapsed ? '48px' : '240px',
          maxWidth: isExplorerCollapsed ? '48px' : '600px',
        }}
      >
        {isExplorerCollapsed ? (
          // Collapsed state
          <div className="flex flex-col items-center p-2 gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExplorerCollapsed(false)}
              className="h-8 w-8 rounded-lg"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveTab('explorer')}
              className={cn('h-8 w-8 rounded-lg', activeTab === 'explorer' && 'bg-primary/10')}
            >
              <Folder className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveTab('search')}
              className={cn('h-8 w-8 rounded-lg', activeTab === 'search' && 'bg-primary/10')}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Expanded state
          <>
            {/* Tab Navigation */}
            <div className="flex-shrink-0 p-3 border-b border-border/30">
              <div className="flex items-center justify-between mb-3">
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as 'explorer' | 'search')}
                >
                  <TabsList className="grid w-full grid-cols-2 bg-muted/30 backdrop-blur-sm rounded-xl">
                    <TabsTrigger
                      value="explorer"
                      className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <Folder className="w-4 h-4 mr-1.5" />
                      Explorer
                    </TabsTrigger>
                    <TabsTrigger
                      value="search"
                      className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <Search className="w-4 h-4 mr-1.5" />
                      Search
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExplorerCollapsed(true)}
                  className="h-6 w-6 rounded-lg ml-2"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'explorer' | 'search')}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <TabsContent
                  value="explorer"
                  className="flex-1 flex flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                >
                  {/* Explorer Actions */}
                  <div className="flex-shrink-0 p-3 border-b border-border/30 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">PROJECT FILES</span>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-lg"
                              onClick={expandAllFolders}
                            >
                              <Expand className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Expand All</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-lg"
                              onClick={collapseAllFolders}
                            >
                              <MinusCircle className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Collapse All</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-lg"
                              onClick={copyAllContent}
                            >
                              {copyStatus.all ? (
                                <CopyCheck className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy All Content</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {/* File Tree */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={explorerRef}>
                    {fileTree.length > 0 ? (
                      <div className="p-2">{renderTree(fileTree)}</div>
                    ) : (
                      <div className="p-4 text-center">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                          <FileText className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No files to display</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload a repository to get started
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="search"
                  className="flex-1 flex flex-col overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
                >
                  {/* Search Input */}
                  <div className="flex-shrink-0 p-3 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search files and content..."
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-muted/50 border border-border/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-lg"
                          onClick={() => setSearchTerm('')}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Search Results */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {searchTerm ? (
                      renderSearchResults()
                    ) : (
                      <div className="p-4 text-center">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                          <Search className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Search through files</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Type to search file names and content
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>

      {/* Resize Handle - Desktop only */}
      {!isExplorerCollapsed && (
        <div
          ref={resizeHandleRef}
          className="hidden lg:block w-1 bg-border/30 hover:bg-primary/50 cursor-col-resize transition-colors duration-200 relative group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Code Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-3 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMobileExplorerOpen(true)}
            className="h-8 gap-2 text-xs rounded-lg"
          >
            <Menu className="h-3 w-3" />
            Files
          </Button>
          {selectedFile && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 rounded-md bg-primary/10 flex-shrink-0">
                <File className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-medium truncate">{selectedFile.name}</span>
            </div>
          )}
        </div>

        {selectedFile ? (
          <>
            {/* Desktop File Header */}
            <div className="hidden lg:block flex-shrink-0 p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
                    <File className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedFile.path}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs px-2 py-1 rounded-lg">
                    {getLanguage(selectedFile.path)}
                  </Badge>
                  {selectedFile.content && (
                    <Badge variant="secondary" className="text-xs px-2 py-1 rounded-lg">
                      {selectedFile.content.split('\n').length} lines
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 text-xs rounded-lg"
                    onClick={() => copyFileContent(selectedFile)}
                  >
                    {copyStatus[selectedFile.path] ? (
                      <>
                        <CopyCheck className="w-3 h-3 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 bg-background/20 overflow-hidden">
              <Editor
                height="100%"
                language={getLanguage(selectedFile.path)}
                value={selectedFile.content}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  // minimap: { enabled: window.innerWidth > 768 }, // Disable minimap on mobile
                  minimap: { enabled: false }, // Disable minimap on mobile
                  scrollBeyondLastLine: false,
                  fontSize: window.innerWidth > 768 ? 14 : 12, // Smaller font on mobile
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  scrollbar: {
                    useShadows: true,
                    verticalHasArrows: false,
                    horizontalHasArrows: false,
                    vertical: 'visible',
                    horizontal: 'visible',
                  },
                  padding: { top: 16, bottom: 16 },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  renderWhitespace: 'selection',
                  wordWrap: window.innerWidth > 768 ? 'off' : 'on', // Enable word wrap on mobile
                }}
                onMount={handleEditorDidMount}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 p-8">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-muted/50 flex items-center justify-center">
                <Code className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50" />
              </div>
              <div className="space-y-2">
                <h3 className="font-medium text-foreground text-sm sm:text-base">
                  Select a file to view
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
                  Choose a file from the explorer to view its contents with syntax highlighting
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMobileExplorerOpen(true)}
                  className="lg:hidden mt-4 gap-2 text-xs rounded-lg"
                >
                  <Menu className="h-3 w-3" />
                  Open File Explorer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
