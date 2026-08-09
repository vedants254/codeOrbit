'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { fetchGithubRepo, uploadLocalZip } from '@/utils/api';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';
import { useResultData } from '@/context/ResultDataContext';
import type { SourceData, SourceType } from '@/utils/models';

interface GitHubSourceData {
  repo_url: string;
  access_token?: string;
  branch?: string;
  jwt_token?: string;
}

interface UseRepositoryDataOptions {
  owner?: string;
  repo?: string;
  branch?: string;
  repoId?: string;
}

export function useRepositoryData({ owner, repo, branch, repoId }: UseRepositoryDataOptions = {}) {
  const { data: session } = useSession();
  const router = useRouter();
  const {
    output,
    setOutput,
    setSourceType,
    setSourceData,
    setCurrentRepoId,
    setLoading,
    setError,
    sourceType,
    sourceData,
    currentRepoId,
    loading,
    error,
  } = useResultData();

  const fetchGithubRepoWithAuth = useApiWithAuth(fetchGithubRepo);

  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

  const isGitHubSourceData = useCallback((data: SourceData): data is GitHubSourceData => {
    return data !== null && typeof data === 'object' && 'repo_url' in data;
  }, []);

  // Function to construct GitHub URL from owner and repo
  const constructGitHubUrl = useCallback((owner: string, repo: string) => {
    return `https://github.com/${owner}/${repo}`;
  }, []);

  // Function to fetch repository data
  const fetchRepositoryData = useCallback(
    async (sourceType: SourceType, sourceData: SourceData, forceRefresh: boolean = false) => {
      if (loading) return;

      // Don't fetch again if we already have the data for this source (unless forced)
      if (!forceRefresh && output && currentRepoId) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        if (sourceType === 'github' && isGitHubSourceData(sourceData)) {
          const requestData = {
            ...sourceData,
            access_token: session?.accessToken || undefined,
            jwt_token: session?.jwt_token || undefined,
          };

          const response = await fetchGithubRepoWithAuth(requestData);
          setOutput(response.text_content);
          setCurrentRepoId(response.repo_id);
          setSourceType('github');
          setSourceData(requestData);

          // Repository ID is now stored in the session, no need to update URL
        } else if (sourceType === 'zip' && sourceData instanceof File) {
          // For ZIP files, we would need the actual file, which might not be available on refresh
          throw new Error('ZIP file data not available on page refresh');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch repository data';
        setError(errorMessage);
        console.error('Error fetching repository data:', err);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      output,
      currentRepoId,
      setLoading,
      setError,
      setOutput,
      setCurrentRepoId,
      setSourceType,
      setSourceData,
      fetchGithubRepoWithAuth,
      isGitHubSourceData,
      session?.accessToken,
      session?.jwt_token,
      router,
      owner,
      repo,
    ],
  );

  // Auto-fetch data on mount if we have the necessary info but no data
  useEffect(() => {
    if (hasAttemptedFetch) return;

    // If we already have output and it matches the current context, don't fetch
    if (output && currentRepoId && sourceType && sourceData) {
      setHasAttemptedFetch(true);
      return;
    }

    // If we have URL params but no context data, construct the request
    if (owner && repo && !sourceType && !sourceData) {
      const repoUrl = constructGitHubUrl(owner, repo);
      const githubSourceData: GitHubSourceData = {
        repo_url: repoUrl,
        branch: branch || 'main',
      };

      // Set the source data first, then fetch
      setSourceType('github');
      setSourceData(githubSourceData);
      fetchRepositoryData('github', githubSourceData);
      setHasAttemptedFetch(true);
    }
    // If we have source data but no output, fetch it
    else if (sourceType && sourceData && !output) {
      fetchRepositoryData(sourceType, sourceData);
      setHasAttemptedFetch(true);
    }
  }, [
    hasAttemptedFetch,
    owner,
    repo,
    branch,
    output,
    currentRepoId,
    sourceType,
    sourceData,
    constructGitHubUrl,
    fetchRepositoryData,
    setSourceType,
    setSourceData,
  ]);

  // Expose a manual refresh function
  const refreshData = useCallback(() => {
    if (sourceType && sourceData) {
      setHasAttemptedFetch(false);
      fetchRepositoryData(sourceType, sourceData, true);
    }
  }, [sourceType, sourceData, fetchRepositoryData]);

  return {
    // Current state
    output,
    loading,
    error,
    currentRepoId,
    sourceType,
    sourceData,

    // Actions
    refreshData,

    // Status
    hasAttemptedFetch,
  };
}
