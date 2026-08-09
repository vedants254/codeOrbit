'use client';

import type React from 'react';
import Image from 'next/image';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Lock,
  Loader2,
  BookOpen,
  ChevronRight,
  Folder,
  FolderOpen,
  Link,
  Clock,
  Eye,
  X,
  Menu,
  Hash,
  Sparkles,
  GripVertical,
  List,
  Settings,
  RefreshCw,
  Zap,
  Brain,
  RotateCcw,
  Pause,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  isWikiGenerated,
  generateWikiDocumentation,
  getWikiGenerationStatus,
  getRepositoryDocumentation,
  getAvailableModels,
  cancelWikiGeneration,
} from '@/utils/api';
import type { AvailableModelsResponse } from '@/api-client/types.gen';
import { useDocumentationProgress } from '@/lib/sse-client';
import { useApiKeyValidation } from '@/hooks/use-api-key-validation';
import { ApiKeyModal } from './api-key-modal';

// Markdown and Syntax Highlighting imports
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Types
interface HeaderInfo {
  id: string;
  text: string;
  level: number;
  element?: HTMLElement;
}

interface FileNode {
  type: 'file' | 'folder';
  name: string;
  path: string;
  file_count?: number;
  children?: FileNode[];
}

interface ContentMetadata {
  filename?: string;
  size?: number;
  modified?: string;
}

interface DocContent {
  content?: string;
  preview?: string;
  metadata?: ContentMetadata;
  read_time?: number;
  word_count?: number;
}

interface AnalysisData {
  domain_type?: string;
  complexity_score?: string;
  languages?: string;
  total_pages?: number;
}

interface Documentation {
  success: boolean;
  data?: {
    content: Record<string, DocContent>;
    folder_structure: FileNode[];
    analysis?: AnalysisData;
    repository?: { name?: string };
  };
  message?: string;
}

interface DocumentationTabProps {
  currentRepoId: string;
  sourceData: {
    repo_url?: string;
  };
  sourceType: string;
  userKeyPreferences?: Record<string, boolean>;
}

interface GenerationSettings {
  provider: string;
  model: string;
  temperature: number;
  comprehensive: boolean;
  language: string;
}

// Helper function moved outside the component
const findFileInTree = (
  nodes: FileNode[],
  predicate: (node: FileNode) => boolean,
): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && predicate(node)) {
      return node;
    }
    if (node.type === 'folder' && node.children) {
      const found = findFileInTree(node.children, predicate);
      if (found) return found;
    }
  }
  return null;
};

// Mermaid Diagram Component
interface MermaidDiagramProps {
  code: string;
}

const MermaidDiagram = ({ code }: MermaidDiagramProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hasRendered, setHasRendered] = useState(false);
  const [, setError] = useState(false);

  useEffect(() => {
    setHasRendered(false);
    setError(false);
  }, [code]);

  useEffect(() => {
    if (ref.current && code && !hasRendered) {
      import('mermaid').then((mermaid) => {
        mermaid.default.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#3b82f6',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#e2e8f0',
            lineColor: '#64748b',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#f8fafc',
            background: '#ffffff',
            mainBkg: '#ffffff',
            secondBkg: '#f8fafc',
            tertiaryBkg: '#f1f5f9',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '14px',
          },
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
          sequence: { useMaxWidth: true, wrap: true },
          gantt: { useMaxWidth: true },
        });

        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        if (ref.current) {
          ref.current.innerHTML = `<div id="${id}" class="mermaid-container">${code}</div>`;
        }

        try {
          if (ref.current) {
            const el = ref.current.querySelector(`#${id}`);
            if (el instanceof HTMLElement) {
              mermaid.default.run({ nodes: [el] });
            }
          }
          setHasRendered(true);
        } catch (e) {
          setError(true);
          if (ref.current) {
            ref.current.innerHTML = `
              <div class="p-4 text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  <span class="font-medium">Diagram Error</span>
                </div>
                <p class="text-sm">Unable to render this Mermaid diagram. Please check the syntax.</p>
              </div>
            `;
          }
          console.error('Mermaid rendering error:', e);
        }
      });
    }
  }, [code, hasRendered]);

  return (
    <div className="my-6 w-full overflow-x-auto">
      <div
        ref={ref}
        className="flex justify-center items-center min-h-[200px] p-6 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"
        style={{ minWidth: 'fit-content' }}
      />
    </div>
  );
};

// Markdown Renderer Component
interface MarkdownRendererProps {
  content: string;
  onNavItemClick: (filePath: string) => void;
  onHeadersExtracted?: (headers: HeaderInfo[]) => void;
}

const MarkdownRenderer = ({
  content,
  onNavItemClick,
  onHeadersExtracted,
}: MarkdownRendererProps) => {
  const markdownRef = useRef<HTMLDivElement>(null);

  // Extract headers from content for navigation
  useEffect(() => {
    if (markdownRef.current && onHeadersExtracted) {
      const headerElements = markdownRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headerInfo: HeaderInfo[] = Array.from(headerElements).map((el, index) => ({
        id: el.id || `header-${index}`,
        text: el.textContent || '',
        level: parseInt(el.tagName.charAt(1)),
        element: el as HTMLElement,
      }));
      onHeadersExtracted(headerInfo);
    }
  }, [content, onHeadersExtracted]);

  const components: Components = {
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const href = props.href || '';
      if (href.startsWith('http')) {
        return (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            {props.children}
            <Link className="w-3 h-3" />
          </a>
        );
      }
      if (href.endsWith('.md')) {
        const filePath = href.replace('./', '').replace('.md', '');
        return (
          <a
            {...props}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavItemClick(filePath);
            }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-medium"
          />
        );
      }
      return (
        <a
          {...props}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
        />
      );
    },
    code(props: React.ComponentProps<'code'> & { inline?: boolean }) {
      const { inline, className, children } = props;
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';

      if (lang === 'mermaid') {
        return <MermaidDiagram code={String(children).trim()} />;
      }

      return !inline && lang ? (
        <div className="my-4 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={lang}
            PreTag="div"
            className="!m-0 !bg-slate-900"
            customStyle={{ fontSize: '14px', lineHeight: '1.5', padding: '1rem' }}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1 rounded-md text-sm font-mono">
          {children}
        </code>
      );
    },
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = props.id || `h1-${Math.random().toString(36).substring(2, 11)}`;
      return (
        <h1
          {...props}
          id={id}
          className="text-3xl font-bold mt-6 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 scroll-mt-4"
        />
      );
    },
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = props.id || `h2-${Math.random().toString(36).substring(2, 11)}`;
      return (
        <h2
          {...props}
          id={id}
          className="text-2xl font-semibold mt-5 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 scroll-mt-4"
        />
      );
    },
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = props.id || `h3-${Math.random().toString(36).substring(2, 11)}`;
      return (
        <h3
          {...props}
          id={id}
          className="text-xl font-semibold mt-4 mb-2 text-slate-900 dark:text-slate-100 scroll-mt-4"
        />
      );
    },
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="list-disc pl-6 my-3 space-y-1 text-slate-700 dark:text-slate-300" {...props} />
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="leading-7 my-3 text-slate-700 dark:text-slate-300" {...props} />
    ),
    blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
      <blockquote
        className="pl-4 italic border-l-4 border-blue-500 my-4 bg-blue-50 dark:bg-blue-950/20 py-2 text-slate-700 dark:text-slate-300"
        {...props}
      />
    ),
    table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="overflow-x-auto my-4">
        <table
          className="min-w-full border-collapse border border-slate-200 dark:border-slate-700"
          {...props}
        />
      </div>
    ),
    th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
      <th
        className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-left font-semibold text-slate-900 dark:text-slate-100"
        {...props}
      />
    ),
    td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td
        className="border border-slate-200 dark:border-slate-700 px-4 py-2 text-slate-700 dark:text-slate-300"
        {...props}
      />
    ),

    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <Image
        className="max-w-full h-auto rounded-lg shadow-md my-4"
        alt={props.alt || ''}
        src={typeof props.src === 'string' ? props.src : ''}
        width={props.width ? Number(props.width) : 800}
        height={props.height ? Number(props.height) : 600}
        style={{ width: 'auto', height: 'auto' }}
      />
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr className="my-6 border-slate-200 dark:border-slate-700" {...props} />
    ),
  };

  return (
    <div ref={markdownRef}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// File Tree Component
interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (node: FileNode) => void;
  activePath: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (folderPath: string) => void;
  level?: number;
}

const FileTree = ({
  nodes,
  onFileClick,
  activePath,
  expandedFolders,
  toggleFolder,
  level = 0,
}: FileTreeProps) => {
  if (!nodes || nodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {nodes.map((node: FileNode) => {
        if (node.type === 'folder') {
          const isExpanded = expandedFolders.has(node.path);
          return (
            <div key={node.path}>
              <button
                onClick={() => toggleFolder(node.path)}
                className="w-full text-left p-2 rounded-lg flex items-center gap-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                style={{ paddingLeft: `${0.5 + level * 1}rem` }}
              >
                <ChevronRight
                  className={cn('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-90')}
                />
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0" />
                )}
                <span className="font-medium truncate flex-1">{node.name}</span>
                <span className="text-xs text-muted-foreground">{node.file_count}</span>
              </button>
              {isExpanded && (
                <FileTree
                  nodes={node.children || []}
                  onFileClick={onFileClick}
                  activePath={activePath}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  level={level + 1}
                />
              )}
            </div>
          );
        } else {
          // file
          return (
            <button
              key={node.path}
              onClick={() => onFileClick(node)}
              className={cn(
                'w-full text-left p-2 rounded-lg flex items-center gap-2 text-sm transition-colors',
                activePath === node.path
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              style={{ paddingLeft: `${0.5 + level * 1.5}rem` }}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{node.name}</span>
            </button>
          );
        }
      })}
    </div>
  );
};

// Main Documentation Tab Component
export default function Documentation({
  currentRepoId,
  sourceData,
  sourceType,
  userKeyPreferences = {},
}: DocumentationTabProps) {
  const { data: session } = useSession();
  const apiKeyValidation = useApiKeyValidation();

  // Suppress unused variable warning
  void userKeyPreferences;
  const hasValidApiKeys = apiKeyValidation.userHasKeys.length > 0;
  const [isDocGenerated, setIsDocGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('');

  // Documentation display states
  const [documentation, setDocumentation] = useState<Documentation | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [activeContent, setActiveContent] = useState<DocContent | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [headers, setHeaders] = useState<HeaderInfo[]>([]);
  const [activeHeaderId, setActiveHeaderId] = useState<string>('');
  const [isRightNavCollapsed, setIsRightNavCollapsed] = useState(false);
  const [rightNavWidth, setRightNavWidth] = useState(256); // 16rem = 256px
  const [leftNavWidth, setLeftNavWidth] = useState(220); // 13.75rem = 220px (slightly increased)
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Enhanced generation states
  const [availableModels, setAvailableModels] = useState<AvailableModelsResponse | null>(null);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    comprehensive: true,
    language: 'en',
  });
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  // SSE progress streaming
  const {
    progressUpdates: sseUpdates,
    currentStatus: sseStatus,
    currentMessage: sseMessage,
    isStreaming,
    error: sseError,
    stopStreaming,
    clearProgress,
  } = useDocumentationProgress(currentTaskId);

  // Helper functions
  const getAncestorPaths = (path: string): Set<string> => {
    const parts = path.split('/');
    const ancestors = new Set<string>();
    for (let i = 1; i < parts.length; i++) {
      ancestors.add(parts.slice(0, i).join('/'));
    }
    return ancestors;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTitle = (filename?: string) => {
    if (!filename) return 'Documentation';
    // Remove .md extension and capitalize
    const cleanName = filename.replace(/\.md$/, '');
    return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  };

  // Handle resize functionality for both sidebars
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = resizeRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      if (isResizingRight) {
        const newWidth = containerRect.right - e.clientX;
        const minWidth = 200;
        const maxWidth = containerRect.width * 0.3;
        setRightNavWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
      }

      if (isResizingLeft) {
        const newWidth = e.clientX - containerRect.left;
        const minWidth = 160;
        const maxWidth = containerRect.width * 0.3;
        setLeftNavWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingRight(false);
      setIsResizingLeft(false);
    };

    if (isResizingRight || isResizingLeft) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingRight, isResizingLeft]);

  // Load available models
  const loadAvailableModels = useCallback(async () => {
    if (!session?.jwt_token) return;
    try {
      const models = await getAvailableModels(session?.jwt_token || undefined);
      setAvailableModels(models);

      // Choose provider preference: if user has keys, limit to those; otherwise show all
      const preferredProviders =
        models.user_has_keys && models.user_has_keys.length > 0
          ? models.user_has_keys
          : Object.keys(models.providers);
      const firstProvider = preferredProviders.find((p) => (models.providers[p] || []).length > 0);
      const firstModel = firstProvider ? models.providers[firstProvider]?.[0] : undefined;

      // If current provider is not available or not in preferred list, switch to preferred
      const currentProvider = generationSettings.provider;
      const currentModel = generationSettings.model;
      const providerIsAllowed = firstProvider
        ? preferredProviders.includes(currentProvider) &&
          (models.providers[currentProvider] || []).length > 0
        : false;
      const modelIsAllowed =
        providerIsAllowed && (models.providers[currentProvider] || []).includes(currentModel);

      if (!providerIsAllowed && firstProvider && firstModel) {
        setGenerationSettings((prev) => ({
          ...prev,
          provider: firstProvider,
          model: firstModel,
        }));
      } else if (
        providerIsAllowed &&
        !modelIsAllowed &&
        (models.providers[currentProvider] || []).length > 0
      ) {
        setGenerationSettings((prev) => ({
          ...prev,
          model: models.providers[currentProvider][0],
        }));
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }, [session?.jwt_token, generationSettings.provider]);

  // Check documentation status
  const checkDocumentationStatus = useCallback(async () => {
    try {
      if (!session?.jwt_token || !currentRepoId) {
        setInitializing(false);
        return;
      }

      const wikiResponse = await isWikiGenerated(session?.jwt_token || undefined, currentRepoId);
      setIsDocGenerated(wikiResponse.is_generated);
      setCurrentStatus(wikiResponse.status);

      if (wikiResponse.error) {
        setError('Try again later or contact support');
      } else {
        setError(null);
      }

      if (wikiResponse.status === 'running' || wikiResponse.status === 'pending') {
        setIsGenerating(true);
      }

      setInitializing(false);
    } catch (err) {
      console.error('Error checking documentation status:', err);
      setError('Failed to check documentation status');
      setInitializing(false);
    }
  }, [session?.jwt_token, currentRepoId]);

  // Handle navigation item click
  const handleNavItemClick = useCallback(
    (item: FileNode | string, docs: Documentation | null = documentation) => {
      if (!docs || !docs.data || !docs.data.content) return;

      let fileItem: FileNode | null = null;
      if (typeof item === 'string') {
        fileItem = findFileInTree(docs.data.folder_structure, (node) => node.path === item);
        if (!fileItem) {
          console.warn(`Could not find file for path: ${item}`);
          return;
        }
      } else {
        fileItem = item;
      }

      if (fileItem && docs.data.content?.[fileItem.path]) {
        setActiveContent(docs.data.content[fileItem.path]);
        setActivePath(fileItem.path);
        setSidebarOpen(false);
        setHeaders([]);
        setActiveHeaderId('');
        // Reset scroll position
        if (contentRef.current) {
          contentRef.current.scrollTo({ top: 0 });
        }
      }
    },
    [documentation],
  );

  // Handle header extraction
  const handleHeadersExtracted = useCallback((extractedHeaders: HeaderInfo[]) => {
    setHeaders(extractedHeaders);
    if (extractedHeaders.length > 0) {
      setActiveHeaderId(extractedHeaders[0].id);
    }
  }, []);

  // Handle header click for smooth scrolling
  const handleHeaderClick = useCallback((headerId: string) => {
    const element = document.getElementById(headerId);
    if (element && contentRef.current) {
      const container = contentRef.current;
      const targetOffset = element.offsetTop - container.offsetTop - 60;
      container.scrollTo({ top: targetOffset, behavior: 'smooth' });
      setActiveHeaderId(headerId);
    }
  }, []);

  // Track scroll position for active header within content area
  useEffect(() => {
    const handleScroll = () => {
      if (headers.length === 0 || !contentRef.current) return;

      const container = contentRef.current;
      const scrollPosition = container.scrollTop + 80;
      let activeId = headers[0].id;

      for (const header of headers) {
        const element = document.getElementById(header.id);
        if (element && element.offsetTop - container.offsetTop <= scrollPosition) {
          activeId = header.id;
        }
      }

      setActiveHeaderId(activeId);
    };

    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [headers]);

  // Fetch documentation content
  const fetchDocumentation = useCallback(async () => {
    if (!session?.jwt_token || !currentRepoId || !isDocGenerated) return;

    try {
      setLoading(true);
      const docs = await getRepositoryDocumentation(session?.jwt_token || undefined, currentRepoId);

      if (!docs || !docs.success || !docs.data) {
        throw new Error(docs?.message || 'Invalid documentation format received.');
      }

      setDocumentation(docs);

      if (docs.data?.content && docs.data?.folder_structure) {
        const initialFile =
          findFileInTree(
            docs.data.folder_structure,
            (file) => file.path.toLowerCase() === 'readme',
          ) ||
          findFileInTree(
            docs.data.folder_structure,
            (file) => file.name.toLowerCase() === 'readme',
          ) ||
          findFileInTree(
            docs.data.folder_structure,
            (file) => file.path.toLowerCase() === 'index',
          ) ||
          findFileInTree(
            docs.data.folder_structure,
            (file) => file.name.toLowerCase() === 'index',
          ) ||
          findFileInTree(docs.data.folder_structure, (file) => file.type === 'file');

        if (initialFile) {
          handleNavItemClick(initialFile, docs);
          setExpandedFolders(getAncestorPaths(initialFile.path));
        }
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to fetch documentation');
    } finally {
      setLoading(false);
    }
  }, [session?.jwt_token, currentRepoId, isDocGenerated, handleNavItemClick]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  // Generate documentation, passing selectedModel from props to the API
  const handleGenerateDocumentation = async () => {
    if (!session?.jwt_token || !currentRepoId || !sourceData) return;

    // Check for API keys before generating documentation
    const canProceed = await apiKeyValidation.checkApiKeysBeforeAction();
    if (!canProceed) return;

    try {
      setIsGenerating(true);
      setError(null);
      setCurrentStatus('pending');

      let repositoryUrl = '';
      if (sourceType === 'github' && sourceData.repo_url) {
        repositoryUrl = sourceData.repo_url;
      } else {
        throw new Error('Repository URL not available');
      }

      const response = await generateWikiDocumentation(
        session?.jwt_token || undefined,
        repositoryUrl,
        generationSettings.language,
        generationSettings.comprehensive,
        generationSettings.provider,
        generationSettings.model,
        generationSettings.temperature,
      );

      // Start SSE streaming if we got a task ID
      if (response.task_id) {
        setCurrentTaskId(response.task_id);
        setCanCancel(true);
        clearProgress(); // Clear any existing progress
      }
    } catch (err) {
      console.error('Error generating documentation:', err);
      setIsGenerating(false);
      setCanCancel(false);
      setCurrentTaskId(null);

      // Enhanced error handling with user guidance
      let errorMessage = 'Failed to generate documentation';
      let actionableAdvice = '';

      if (err instanceof Error) {
        errorMessage = err.message;

        // Provider-specific error guidance
        if (errorMessage.toLowerCase().includes('rate limit')) {
          actionableAdvice =
            ' Try switching to a different AI provider or wait a few minutes before retrying.';
        } else if (
          errorMessage.toLowerCase().includes('authentication') ||
          errorMessage.toLowerCase().includes('api key') ||
          errorMessage.toLowerCase().includes('no api key')
        ) {
          actionableAdvice = ' Please add a valid API key in Settings.';
          // Show API key modal for immediate action
          apiKeyValidation.setShowApiKeyModal(true);
        } else if (
          errorMessage.toLowerCase().includes('quota') ||
          errorMessage.toLowerCase().includes('billing')
        ) {
          actionableAdvice = ' Check your API provider billing status and usage limits.';
        } else if (errorMessage.toLowerCase().includes('model')) {
          actionableAdvice = ' Try selecting a different model or provider.';
        }
      }

      setError(errorMessage + actionableAdvice);
    }
  };

  // Effects
  useEffect(() => {
    if (session?.jwt_token && currentRepoId) {
      loadAvailableModels();
      checkDocumentationStatus();
    } else {
      setInitializing(false);
    }
  }, [session?.jwt_token, currentRepoId, checkDocumentationStatus, loadAvailableModels]);

  // Handle SSE completion
  useEffect(() => {
    if (sseStatus === 'completed') {
      setIsGenerating(false);
      setCanCancel(false);
      setCurrentTaskId(null);
      fetchDocumentation(); // Reload documentation data
    } else if (sseStatus === 'failed') {
      setIsGenerating(false);
      setCanCancel(false);
      setCurrentTaskId(null);
      if (sseError) {
        setError(sseError);
      }
    }
  }, [sseStatus, sseError, fetchDocumentation]);

  useEffect(() => {
    if (isDocGenerated && !documentation && !loading) {
      fetchDocumentation();
    }
  }, [isDocGenerated, documentation, loading, fetchDocumentation]);

  // Status polling with reduced frequency
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isGenerating && session?.jwt_token && currentRepoId) {
      interval = setInterval(async () => {
        try {
          setIsCheckingStatus(true);
          const statusResponse = await getWikiGenerationStatus(
            session?.jwt_token || undefined,
            currentRepoId,
          );
          setCurrentStatus(statusResponse.status);

          if (statusResponse.status === 'completed') {
            setIsGenerating(false);
            setIsDocGenerated(true);
            setError(null);
          } else if (statusResponse.status === 'failed') {
            setIsGenerating(false);
            setError('Please Provide Valid API Key for the selected model or try again later');
            // Show API key modal for immediate action
            apiKeyValidation.setShowApiKeyModal(true);
          }
        } catch (err) {
          console.error('Error checking status:', err);
        } finally {
          setIsCheckingStatus(false);
        }
      }, 8000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, session?.jwt_token, currentRepoId]);

  // Show initial loading state
  if (initializing) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Loading Left Sidebar */}
        <div className="w-80 xl:w-96 border-r border-border/30 p-6 bg-background/50 backdrop-blur-sm flex-shrink-0">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-4 w-4 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-32" />
            </div>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-3 w-3 bg-muted/30 rounded animate-pulse" />
                  <div
                    className="h-3 bg-muted/30 rounded animate-pulse"
                    style={{ width: `${60 + Math.random() * 40}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loading Main Content */}
        <div className="flex-1 flex items-center justify-center bg-background/20">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-background/80 backdrop-blur-2xl border border-border/50 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <h3 className="font-medium text-foreground">Initializing Documentation</h3>
              <p className="text-sm text-muted-foreground">Checking documentation status...</p>
            </div>
          </div>
        </div>

        {/* Loading Right Nav */}
        <div className="hidden xl:block w-64 bg-background/50 backdrop-blur-sm p-6 flex-shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-4 w-4 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-24" />
            </div>
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-muted/30 rounded animate-pulse"
                  style={{ width: `${50 + Math.random() * 30}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authentication guard
  if (!session?.jwt_token) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 p-8 rounded-2xl bg-background/80 backdrop-blur-2xl border border-border/50 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-foreground">Authentication Required</h3>
            <p className="text-sm text-muted-foreground">
              Sign in to access documentation features
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Loading Left Sidebar */}
        <div
          className="border-r border-border/30 p-6 bg-background/50 backdrop-blur-sm flex-shrink-0 relative"
          style={{ width: `${leftNavWidth}px` }}
        >
          {/* Left Resize Handle for Loading State */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors group"
            onMouseDown={() => setIsResizingLeft(true)}
          >
            <div className="absolute right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-4 w-4 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-20" />
            </div>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-3 w-3 bg-muted/30 rounded animate-pulse" />
                  <div
                    className="h-3 bg-muted/30 rounded animate-pulse"
                    style={{ width: `${60 + Math.random() * 40}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loading Main Content */}
        <div className="flex-1 flex items-center justify-center bg-background/20">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-background/80 backdrop-blur-2xl border border-border/50 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <h3 className="font-medium text-foreground">Loading Documentation</h3>
              <p className="text-sm text-muted-foreground">Fetching repository documentation...</p>
            </div>
          </div>
        </div>

        {/* Loading Right Nav */}
        <div className="hidden xl:block w-64 bg-background/50 backdrop-blur-sm p-6 flex-shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-4 w-4 bg-muted/50 rounded animate-pulse" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-24" />
            </div>
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-muted/30 rounded animate-pulse"
                  style={{ width: `${50 + Math.random() * 30}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No documentation generated state
  if (!isDocGenerated) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Empty Left Sidebar */}
        <div
          className="border-r border-border/30 p-6 bg-background/30 backdrop-blur-sm flex-shrink-0 relative"
          style={{ width: `${leftNavWidth}px` }}
        >
          {/* Left Resize Handle for No Docs State */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors group"
            onMouseDown={() => setIsResizingLeft(true)}
          >
            <div className="absolute right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6 opacity-50">
              <List className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">Contents</span>
            </div>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 opacity-30">
                  <div className="h-3 w-3 bg-muted/40 rounded animate-pulse" />
                  <div
                    className="h-3 bg-muted/40 rounded animate-pulse"
                    style={{ width: `${40 + Math.random() * 40}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Generate Section */}
        <div className="flex-1 flex items-center justify-center bg-background/10">
          <div className="text-center space-y-8 p-8 rounded-3xl bg-background/90 backdrop-blur-2xl border border-border/50 shadow-xl max-w-lg mx-4">
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center relative">
                {isGenerating ? (
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                ) : (
                  <BookOpen className="h-10 w-10 text-primary" />
                )}
                {!isGenerating && (
                  <div className="absolute -top-2 -right-2">
                    <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-foreground">
                  {isGenerating ? 'Generating Documentation' : 'Generate Documentation'}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {isGenerating
                    ? 'Creating comprehensive AI-powered documentation for your repository. This process analyzes your codebase structure, dependencies, and generates detailed explanations.'
                    : 'Transform your codebase into comprehensive, AI-powered documentation with interactive navigation, detailed analysis, and smart cross-references.'}
                </p>
              </div>
            </div>

            {isGenerating && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-primary">
                      {currentStatus === 'running' ? '60%' : '30%'}
                    </span>
                  </div>
                  <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-blue-500 h-2 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: currentStatus === 'running' ? '60%' : '30%' }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
                  <span className="capitalize font-medium text-primary">{currentStatus}</span>
                  {isCheckingStatus && (
                    <span className="text-muted-foreground">• Checking status...</span>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <X className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-600 dark:text-red-400">
                    Generation Failed
                  </span>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Model Selection and Settings */}
            {!isGenerating && (
              <div className="space-y-6 bg-background/60 backdrop-blur-xl border border-border/30 rounded-2xl p-6">
                {!apiKeyValidation.isLoading && !hasValidApiKeys && (
                  <div className="p-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-orange-500" />
                      <span className="text-sm text-orange-700 dark:text-orange-300">
                        Add an API key to enable documentation generation
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => apiKeyValidation.setShowApiKeyModal(true)}
                      className="ml-2"
                    >
                      Add API Keys
                    </Button>
                  </div>
                )}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Generation Settings
                  </h3>

                  {/* Model Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">AI Provider</Label>
                      <Select
                        value={generationSettings.provider}
                        onValueChange={(provider) => {
                          const firstModel = availableModels?.providers[provider]?.[0];
                          if (firstModel) {
                            setGenerationSettings((prev) => ({
                              ...prev,
                              provider,
                              model: firstModel,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            <div className="flex items-center gap-2">
                              {generationSettings.provider === 'openai' && (
                                <Zap className="h-4 w-4" />
                              )}
                              {generationSettings.provider === 'anthropic' && (
                                <Brain className="h-4 w-4" />
                              )}
                              {generationSettings.provider === 'gemini' && (
                                <Sparkles className="h-4 w-4" />
                              )}
                              {generationSettings.provider === 'groq' && (
                                <Gauge className="h-4 w-4" />
                              )}
                              <span className="capitalize">{generationSettings.provider}</span>
                            </div>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels &&
                            (() => {
                              const userKeys = availableModels.user_has_keys || [];
                              const providersToShow = (
                                userKeys.length > 0
                                  ? userKeys
                                  : Object.keys(availableModels.providers)
                              ).filter((p) => (availableModels.providers[p] || []).length > 0);
                              return providersToShow.map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  <div className="flex items-center gap-2">
                                    {provider === 'openai' && <Zap className="h-4 w-4" />}
                                    {provider === 'anthropic' && <Brain className="h-4 w-4" />}
                                    {provider === 'gemini' && <Sparkles className="h-4 w-4" />}
                                    {provider === 'groq' && <Gauge className="h-4 w-4" />}
                                    <span className="capitalize">{provider}</span>
                                    {availableModels.user_has_keys.includes(provider) && (
                                      <Badge variant="secondary" className="text-xs">
                                        Your Key
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ));
                            })()}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Model</Label>
                      <Select
                        value={generationSettings.model}
                        onValueChange={(model) =>
                          setGenerationSettings((prev) => ({ ...prev, model }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue>
                            <Badge variant="outline" className="text-xs">
                              {generationSettings.model}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels?.providers[generationSettings.provider]?.map((model) => (
                            <SelectItem key={model} value={model}>
                              <Badge variant="outline" className="text-xs">
                                {model}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Quick Settings */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="comprehensive"
                        checked={generationSettings.comprehensive}
                        onCheckedChange={(comprehensive) =>
                          setGenerationSettings((prev) => ({ ...prev, comprehensive }))
                        }
                      />
                      <Label htmlFor="comprehensive" className="text-sm">
                        Comprehensive Documentation
                      </Label>
                    </div>

                    <Popover open={showAdvancedSettings} onOpenChange={setShowAdvancedSettings}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8">
                          <Settings className="h-4 w-4 mr-2" />
                          Advanced
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Temperature</Label>
                            <Slider
                              value={[generationSettings.temperature]}
                              onValueChange={(value) =>
                                setGenerationSettings((prev) => ({
                                  ...prev,
                                  temperature: value[0],
                                }))
                              }
                              max={1.5}
                              min={0}
                              step={0.1}
                              className="w-full"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Focused (0)</span>
                              <span className="font-medium">{generationSettings.temperature}</span>
                              <span>Creative (1.5)</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Language</Label>
                            <Select
                              value={generationSettings.language}
                              onValueChange={(language) =>
                                setGenerationSettings((prev) => ({ ...prev, language }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="es">Spanish</SelectItem>
                                <SelectItem value="fr">French</SelectItem>
                                <SelectItem value="de">German</SelectItem>
                                <SelectItem value="zh">Chinese</SelectItem>
                                <SelectItem value="ja">Japanese</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Updates */}
            {isGenerating && (isStreaming || sseUpdates.length > 0) && (
              <div className="space-y-4 bg-background/60 backdrop-blur-xl border border-border/30 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Generation Progress
                  {isStreaming && (
                    <Badge variant="secondary" className="text-xs">
                      Live Updates
                    </Badge>
                  )}
                </h3>

                {/* Current Status */}
                {(sseMessage || sseStatus) && (
                  <div className="p-3 bg-primary/10 rounded-lg border-l-4 border-primary">
                    <div className="font-medium text-sm text-foreground">
                      Status: {sseStatus || 'running'}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{sseMessage}</div>
                  </div>
                )}

                {/* Progress History */}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {sseUpdates.slice(-5).map((update, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-2 bg-background/40 rounded-lg"
                    >
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse mt-2" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground truncate">
                          {update.message}
                        </div>
                        <div className="text-xs text-muted-foreground/60">
                          {new Date(update.timestamp * 1000).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Error Display */}
                {sseError && (
                  <div className="p-3 bg-destructive/10 rounded-lg border-l-4 border-destructive">
                    <div className="text-sm text-destructive font-medium">Connection Error</div>
                    <div className="text-xs text-destructive/80 mt-1">{sseError}</div>
                  </div>
                )}

                {canCancel && currentTaskId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!session?.jwt_token || !currentTaskId) return;
                      try {
                        await cancelWikiGeneration(session?.jwt_token || undefined, currentTaskId);
                        stopStreaming();
                        setCanCancel(false);
                        setCurrentTaskId(null);
                        setIsGenerating(false);
                      } catch (error) {
                        console.error('Error cancelling generation:', error);
                      }
                    }}
                    className="w-full"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Cancel Generation
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleGenerateDocumentation}
                disabled={isGenerating || !availableModels || !hasValidApiKeys}
                size="lg"
                className="flex-1 rounded-xl px-8 py-3 text-base font-semibold"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                    {isCheckingStatus ? 'Checking Status...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-3" />
                    Generate Documentation
                  </>
                )}
              </Button>

              {isDocGenerated && !isGenerating && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowRegenerateOptions(!showRegenerateOptions)}
                  className="rounded-xl px-6 py-3"
                  disabled={!hasValidApiKeys}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              )}
            </div>

            {/* Regenerate Options */}
            {showRegenerateOptions && isDocGenerated && !isGenerating && (
              <div className="space-y-3 bg-background/60 backdrop-blur-xl border border-border/30 rounded-2xl p-4">
                <h4 className="text-sm font-medium text-foreground">Regeneration Options</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDocumentation}
                    className="rounded-lg"
                    disabled={!hasValidApiKeys}
                  >
                    <Sparkles className="h-3 w-3 mr-2" />
                    Full Regeneration
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      /* TODO: Implement partial regeneration */
                    }}
                    className="rounded-lg"
                    disabled
                  >
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Partial Update
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Empty Right Nav */}
        <div className="hidden xl:block w-64 bg-background/30 backdrop-blur-sm p-6 flex-shrink-0">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6 opacity-50">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">On This Page</span>
            </div>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-muted/20 rounded animate-pulse opacity-30"
                  style={{ width: `${30 + Math.random() * 40}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No documentation data state
  if (!documentation || !documentation.data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 p-8 rounded-2xl bg-background/80 backdrop-blur-2xl border border-border/50 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
            <X className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-foreground">No Documentation Found</h3>
            <p className="text-sm text-muted-foreground">
              No documentation data available for this repository.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main documentation display - Three column layout with proper scrolling
  return (
    <div className="h-full flex overflow-hidden" ref={resizeRef}>
      {/* Left Sidebar - File Navigation (Fixed/Sticky) */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 bg-background/95 backdrop-blur-xl border-r border-border/30 transform transition-transform duration-300',
          'lg:relative lg:translate-x-0 lg:bg-background/50 lg:backdrop-blur-sm',
          'flex flex-col flex-shrink-0 relative',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ width: `${leftNavWidth}px` }}
      >
        {/* Left Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors group hidden lg:block"
          onMouseDown={() => setIsResizingLeft(true)}
        >
          <div className="absolute right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 lg:p-6 shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="hidden lg:inline">Documentation</span>
            <span className="lg:hidden">Navigation</span>
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="h-8 w-8 rounded-xl lg:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Sidebar Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {/* File Tree */}
          {documentation?.data?.folder_structure && (
            <div>
              <h3 className="font-medium mb-4 flex items-center gap-2 px-2 text-foreground">
                <List className="h-4 w-4 text-primary" />
                Contents
              </h3>
              <FileTree
                nodes={documentation.data.folder_structure}
                onFileClick={handleNavItemClick}
                activePath={activePath}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area - Scrollable */}
      <main className="flex-1 flex flex-col min-w-0 bg-background/10 overflow-hidden">
        {/* Mobile Menu Button */}
        <div className="lg:hidden sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/30 p-4 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="h-9 w-9 rounded-xl"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Area - This is the ONLY scrollable section */}
        <div className="flex-1 overflow-y-auto" ref={contentRef}>
          <div className="p-4 lg:p-6 xl:p-8 max-w-none">
            {activeContent ? (
              <div className="space-y-4">
                {/* Document Header - Compact */}
                <div className="bg-background/80 backdrop-blur-xl border border-border/40 rounded-2xl p-4 lg:p-6 shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2 break-words leading-tight">
                        {formatTitle(activeContent.metadata?.filename)}
                      </h1>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {activeContent.metadata?.size && (
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="font-medium">
                              {formatFileSize(activeContent.metadata.size)}
                            </span>
                          </div>
                        )}
                        {activeContent.read_time && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="font-medium">{activeContent.read_time} min read</span>
                          </div>
                        )}
                        {activeContent.word_count && (
                          <div className="flex items-center gap-1.5">
                            <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="font-medium">{activeContent.word_count} words</span>
                          </div>
                        )}
                        {activeContent.metadata?.modified && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Last modified:</span>{' '}
                            {formatDate(activeContent.metadata.modified)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Content */}
                <div className="bg-background/80 backdrop-blur-xl border border-border/40 rounded-2xl overflow-hidden shadow-sm">
                  <article className="p-6 lg:p-8 xl:p-10">
                    <MarkdownRenderer
                      content={activeContent.content || activeContent.preview || ''}
                      onNavItemClick={handleNavItemClick}
                      onHeadersExtracted={handleHeadersExtracted}
                    />
                  </article>
                </div>

                {/* Bottom spacing for better scroll experience */}
                <div className="h-16" />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-6 p-8 rounded-2xl bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground/70" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-foreground">Select a Document</h3>
                    <p className="text-muted-foreground max-w-sm">
                      Choose a file from the navigation panel to view its documentation content.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Right Sidebar - Page Navigation (Resizable & Collapsible) */}
      {!isRightNavCollapsed ? (
        <div
          className="hidden xl:flex xl:flex-col bg-background/40 backdrop-blur-sm flex-shrink-0 relative"
          style={{ width: `${rightNavWidth}px` }}
        >
          {/* Resize Handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors group"
            onMouseDown={() => setIsResizingRight(true)}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Right Sidebar Header */}
          <div className="flex items-center justify-between p-4 lg:p-6 border-b border-border/20 shrink-0">
            <h3 className="font-medium flex items-center gap-2 text-foreground text-sm">
              <Hash className="h-4 w-4 text-primary" />
              On This Page
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRightNavCollapsed(true)}
              className="h-6 w-6 rounded-lg hover:bg-muted/50"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {/* Right Sidebar Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {headers.length > 0 ? (
              <nav className="space-y-0.5">
                {headers.map((header) => (
                  <button
                    key={header.id}
                    onClick={() => handleHeaderClick(header.id)}
                    className={cn(
                      'block w-full text-left px-3 py-2 text-sm rounded-lg transition-all duration-200',
                      'hover:bg-muted/40 hover:text-foreground group',
                      activeHeaderId === header.id
                        ? 'bg-primary/8 text-primary font-medium'
                        : 'text-muted-foreground',
                    )}
                    style={{
                      paddingLeft: `${0.75 + (header.level - 1) * 0.5}rem`,
                    }}
                  >
                    <span className="truncate block group-hover:font-medium transition-all text-xs">
                      {header.text}
                    </span>
                  </button>
                ))}
              </nav>
            ) : activeContent ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 mx-auto rounded-xl bg-muted/20 flex items-center justify-center mb-3">
                  <Hash className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-xs text-muted-foreground">No headers found in this document.</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-10 h-10 mx-auto rounded-xl bg-muted/20 flex items-center justify-center mb-3">
                  <Menu className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a document to see its navigation.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Collapsed Right Nav */
        <div className="hidden xl:block w-8 bg-background/30 backdrop-blur-sm flex-shrink-0">
          <div className="sticky top-0 h-full flex items-start justify-center pt-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRightNavCollapsed(false)}
              className="h-8 w-8 rounded-lg hover:bg-muted/50 rotate-180"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={apiKeyValidation.showApiKeyModal}
        onClose={() => apiKeyValidation.setShowApiKeyModal(false)}
        userHasKeys={apiKeyValidation.userHasKeys}
        availableProviders={apiKeyValidation.availableProviders}
      />
    </div>
  );
}
