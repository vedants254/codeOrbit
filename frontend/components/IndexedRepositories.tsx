'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Github,
  Upload,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sparkles,
  GitBranch,
  HardDrive,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIndexedRepositories } from '@/hooks/useIndexedRepositories';
import type { IndexedRepository } from '@/api-client/types.gen';
import { cn } from '@/lib/utils';

interface IndexedRepositoriesProps {
  className?: string;
}

const ITEMS_PER_PAGE = 12;

export function IndexedRepositories({ className }: IndexedRepositoriesProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { repositories, loading, error, isPremium, totalCount } = useIndexedRepositories({
    limit: 100, // Load more items for pagination
    autoLoad: true,
  });

  const formatDate = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 7) {
        return `${diffInDays}d ago`;
      } else if (diffInDays < 30) {
        const weeks = Math.floor(diffInDays / 7);
        return `${weeks}w ago`;
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
      }
    }
  };

  const formatFileSize = (sizeInMB: number) => {
    if (sizeInMB < 1) {
      return `${Math.round(sizeInMB * 1000)}KB`;
    } else if (sizeInMB < 1000) {
      return `${Math.round(sizeInMB * 10) / 10}MB`;
    } else {
      return `${Math.round(sizeInMB / 100) / 10}GB`;
    }
  };

  const getRepoDisplayName = (repo: IndexedRepository) => {
    if (repo.source === 'github' && repo.github_url) {
      try {
        const url = new URL(repo.github_url);
        return url.pathname.substring(1); // Remove leading slash
      } catch {
        return repo.repo_name;
      }
    }
    return repo.repo_name;
  };

  const getRepoOwnerAndName = (repo: IndexedRepository) => {
    const displayName = getRepoDisplayName(repo);
    const parts = displayName.split('/');
    return {
      owner: parts[0] || '',
      name: parts[1] || displayName,
      full: displayName,
    };
  };

  const handleRepoClick = useCallback(
    (repo: IndexedRepository) => {
      if (repo.source === 'github' && repo.github_url) {
        try {
          const url = new URL(repo.github_url);
          const [owner, name] = url.pathname.substring(1).split('/');
          // Use the branch from the repository data or default to main
          const branch = repo.branch || 'main';
          router.push(`/results/${owner}/${name}/${branch}`);
        } catch {
          router.push('/results');
        }
      } else {
        router.push('/results');
      }
    },
    [router],
  );

  // Pagination calculations
  const totalPages = Math.ceil(repositories.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRepositories = repositories.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Don't render anything if there are no repositories and not loading
  if (!loading && repositories.length === 0 && !error) {
    return null;
  }

  return (
    <div className={cn('w-full mt-2', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Minimal Header - Always visible */}
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-4 h-auto bg-background/40 backdrop-blur-sm border border-border/30 rounded-xl hover:bg-background/60 hover:border-border/50 transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold">Recently Indexed</h3>
                <p className="text-xs text-muted-foreground">
                  {loading ? 'Loading...' : `${totalCount} repositories`}
                  {isPremium && (
                    <Badge className="ml-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 rounded-md px-2 py-0.5 text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  )}
                </p>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        {/* Expandable Content */}
        <CollapsibleContent className="mt-4">
          <div className="bg-background/40 backdrop-blur-sm border border-border/30 rounded-xl p-6">
            {loading ? (
              // Loading skeletons in grid
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              // Error state
              <div className="text-center py-12">
                <div className="p-3 rounded-full bg-destructive/10 inline-block mb-4">
                  <Clock className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : (
              <>
                {/* Repository Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
                  {currentRepositories.map((repo) => {
                    const { owner, name } = getRepoOwnerAndName(repo);

                    return (
                      <Card
                        key={repo.repo_id}
                        className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] border-border/30 bg-background/20 hover:bg-background/40 h-32 flex flex-col py-2 gap-2"
                        onClick={() => handleRepoClick(repo)}
                      >
                        <CardHeader className="px-4 pt-2 m-0 gap-0 flex-shrink-0">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="p-1 rounded-md bg-primary/10 flex-shrink-0">
                                {repo.source === 'github' ? (
                                  <Github className="h-3 w-3 text-primary" />
                                ) : (
                                  <Upload className="h-3 w-3 text-primary" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="font-semibold text-xs truncate">{name}</div>
                                {owner && (
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {owner}
                                  </div>
                                )}
                              </div>
                            </div>
                            {repo.source === 'github' && repo.github_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(repo.github_url!, '_blank');
                                }}
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="p-2 px-4 flex-1">
                          {/* Metadata */}
                          <div className="space-y-1">
                            {/* Branch and Size on same line */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <GitBranch className="h-2.5 w-2.5 text-muted-foreground" />
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  {repo.branch}
                                </Badge>
                              </div>
                              {repo.file_size_mb && (
                                <div className="flex items-center gap-1">
                                  <HardDrive className="h-2.5 w-2.5 text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatFileSize(repo.file_size_mb)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Date and commit in one line */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDate(repo.created_at)}
                                </span>
                              </div>
                              {repo.commit_sha && (
                                <code className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {repo.commit_sha.substring(0, 7)}
                                </code>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-border/20">
                    <p className="text-xs text-muted-foreground">
                      Showing {startIndex + 1}-{Math.min(endIndex, repositories.length)} of{' '}
                      {repositories.length} repositories
                    </p>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((page) => {
                            const diff = Math.abs(page - currentPage);
                            return diff <= 1 || page === 1 || page === totalPages;
                          })
                          .map((page, index, array) => (
                            <div key={page} className="flex items-center">
                              {index > 0 && array[index - 1] !== page - 1 && (
                                <span className="text-xs text-muted-foreground mx-1">...</span>
                              )}
                              <Button
                                variant={currentPage === page ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => handlePageChange(page)}
                                className="h-8 w-8 p-0 text-xs"
                              >
                                {page}
                              </Button>
                            </div>
                          ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
