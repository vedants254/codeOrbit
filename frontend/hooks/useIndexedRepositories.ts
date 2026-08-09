'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getIndexedRepositoriesApiIndexedReposPost } from '@/api-client/sdk.gen';
import type { IndexedRepository } from '@/api-client/types.gen';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';

interface UseIndexedRepositoriesOptions {
  limit?: number;
  offset?: number;
  autoLoad?: boolean;
}

export function useIndexedRepositories(options: UseIndexedRepositoriesOptions = {}) {
  const { data: session } = useSession();
  const { limit = 10, offset = 0, autoLoad = true } = options;

  const [repositories, setRepositories] = useState<IndexedRepository[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [userTier, setUserTier] = useState<string>('free');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Create authenticated version of the API function
  const fetchIndexedRepositoriesWithAuth = useApiWithAuth(async (limit: number, offset: number) => {
    // Use Authorization header instead of form data
    const token = session?.jwt_token || '';
    const response = await getIndexedRepositoriesApiIndexedReposPost({
      body: {
        limit,
        offset,
      },
      headers: {
        Authorization: token, // Token already contains "Bearer "
      },
    });
    return response;
  });

  const loadRepositories = async (loadLimit = limit, loadOffset = offset) => {
    if (!session?.jwt_token) {
      setRepositories([]);
      setTotalCount(0);
      setUserTier('free');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchIndexedRepositoriesWithAuth(loadLimit, loadOffset);

      if (response.data) {
        setRepositories(response.data.repositories);
        setTotalCount(response.data.total_count);
        setUserTier(response.data.user_tier);
      }
    } catch (err) {
      console.error('Failed to load indexed repositories:', err);
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
      setRepositories([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load repositories when session changes
  useEffect(() => {
    if (autoLoad) {
      loadRepositories();
    }
  }, [session?.jwt_token, autoLoad]);

  const refresh = () => {
    loadRepositories();
  };

  const loadMore = () => {
    if (!loading && repositories.length < totalCount) {
      loadRepositories(limit, repositories.length);
    }
  };

  return {
    repositories,
    totalCount,
    userTier,
    loading,
    error,
    refresh,
    loadMore,
    hasMore: repositories.length < totalCount,
    isPremium: userTier === 'premium' || userTier === 'unlimited',
  };
}
