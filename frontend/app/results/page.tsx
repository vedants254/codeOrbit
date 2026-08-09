'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StructureTab } from '@/components/structure-tab';
import ReagraphVisualization from '@/components/ReagraphVisualization';
import { FloatingChatButton } from '@/components/floating-chat-button';
import { ChatSidebar } from '@/components/chat-sidebar';
import DocumentationTab from '@/components/documentation';
import {
  Network,
  Code2,
  FileText,
  ArrowLeft,
  CheckCircle,
  Info,
  X,
  Minimize2,
  Menu,
  Lock,
  BookOpen,
  Key,
  Play,
  Zap,
  Archive,
} from 'lucide-react';
import { CodeViewer } from '@/components/CodeViewer';
import { cn } from '@/lib/utils';
import { useResultData } from '@/context/ResultDataContext';
import { showToast } from '@/components/toaster';
import { useSession } from 'next-auth/react';
import { useChatSidebar } from '@/hooks/use-chat-sidebar';
import ThemeToggle from '@/components/theme-toggle';

export default function ZipResultsPage() {
  const router = useRouter();

  const {
    output,
    error,
    outputMessage,
    sourceType,
    sourceData,
    loading,
    currentRepoId,
    userKeyPreferences,
  } = useResultData();
  const { data: session } = useSession();

  const repositoryBranch = useMemo(() => {
    if (
      sourceType === 'github' &&
      sourceData &&
      typeof sourceData === 'object' &&
      'branch' in sourceData
    ) {
      return (sourceData as { branch?: string }).branch || 'main';
    }
    return 'main';
  }, [sourceType, sourceData]);

  // Use currentRepoId directly for ZIP files, or construct GitHub format for GitHub repos
  const validRepositoryIdentifier = useMemo(() => {
    if (sourceType === 'github' && sourceData && typeof sourceData === 'object' && 'repo_url' in sourceData) {
      // For GitHub repos, try to construct owner/repo/branch format
      try {
        const repoUrl = (sourceData as { repo_url?: string }).repo_url;
        if (repoUrl) {
          const url = new URL(repoUrl);
          const pathParts = url.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            const owner = pathParts[0];
            const repo = pathParts[1];
            return `${owner}/${repo}/${repositoryBranch}`;
          }
        }
      } catch (e) {
        console.warn('Failed to parse GitHub repo URL:', e);
      }
    }
    // For ZIP files or when GitHub parsing fails, use currentRepoId directly
    return currentRepoId || '';
  }, [sourceType, sourceData, currentRepoId, repositoryBranch]);
  
  // For ZIP-based results, enable chat if we have a repository ID
  const { currentModel } = useChatSidebar(validRepositoryIdentifier, userKeyPreferences, {
    repositoryBranch,
    autoLoad: Boolean(validRepositoryIdentifier), // Enable auto-loading when we have a valid identifier
  });
  void currentModel;

  // Set default active tab based on authentication
  const defaultTab = session?.accessToken ? 'graph' : 'structure';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [showInfo, setShowInfo] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const toggleChat = () => {
    // Allow chat if we have output (repository processed) and valid repository identifier
    if (!output && !validRepositoryIdentifier && !isChatOpen) {
      showToast.error(
        'Repository not processed yet. Please wait for processing to complete before chatting.',
      );
      return;
    }
    setIsChatOpen(!isChatOpen);
  };

  // popup state for full-screen code explorer
  const [isExpanded, setIsExpanded] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Handle restricted tab clicks
  const handleTabChange = (value: string) => {
    if (
      (value === 'graph' ||
        value === 'explorer' ||
        value === 'documentation' ||
        value === 'video' ||
        value === 'mcp') &&
      !session?.accessToken
    ) {
      router.push('/signin');
      return;
    }

    if (value === 'video') {
      showToast.info('🎬 Code walk through Video generation, Coming Soon !!');
      return;
    }

    if (value === 'mcp') {
      showToast.info('⚡ MCP features, Coming Soon !!');
      return;
    }

    setActiveTab(value);
  };

  // Handle click outside to close expanded view
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isExpanded]);

  useEffect(() => {
    if (error) showToast.error(error);
  }, [error]);

  useEffect(() => {
    if (outputMessage) showToast.success(outputMessage);
  }, [outputMessage]);

  // Redirect if no output and not loading (fallback)
  useEffect(() => {
    if (!output && !loading) {
      router.replace('/');
    }
  }, [output, loading, router]);

  type ZipSource = File & { name: string };

  const getDisplayName = () => {
    if (sourceType === 'zip' && sourceData instanceof File) {
      return (sourceData as ZipSource).name;
    }
    if (
      sourceType === 'github' &&
      sourceData &&
      typeof sourceData === 'object' &&
      'repo_url' in sourceData
    ) {
      return (sourceData as { repo_url?: string }).repo_url || 'Repository';
    }
    return 'Repository';
  };

  if (loading || !output) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-background/80 backdrop-blur-2xl border border-border/50 shadow-xl max-w-sm w-full">
          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <div className="text-center space-y-2">
            <h3 className="font-medium text-foreground text-sm sm:text-base">Loading Results</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Please wait while we prepare your analysis...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Gradient */}
      <div className="absolute top-0 left-0 right-0 h-32 sm:h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between p-3 sm:p-4">
          {/* Left side - Back button and minimal info */}
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/')}
              className="h-9 w-9 rounded-xl shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              {sourceType === 'zip' ? (
                <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Network className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate max-w-[140px] md:max-w-[200px]">
                {getDisplayName()}
              </span>
            </div>
          </div>

          {/* Right side - Status and menu */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-green-50/90 text-green-700 border-green-200/60 dark:bg-green-950/90 dark:text-green-300 dark:border-green-800/60 rounded-xl px-2 sm:px-3 py-1 text-xs flex items-center gap-1">
              <CheckCircle className="h-3 w-3 shrink-0" />
              <span className="hidden xs:inline">Ready</span>
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="h-9 w-9 rounded-xl shrink-0"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showMobileMenu && (
          <div className="border-t border-border/30 bg-background/98 backdrop-blur-xl">
            <div className="p-3 sm:p-4 space-y-3">
              <div className="sm:hidden flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
                {sourceType === 'zip' ? (
                  <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <Network className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{getDisplayName()}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowInfo(!showInfo);
                  setShowMobileMenu(false);
                }}
                className="w-full justify-start rounded-xl"
              >
                <Info className="h-4 w-4 mr-2" /> Repository Details
              </Button>

              {session?.accessToken && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    router.push('/api-keys');
                    setShowMobileMenu(false);
                  }}
                  className="w-full justify-start rounded-xl"
                >
                  <Key className="h-4 w-4 mr-2" /> API Keys
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Header Elements */}
      <div className="hidden lg:block">
        {/* Back Button */}
        <div className="fixed top-4 lg:top-6 left-4 lg:left-6 z-40">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10 rounded-2xl bg-background/90 backdrop-blur-xl border-border/60 shadow-md hover:bg-background hover:shadow-lg transition-all duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Repo Badge */}
        <div className="fixed top-4 lg:top-6 left-16 lg:left-20 z-40 flex items-center max-w-[calc(100vw-400px)]">
          <div className="flex items-center gap-2 bg-background/90 backdrop-blur-xl rounded-2xl px-3 lg:px-4 py-2 border border-border/60 shadow-md max-w-full">
            {sourceType === 'zip' ? (
              <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <Network className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{getDisplayName()}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-muted/50 shrink-0"
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Top Right Controls: Theme + API Keys */}
        <div className="fixed top-4 right-4 lg:top-6 lg:right-6 z-40 flex items-center gap-2">
          <ThemeToggle className="bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-border/30" />
          {session?.accessToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/api-keys')}
              className="rounded-xl bg-background/90 backdrop-blur-xl border-border/60 shadow-md hover:bg-background hover:shadow-lg transition-all duration-300 gap-2"
            >
              <Key className="h-4 w-4" />
              <span className="hidden xl:inline">API Keys</span>
            </Button>
          )}
        </div>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="fixed top-16 left-4 right-4 lg:top-20 lg:left-6 lg:right-auto z-30 lg:max-w-md">
          <div className="bg-background/95 backdrop-blur-xl rounded-2xl border border-border/60 shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Repository Details</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted/50"
                onClick={() => setShowInfo(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Source:</span>
                <span>{sourceType === 'github' ? 'GitHub Repository' : 'ZIP Archive'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="w-full max-w-[100vw] sm:max-w-[95vw] lg:max-w-[90vw] xl:max-w-[95vw] mx-auto px-1 sm:px-2 md:px-4 py-2 sm:py-4 lg:py-6 lg:pt-20">
        <div className="lg:hidden h-4"></div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-8">
          {/* Mobile Tab Navigation */}
          <div className="lg:hidden">
            <TabsList className="grid w-full grid-cols-6 bg-background backdrop-blur-xl border border-border/60 rounded-2xl p-1 shadow-lg h-12">
              <TabsTrigger
                value="graph"
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-3 w-3" />}
                <Network className="h-4 w-4" />
                <span className="hidden xs:inline">Graph</span>
              </TabsTrigger>
              <TabsTrigger
                value="explorer"
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-3 w-3" />}
                <Code2 className="h-4 w-4" />
                <span className="hidden xs:inline">Explorer</span>
              </TabsTrigger>
              <TabsTrigger
                value="documentation"
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-3 w-3" />}
                <BookOpen className="h-4 w-4" />
                <span className="hidden xs:inline">Docs</span>
              </TabsTrigger>
              <TabsTrigger
                value="video"
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2 opacity-60',
                  !session?.accessToken && 'opacity-40',
                )}
              >
                {!session?.accessToken && <Lock className="h-3 w-3" />}
                <Play className="h-4 w-4" />
                <span className="hidden xs:inline">Video</span>
              </TabsTrigger>
              <TabsTrigger
                value="mcp"
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2 opacity-60',
                  !session?.accessToken && 'opacity-40',
                )}
              >
                {!session?.accessToken && <Lock className="h-3 w-3" />}
                <Zap className="h-4 w-4" />
                <span className="hidden xs:inline">MCP</span>
              </TabsTrigger>
              <TabsTrigger
                value="structure"
                className="rounded-xl text-xs font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden xs:inline">Structure</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Desktop Tab Navigation */}
          <div className="hidden lg:flex justify-center items-center gap-4 relative mb-0">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-muted/30 -z-10"></div>
            <TabsList className="bg-background backdrop-blur-xl border border-border/60 rounded-2xl p-2 shadow-lg min-h-[60px] relative z-10">
              <TabsTrigger
                value="graph"
                className={cn(
                  'rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-4 w-4" />}
                <Network className="h-5 w-5" />
                <span>Graph</span>
              </TabsTrigger>
              <TabsTrigger
                value="explorer"
                className={cn(
                  'rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-4 w-4" />}
                <Code2 className="h-5 w-5" />
                <span>Explorer</span>
              </TabsTrigger>
              <TabsTrigger
                value="documentation"
                className={cn(
                  'rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center',
                  !session?.accessToken && 'opacity-60',
                )}
              >
                {!session?.accessToken && <Lock className="h-4 w-4" />}
                <BookOpen className="h-5 w-5" />
                <span>Documentation</span>
              </TabsTrigger>
              <TabsTrigger
                value="video"
                className={cn(
                  'rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center opacity-60 relative',
                  !session?.accessToken && 'opacity-40',
                )}
              >
                {!session?.accessToken && <Lock className="h-4 w-4" />}
                <Play className="h-5 w-5" />
                <span>Video</span>
                <Badge className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  Soon
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="mcp"
                className={cn(
                  'rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center opacity-60 relative',
                  !session?.accessToken && 'opacity-40',
                )}
              >
                {!session?.accessToken && <Lock className="h-4 w-4" />}
                <Zap className="h-5 w-5" />
                <span>MCP</span>
                <Badge className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  Soon
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="structure"
                className="rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-3 min-w-[140px] justify-center"
              >
                <FileText className="h-5 w-5" />
                <span>Context</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="relative">
            {/* Structure Tab */}
            <TabsContent value="structure" className="mt-0 animate-in fade-in-50 duration-300">
              <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                <div className="p-1 sm:p-2 md:p-4 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[800px]">
                  <div className="h-full w-full rounded-lg sm:rounded-xl md:rounded-2xl bg-muted/20 border border-border/30 overflow-auto">
                    <div className="h-full w-full">
                      <StructureTab />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Graph Tab - Only show if authenticated */}
            <TabsContent value="graph" className="mt-0 animate-in fade-in-50 duration-300">
              {session?.accessToken ? (
                <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-1 sm:p-2 md:p-4 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[800px]">
                    {sourceType && sourceData ? (
                      <div className="h-full w-full rounded-lg sm:rounded-xl md:rounded-2xl bg-muted/20 border border-border/30 overflow-hidden">
                        <ReagraphVisualization
                          setParentActiveTab={setActiveTab}
                          onError={(msg) => showToast.error(msg)}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4 p-8">
                          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                            <Network className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="font-medium text-foreground">No Graph Data Available</h3>
                            <p className="text-sm text-muted-foreground max-w-sm">
                              Graph visualization requires processed source data.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* Code Explorer Tab - Only show if authenticated */}
            <TabsContent value="explorer" className="mt-0 animate-in fade-in-50 duration-300">
              {session?.accessToken ? (
                <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-1 sm:p-2 md:p-4 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[800px]">
                    <div className="h-full w-full rounded-lg sm:rounded-xl md:rounded-2xl bg-muted/20 border border-border/30 overflow-auto">
                      <div className="h-full w-full">
                        <CodeViewer />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* Documentation Tab - Only show if authenticated */}
            <TabsContent value="documentation" className="mt-0 animate-in fade-in-50 duration-300">
              {session?.accessToken ? (
                <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-1 sm:p-2 md:p-4 h-[400px] sm:h-[500px] md:h-[600px] lg:h-[800px]">
                    <div className="h-full w-full rounded-lg sm:rounded-xl md:rounded-2xl bg-muted/20 border border-border/30 overflow-auto">
                      {currentRepoId && sourceData ? (
                        <div className="h-full w-full overflow-auto">
                          <DocumentationTab
                            currentRepoId={currentRepoId}
                            sourceData={
                              sourceType === 'github' &&
                              sourceData &&
                              typeof sourceData === 'object' &&
                              'repo_url' in sourceData
                                ? { repo_url: (sourceData as { repo_url?: string }).repo_url }
                                : { repo_url: '' }
                            }
                            sourceType={sourceType || 'zip'}
                            userKeyPreferences={userKeyPreferences}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center space-y-4 p-8">
                            <div className="w-12 h-12 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
                              <BookOpen className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <div className="space-y-2">
                              <h3 className="font-medium text-foreground">No Repository Data</h3>
                              <p className="text-sm text-muted-foreground max-w-sm">
                                Documentation requires repository information to generate content
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* Video Tab - Coming Soon */}
            <TabsContent value="video" className="mt-0 animate-in fade-in-50 duration-300">
              {session?.accessToken ? (
                <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-orange-500/5 via-transparent to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-orange-500/10">
                        <Play className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                            Video Analysis
                          </h2>
                          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 rounded-xl px-2 py-1 text-xs font-medium">
                            Coming Soon
                          </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          AI-powered video explanations and walkthroughs of your codebase
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-[500px] sm:h-[600px] lg:h-[700px] flex items-center justify-center">
                    <div className="text-center space-y-6 p-8 max-w-md">
                      <div className="relative">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                          <Play className="h-10 w-10 sm:h-12 sm:w-12 text-orange-500" />
                        </div>
                        <div className="absolute -top-2 -right-2">
                          <Badge className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                            Soon
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground">
                          Video Analysis Coming Soon
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          We&apos;re working on an exciting new feature that will generate video
                          explanations of your codebase.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* MCP Tab - Coming Soon */}
            <TabsContent value="mcp" className="mt-0 animate-in fade-in-50 duration-300">
              {session?.accessToken ? (
                <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-orange-500/5 via-transparent to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-orange-500/10">
                        <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                            MCP Analysis
                          </h2>
                          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 rounded-xl px-2 py-1 text-xs font-medium">
                            Coming Soon
                          </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          AI-powered analysis of your codebase.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-[500px] sm:h-[600px] lg:h-[700px] flex items-center justify-center">
                    <div className="text-center space-y-6 p-8 max-w-md">
                      <div className="relative">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                          <Zap className="h-10 w-10 sm:h-12 sm:w-12 text-orange-500" />
                        </div>
                        <div className="absolute -top-2 -right-2">
                          <Badge className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                            Soon
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground">
                          MCP Analysis Coming Soon
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          We&apos;re working on an exciting new feature that will analyze your
                          codebase.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </div>
        </Tabs>
      </main>

      {session?.accessToken && validRepositoryIdentifier && (
        <>
          <FloatingChatButton
            onClick={toggleChat}
            isOpen={isChatOpen}
            unreadCount={0}
            isLoading={!validRepositoryIdentifier && loading}
          />
          <ChatSidebar
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            repositoryIdentifier={validRepositoryIdentifier}
            repositoryName={getDisplayName()}
            repositoryBranch={repositoryBranch}
            userKeyPreferences={userKeyPreferences}
          />
        </>
      )}

      {/* Expanded View Popup - Explorer */}
      {session?.accessToken && isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md p-2 sm:p-8">
          <div
            ref={popupRef}
            className="w-full h-full sm:w-[90vw] sm:h-[85vh] bg-background rounded-2xl sm:rounded-3xl border border-border/50 shadow-2xl flex flex-col animate-in fade-in-50 zoom-in-95 duration-300"
          >
            <div className="flex-1 p-3 sm:p-6 overflow-hidden">
              <div className="h-full rounded-xl sm:rounded-2xl bg-muted/20 border border-border/30 overflow-auto">
                <div className="h-full w-full">
                  <CodeViewer />
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="rounded-xl border-border/50 hover:bg-muted/50 transition-colors duration-200"
              >
                <Minimize2 className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Minimize</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
