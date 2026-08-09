'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Github,
  Upload,
  GitBranch,
  Lock,
  Zap,
  ArrowRight,
  CheckCircle,
  X,
  Settings,
  AlertCircle,
  ExternalLink,
  Code,
  ChevronUp,
  Edit,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showToast } from '@/components/toaster';

import { cn } from '@/lib/utils';
import { 
  fetchGithubRepo, 
  uploadLocalZip, 
  getRepositoryBranches, 
  getRepositoryInfo,
  resolveBranch,
  getGitHubInstallations,
  getGitHubInstallationRepositories
} from '@/utils/api';
import { useResultData } from '@/context/ResultDataContext';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';
import { SupportedLanguages, type Language } from '@/components/supported-languages';
import { IndexedRepositories } from '@/components/IndexedRepositories';

// --- Constants & Types ---
const SUPPORTED_LANGUAGES: Language[] = [
  { name: 'Python', supported: true },
  { name: 'JavaScript', supported: true },
  { name: 'TypeScript', supported: true },
  { name: 'Ruby', supported: false },
  { name: 'Java', supported: false },
  { name: 'Go', supported: false },
  { name: 'Rust', supported: false },
];

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  branch: string;
  default_branch?: string;
}

export function RepoTabs({ prefilledRepo }: { prefilledRepo?: string | null }) {
  // --- Hooks & Context ---
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    setOutput,
    loading,
    setLoading,
    setError,
    setSourceType,
    setSourceData,
    setOutputMessage,
    setCurrentRepoId,
  } = useResultData();
  const fetchGithubRepoWithAuth = useApiWithAuth(fetchGithubRepo);
  const uploadLocalZipWithAuth = useApiWithAuth(uploadLocalZip);
  const getGitHubInstallationsWithAuth = useApiWithAuth(getGitHubInstallations);
  const getGitHubInstallationRepositoriesWithAuth = useApiWithAuth(getGitHubInstallationRepositories);
  const getRepositoryInfoWithAuth = useApiWithAuth(getRepositoryInfo);
  const getRepositoryBranchesWithAuth = useApiWithAuth(getRepositoryBranches);

  // --- State for GitHub URL & ZIP Upload Tabs ---
  const [repoUrl, setRepoUrl] = useState(prefilledRepo || '');
  const [accessToken, setAccessToken] = useState('');
  const [branch, setBranch] = useState('');
  const [suggestedBranch, setSuggestedBranch] = useState<string>('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isDetectingBranch, setIsDetectingBranch] = useState(false);
  const [branchDetectionError, setBranchDetectionError] = useState<string>('');
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [repoSize, setRepoSize] = useState<number | null>(null);
  const [isDetectingRepo, setIsDetectingRepo] = useState(false);
  const [showBranchSection, setShowBranchSection] = useState(false);
  const [buttonTextIndex, setButtonTextIndex] = useState(0);
  const [isLargeRepo, setIsLargeRepo] = useState(false);

  // Button text rotation during loading for better UX
  const loadingButtonTexts = [
    'Analyzing Repository',
    'Generating Insights',
    'Processing & Visualizing',
    'Extracting Structure',
    'Mapping Dependencies',
    'Building Visualization',
    'Creating Documentation',
    'Parsing Code Structure',
  ];
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [showAutoFillBadge, setShowAutoFillBadge] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State for "My Repositories" Tab ---
  const [activeMainTab, setActiveMainTab] = useState('github');
  const [isAppInstalled, setIsAppInstalled] = useState<boolean | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReposLoading, setIsReposLoading] = useState(true);
  const [activeRepoFilter, setActiveRepoFilter] = useState('all');
  const [processingRepos, setProcessingRepos] = useState<number[]>([]);

  // --- State for My Repos Branch Selection ---
  const [repoBranchStates, setRepoBranchStates] = useState<{
    [repoId: number]: {
      branches: string[];
      selectedBranch: string;
      defaultBranch: string;
      isLoading: boolean;
      showBranchSelection: boolean;
    };
  }>({});
  const [loadingBranches, setLoadingBranches] = useState<number[]>([]);

  useEffect(() => {
    // If the user is logged in and the session contains an access token,
    // update the local state to pre-fill the input field.
    if (status === 'authenticated' && session?.accessToken) {
      setAccessToken(session.accessToken as string);
    }
  }, [session, status]);

  // Debug effect to track when repositories are loaded
  useEffect(() => {
    console.log('[DEBUG] Repositories useEffect triggered. Length:', repositories.length);
    console.log(
      '[DEBUG] First 3 repo names:',
      repositories.slice(0, 3).map((r) => r.name),
    );
    if (repositories.length > 0) {
      console.log('[DEBUG] Repositories loaded:', repositories.length);
    }
  }, [repositories]);

  // Debug effect to track loading state changes
  useEffect(() => {
    console.log('[DEBUG] isReposLoading changed to:', isReposLoading);
  }, [isReposLoading]);

  // --- Handlers for "My Repositories" Tab ---
  const handleError = useCallback((message: string) => {
    showToast.error(message);
  }, []);

  const handleSuccess = useCallback((message: string) => {
    showToast.success(message);
  }, []);

  // Function to detect repository info (size, branches) for GitHub repos using unified API
  const detectRepositoryInfo = useCallback(
    async (url: string, token?: string) => {
      if (!url || !url.includes('github.com')) {
        setSuggestedBranch('');
        setAvailableBranches([]);
        setBranchDetectionError('');
        setRepoSize(null);
        setIsLargeRepo(false);
        setShowBranchSection(false);
        return;
      }

      setIsDetectingBranch(true);
      setIsDetectingRepo(true);
      setBranchDetectionError('');

      try {
        // Use the new unified API function that fetches everything in one call
        const repoInfo = await getRepositoryInfoWithAuth(url, token);

        // Set all the repository information at once
        setRepoSize(repoInfo.size);
        setIsLargeRepo(repoInfo.isLargeRepo);
        setSuggestedBranch(repoInfo.defaultBranch);
        setAvailableBranches(repoInfo.branches);
        setShowBranchSection(true);

        // Auto-fill branch if it's empty
        if (!branch.trim()) {
          setBranch(repoInfo.defaultBranch);
        }
      } catch (error) {
        console.warn('Could not detect repository info:', error);
        setBranchDetectionError('Could not auto-detect branches');
        setSuggestedBranch('main'); // fallback
        setAvailableBranches(['main', 'master', 'develop']); // common fallbacks
        setRepoSize(null);
        setIsLargeRepo(false);
        setShowBranchSection(true);
        if (!branch.trim()) {
          setBranch('main');
        }
      } finally {
        setIsDetectingBranch(false);
        setIsDetectingRepo(false);
      }
    },
    [branch],
  );

  // Detect repository info when URL or access token changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (repoUrl.trim() && repoUrl.includes('github.com')) {
        detectRepositoryInfo(repoUrl.trim(), accessToken);
      } else {
        setSuggestedBranch('');
        setAvailableBranches([]);
        setBranchDetectionError('');
        setRepoSize(null);
        setIsLargeRepo(false);
        setShowBranchSection(false);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [repoUrl, accessToken, detectRepositoryInfo]);

  // Button text rotation effect during loading only
  useEffect(() => {
    // Only rotate text during loading states
    if (!loading || activeMainTab !== 'github') return;

    const interval = setInterval(() => {
      setButtonTextIndex((prev) => (prev + 1) % loadingButtonTexts.length);
    }, 2000); // Change every 2 seconds during loading

    return () => clearInterval(interval);
  }, [loading, activeMainTab, loadingButtonTexts.length]);

  // Handle URL auto-fill detection and animation
  useEffect(() => {
    if (prefilledRepo && prefilledRepo.trim() !== '') {
      setIsAutoFilled(true);
      setShowAutoFillBadge(true);
      setShouldPulse(true);

      // Show success toast for auto-fill
      setTimeout(() => {
        handleSuccess('🚀 Repository URL auto-filled from gitvizz.com link!');
      }, 500);

      // Stop pulse animation after 2 seconds
      const pulseTimer = setTimeout(() => {
        setShouldPulse(false);
      }, 2000);

      // Show the badge for 4 seconds, then fade it out
      const badgeTimer = setTimeout(() => {
        setShowAutoFillBadge(false);
      }, 4000);

      return () => {
        clearTimeout(pulseTimer);
        clearTimeout(badgeTimer);
      };
    }
  }, [prefilledRepo, handleSuccess]);

  // Replace the single effect with two effects to avoid race conditions with HMR
  // 1) Check installation and set installationId/isAppInstalled
  useEffect(() => {
    // Only when user is on My Repos
    if (activeMainTab !== 'my-repos') return;

    // If user isn't authenticated, stop loading
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      setIsReposLoading(false);
      return;
    }

    // If already determined, skip
    if (isAppInstalled !== null) return;

    const controller = new AbortController();

    const run = async () => {
      try {
        // Clean URL (GitHub redirects add these)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('installation_id') && urlParams.has('setup_action')) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        setIsReposLoading(true);
        
        // Use the new backend API  
        const jwtToken = session?.jwt_token || `Bearer ${session?.accessToken}`;
        const installationsData = await getGitHubInstallationsWithAuth(jwtToken);
        
        const hasInstalls =
          Array.isArray(installationsData.installations) &&
          installationsData.installations.length > 0;

        setIsAppInstalled(hasInstalls);
        setInstallationId(hasInstalls ? installationsData.installations[0].id : null);

        // If no installs, stop loading here; otherwise, repos effect will manage loading
        if (!hasInstalls) {
          setIsReposLoading(false);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error fetching installations:', error);
        setIsAppInstalled(false);
        setIsReposLoading(false);
        handleError('Failed to check GitHub app installation.');
      }
    };

    run();
    return () => controller.abort();
  }, [activeMainTab, status, isAppInstalled, session?.accessToken, handleError]);

  // 2) Fetch repositories once installationId is known
  useEffect(() => {
    if (activeMainTab !== 'my-repos') return;
    if (status !== 'authenticated') return;
    if (!installationId) return;

    // Avoid refetching if we already have repos
    if (repositories.length > 0) return;

    const controller = new AbortController();

    const run = async () => {
      try {
        setIsReposLoading(true);
        
        // Use the new backend API
        const jwtToken = session?.jwt_token || `Bearer ${session?.accessToken}`;
        const reposData = await getGitHubInstallationRepositoriesWithAuth(jwtToken, installationId);
        
        const transformedRepos = (reposData.repositories || []).map(
          (repo) => ({
            ...repo,
            description: repo.description || 'No description available',
          }),
        );

        setRepositories(transformedRepos as Repository[]);

        // Auto-load branches for first few repositories to encourage branch selection
        if (transformedRepos.length > 0) {
          handleSuccess(`Successfully loaded ${transformedRepos.length} GitHub repositories`);

          // Load branches for first 3 repositories automatically
          const reposToAutoLoad = transformedRepos.slice(0, 3);
          reposToAutoLoad.forEach((repo) => {
            // Don't auto-load if already loading or loaded
            if (!loadingBranches.includes(repo.id) && !repoBranchStates[repo.id]) {
              loadRepoBranches(repo as Repository);
            }
          });
        } else {
          handleSuccess(
            'No repositories found - you may need to grant access to more repositories',
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error fetching GitHub repositories:', error);
        handleError('Failed to fetch GitHub repositories. Please try again.');
      } finally {
        if (!controller.signal.aborted) setIsReposLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [
    activeMainTab,
    status,
    installationId,
    repositories.length,
    session?.accessToken,
    handleError,
    handleSuccess,
  ]);

  // --- Derived & Action Helpers for My Repositories ---
  const filteredRepositories: Repository[] = repositories.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matches =
      r.name.toLowerCase().includes(q) ||
      r.full_name.toLowerCase().includes(q) ||
      (r.description ? r.description.toLowerCase().includes(q) : false);

    if (activeRepoFilter === 'public') return matches && !r.private;
    if (activeRepoFilter === 'private') return matches && r.private;
    return matches;
  });

  const handleInstallApp = () => {
    try {
      const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'gitvizz';
      window.location.href = `https://github.com/apps/${appName}/installations/new`;
    } catch {
      handleError('Failed to initiate GitHub app installation.');
    }
  };

  const handleManageAccess = () => {
    try {
      const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'gitvizz';
      if (installationId) {
        window.open(`https://github.com/apps/${appName}/installations/${installationId}`, '_blank');
      } else {
        window.open('https://github.com/settings/installations', '_blank');
      }
    } catch {
      handleError('Failed to open GitHub settings.');
    }
  };

  // --- My Repos Branch Selection Functions ---
  const loadRepoBranches = useCallback(
    async (repo: Repository) => {
      if (loadingBranches.includes(repo.id)) return;

      setLoadingBranches((prev) => [...prev, repo.id]);

      try {
        const repoUrl = repo.html_url;
        const branches = await getRepositoryBranchesWithAuth(repoUrl, session?.accessToken || undefined);

        // Determine a default branch
        let defaultBranch = repo.default_branch || '';
        if (!defaultBranch) {
          if (branches.includes('main')) defaultBranch = 'main';
          else if (branches.includes('master')) defaultBranch = 'master';
          else defaultBranch = branches[0] || 'main';
        }

        setRepoBranchStates((prev) => ({
          ...prev,
          [repo.id]: {
            branches,
            selectedBranch: prev[repo.id]?.selectedBranch || defaultBranch,
            defaultBranch,
            isLoading: false,
            showBranchSelection: true,
          },
        }));
      } catch (e) {
        console.error('Failed to load branches:', e);
        handleError('Failed to load branches for this repository.');
      } finally {
        setLoadingBranches((prev) => prev.filter((id) => id !== repo.id));
      }
    },
    [loadingBranches, repoBranchStates, session?.accessToken, handleError],
  );

  const handleRepoBranchSelect = (repoId: number, branchName: string) => {
    setRepoBranchStates((prev) => ({
      ...prev,
      [repoId]: {
        ...prev[repoId],
        selectedBranch: branchName,
      },
    }));
  };

  const toggleRepoBranchSelection = async (repo: Repository) => {
    const state = repoBranchStates[repo.id];
    if (!state || state.branches.length === 0) {
      await loadRepoBranches(repo);
    } else {
      setRepoBranchStates((prev) => ({
        ...prev,
        [repo.id]: {
          ...prev[repo.id],
          showBranchSelection: !prev[repo.id].showBranchSelection,
        },
      }));
    }
  };

  const handleVizifyRepo = async (repo: Repository) => {
    if (processingRepos.includes(repo.id)) return;

    // Check if branch is selected - make it mandatory
    const repoState = repoBranchStates[repo.id];
    if (!repoState?.selectedBranch) {
      handleError('Please select a branch before proceeding.');
      return;
    }

    setProcessingRepos((prev) => [...prev, repo.id]);
    try {
      const repoUrl = repo.html_url;
      const selected = repoState.selectedBranch;

      const finalBranch = await resolveBranch(
        repoUrl,
        selected || undefined,
        session?.accessToken || undefined,
      );

      const requestData = {
        repo_url: repoUrl,
        access_token: session?.accessToken || undefined,
        branch: finalBranch,
        token: session?.jwt_token || undefined,
      };

      const { text_content: formattedText, repo_id } = await fetchGithubRepoWithAuth(requestData);
      setCurrentRepoId(repo_id);
      setOutput(formattedText);
      setSourceType('github');
      setSourceData(requestData);
      setOutputMessage('Repository analysis successful!');

      handleSuccess('Analysis complete! Redirecting to results page...');

      try {
        const url = new URL(repoUrl);
        const parts = url.pathname.split('/').filter(Boolean);
        const owner = parts[0];
        const name = parts[1];
        router.push(`/results/${owner}/${name}/${finalBranch}`);
      } catch {
        router.push('/results');
      }
    } catch (e) {
      console.error('Error processing repository:', e);
      handleError('Failed to process repository. Please try again.');
    } finally {
      setProcessingRepos((prev) => prev.filter((id) => id !== repo.id));
    }
  };

  // --- Handlers for GitHub URL & ZIP Upload Forms ---
  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setError('Please enter a repository URL');
      return;
    }
    setLoading(true);
    setError(null);
    setOutput(null);
    setOutputMessage(null);

    try {
      // Resolve the branch before making the request
      let finalBranch = branch.trim();
      if (repoUrl.includes('github.com')) {
        const resolvedBranch = await resolveBranch(
          repoUrl.trim(),
          branch.trim() || undefined,
          accessToken.trim() || undefined,
        );
        finalBranch = resolvedBranch;

        // Update the UI to show the resolved branch
        if (finalBranch !== branch.trim()) {
          setBranch(finalBranch);
          handleSuccess(`Auto-resolved to branch '${finalBranch}'`);
        }
      }

      const requestData = {
        repo_url: repoUrl.trim(),
        access_token: accessToken.trim() || undefined,
        branch: finalBranch,
        token: session?.jwt_token || undefined,
      };

      const { text_content: formattedText, repo_id } = await fetchGithubRepoWithAuth(requestData);
      setCurrentRepoId(repo_id);
      setOutput(formattedText);
      setSourceType('github');
      setSourceData(requestData);
      setOutputMessage('Repository analysis successful!');
      
      handleSuccess('Analysis complete! Redirecting to results page...');
      
      try {
        const url = new URL(repoUrl.trim());
        const parts = url.pathname.split('/').filter(Boolean);
        const owner = parts[0];
        const name = parts[1];
        router.push(`/results/${owner}/${name}/${finalBranch}`);
      } catch {
        router.push('/results');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to analyze repository.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) {
      setError('Please select a ZIP file');
      return;
    }
    setLoading(true);
    setError(null);
    setOutput(null);
    setOutputMessage(null);

    try {
      const { text_content: text, repo_id } = await uploadLocalZipWithAuth(
        zipFile,
        session?.jwt_token || undefined,
      );
      setCurrentRepoId(repo_id);
      setOutput(text);
      setSourceType('zip');
      setSourceData(zipFile);
      setOutputMessage('ZIP file processed successfully!');

      handleSuccess('Processing complete! Redirecting to results page...');

      const zipName = zipFile.name.replace(/\.zip$/i, '');
      router.push(`/results/zip/${encodeURIComponent(zipName)}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to process ZIP file.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setZipFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setZipFile(e.target.files[0]);
      setError(null);
    }
  };

  // --- Render Method ---
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
      <div className="space-y-4">
        <Tabs
          defaultValue="github"
          className="space-y-2 gap-0"
          onValueChange={(val) => {
            if (val === 'my-repos' && status === 'unauthenticated') {
              router.push('/signin');
              return;
            }
            setActiveMainTab(val);
          }}
        >
          {/* Tab Navigation */}
          <div className="flex justify-center">
            <TabsList className="bg-background/80 backdrop-blur-xl border border-border/60 rounded-2xl p-1 sm:p-2 shadow-lg min-h-[50px] sm:min-h-[60px] w-full sm:w-auto">
              <TabsTrigger
                value="github"
                className="rounded-xl px-3 sm:px-8 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2 sm:gap-3 min-w-[120px] sm:min-w-[160px] justify-center"
              >
                <Github className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">GitHub Repository</span>
                <span className="sm:hidden">GitHub</span>
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                className="rounded-xl px-3 sm:px-8 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2 sm:gap-3 min-w-[120px] sm:min-w-[160px] justify-center"
              >
                <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">ZIP Upload</span>
                <span className="sm:hidden">Upload</span>
              </TabsTrigger>
              <TabsTrigger
                value="my-repos"
                className="rounded-xl px-3 sm:px-8 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:bg-muted/50 flex items-center gap-2 sm:gap-3 min-w-[120px] sm:min-w-[160px] justify-center"
              >
                <GitBranch className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">My Repositories</span>
                <span className="sm:hidden">My Repos</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* GitHub Tab */}
          <TabsContent
            value="github"
            className="animate-in fade-in-50 duration-300 max-h-[70vh] overflow-y-auto"
          >
            <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-primary/10">
                    <Github className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold tracking-tight">
                      GitHub Repository
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Enter a GitHub repository URL to analyze its structure and generate insights
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-8">
                <form onSubmit={handleGitHubSubmit} className="space-y-4 sm:space-y-6">
                  {/* Repository URL Section */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="repo-url"
                        className="flex items-center gap-2 text-sm font-medium"
                      >
                        <Github className="h-4 w-4 text-primary" /> Repository URL
                      </Label>
                      <SupportedLanguages languages={SUPPORTED_LANGUAGES} />
                    </div>
                    <div className="space-y-3">
                      <div className="relative">
                        <Input
                          id="repo-url"
                          placeholder="https://github.com/username/repository"
                          value={repoUrl}
                          onChange={(e) => {
                            setRepoUrl(e.target.value);
                            // Clear auto-fill state when user manually edits
                            if (isAutoFilled) {
                              setIsAutoFilled(false);
                              setShowAutoFillBadge(false);
                              setShouldPulse(false);
                            }
                          }}
                          className={cn(
                            'h-10 sm:h-12 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm text-sm sm:text-base transition-all duration-700',
                            isAutoFilled &&
                              'ring-2 ring-primary/30 border-primary/60 bg-primary/8 shadow-lg shadow-primary/10',
                            shouldPulse && 'animate-pulse',
                          )}
                          required
                        />

                        {/* Auto-fill indication badge */}
                        {showAutoFillBadge && (
                          <div className="absolute -top-2 right-2 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                            <Badge className="bg-primary/90 text-primary-foreground border-primary/20 rounded-xl px-3 py-1 text-xs font-medium shadow-lg backdrop-blur-sm">
                              <Zap className="h-3 w-3 mr-1.5" />
                              Auto-filled from URL
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Repository Size Warning */}
                      {isLargeRepo && repoSize && (
                        <div className="animate-in slide-in-from-top-1 duration-300">
                          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Large repository detected ({(repoSize / 1024).toFixed(1)}MB)
                              </span>
                              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                This might affect website performance during analysis
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Branch Selection - Appears below URL when GitHub repo is detected */}
                      {showBranchSection && (
                        <div className="animate-in slide-in-from-top-1 duration-300">
                          <div className="flex items-center gap-3 p-3 bg-muted/30 border border-border/30 rounded-lg">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground">
                                Branch:
                              </span>

                              {availableBranches.length > 0 && !showBranchInput ? (
                                // Show dropdown when branches are available
                                <Select
                                  value={branch || ''}
                                  onValueChange={(value) => {
                                    if (value === '__custom__') {
                                      setShowBranchInput(true);
                                    } else {
                                      setBranch(value);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 border-0 bg-background/60 hover:bg-background/80 focus:ring-1 focus:ring-primary/30 text-sm min-w-0 flex-1">
                                    <SelectValue placeholder={suggestedBranch || 'Select branch'} />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[200px] min-w-[160px]">
                                    {availableBranches.map((branchName) => (
                                      <SelectItem key={branchName} value={branchName}>
                                        <div className="flex items-center gap-2 w-full">
                                          <span className="flex-1 truncate">{branchName}</span>
                                          {branchName === suggestedBranch && (
                                            <Badge
                                              variant="secondary"
                                              className="text-[10px] px-1.5 py-0.5"
                                            >
                                              default
                                            </Badge>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">
                                      <div className="flex items-center gap-2 w-full text-muted-foreground">
                                        <Edit className="h-3 w-3" />
                                        <span>Custom branch...</span>
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                // Show input when branches are not available or user chooses custom input
                                <Input
                                  placeholder={suggestedBranch || 'main'}
                                  value={branch || ''}
                                  onChange={(e) => setBranch(e.target.value)}
                                  className="h-8 border-0 bg-background/60 hover:bg-background/80 focus:ring-1 focus:ring-primary/30 text-sm min-w-0 flex-1"
                                  disabled={isDetectingBranch}
                                />
                              )}
                            </div>

                            {/* Status indicators */}
                            <div className="flex items-center gap-2 shrink-0">
                              {isDetectingBranch ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : suggestedBranch && !branchDetectionError ? (
                                <div className="flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                  <span className="text-xs text-emerald-600">
                                    {availableBranches.length > 0
                                      ? `${availableBranches.length} found`
                                      : 'detected'}
                                  </span>
                                </div>
                              ) : branchDetectionError ? (
                                <div className="flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4 text-amber-500" />
                                  <span className="text-xs text-amber-600">Manual</span>
                                </div>
                              ) : null}

                              {/* Repository size indicator */}
                              {repoSize && !isDetectingRepo && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span>{(repoSize / 1024).toFixed(1)}MB</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="rounded-xl text-muted-foreground hover:text-foreground text-xs sm:text-sm"
                    >
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-2" /> Advanced Options
                      <ArrowRight
                        className={cn(
                          'h-3 w-3 sm:h-4 sm:w-4 ml-2 transition-transform',
                          showAdvanced && 'rotate-90',
                        )}
                      />
                    </Button>
                  </div>

                  {showAdvanced && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2 sm:space-y-3">
                        <Label
                          htmlFor="access-token"
                          className="flex items-center gap-2 text-sm font-medium"
                        >
                          <Lock className="h-4 w-4 text-primary" /> Access Token (Optional)
                        </Label>
                        <Input
                          id="access-token"
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxx"
                          value={accessToken || ''}
                          onChange={(e) => setAccessToken(e.target.value)}
                          className="h-10 sm:h-12 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm text-sm sm:text-base"
                        />
                        <p className="text-xs text-muted-foreground">
                          Provide your GitHub token to access private repositories and avoid rate
                          limits.
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      !repoUrl.trim() ||
                      isDetectingBranch ||
                      isDetectingRepo ||
                      (repoUrl.includes('github.com') &&
                        !showBranchSection &&
                        !branchDetectionError)
                    }
                    className={cn(
                      'w-full h-10 sm:h-12 text-sm sm:text-base rounded-xl transition-all duration-300',
                      loading ||
                        !repoUrl.trim() ||
                        isDetectingBranch ||
                        isDetectingRepo ||
                        (repoUrl.includes('github.com') &&
                          !showBranchSection &&
                          !branchDetectionError)
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-[1.02] shadow-lg hover:shadow-xl',
                    )}
                    size="lg"
                  >
                    {loading && activeMainTab === 'github' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        <span className="hidden sm:inline transition-all duration-500">
                          {loadingButtonTexts[buttonTextIndex]}
                        </span>
                        <span className="sm:hidden">Processing</span>
                      </>
                    ) : isDetectingBranch || isDetectingRepo ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Getting repo information...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Vizzify</span>
                        <span className="sm:hidden">Vizzify</span>
                        <ArrowRight className="h-4 w-4 ml-2" />
                        {repoSize && (
                          <span className="hidden md:inline ml-2 text-xs opacity-75">
                            ({(repoSize / 1024).toFixed(1)}MB)
                          </span>
                        )}
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent
            value="upload"
            className="animate-in fade-in-50 duration-300 max-h-[70vh] overflow-y-auto"
          >
            {/* ... (Existing Upload tab content is unchanged) ... */}
            <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-primary/10">
                    <Upload className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold tracking-tight">
                      ZIP File Upload
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Upload a ZIP file containing your project to analyze its structure
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-8">
                <form onSubmit={handleZipSubmit} className="space-y-4 sm:space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Upload File</span>
                    <SupportedLanguages languages={SUPPORTED_LANGUAGES} />
                  </div>
                  <div
                    className={cn(
                      'relative border-2 border-dashed rounded-xl sm:rounded-2xl p-6 sm:p-12 text-center transition-all duration-300',
                      dragActive
                        ? 'border-primary bg-primary/5 scale-[1.02]'
                        : 'border-border/50 hover:border-primary/50 hover:bg-muted/20',
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-3 sm:space-y-4">
                      <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center">
                        <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                      </div>
                      <div className="space-y-1 sm:space-y-2">
                        <p className="text-sm sm:text-lg font-medium">
                          {dragActive
                            ? 'Drop your ZIP file here'
                            : 'Click to browse or drag and drop'}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Supports ZIP files up to 100MB
                        </p>
                      </div>
                    </div>
                  </div>
                  {zipFile && (
                    <div className="bg-muted/30 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/30 animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 sm:p-2 bg-green-500/10 rounded-lg sm:rounded-xl flex-shrink-0">
                          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">
                            {zipFile.name}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Badge className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20 text-xs">
                          Ready
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setZipFile(null)}
                          className="h-6 w-6 sm:h-8 sm:w-8 rounded-full hover:bg-muted/50 flex-shrink-0"
                        >
                          <X className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={loading || !zipFile}
                    className="w-full h-10 sm:h-12 text-sm sm:text-base rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02]"
                    size="lg"
                  >
                    {loading && activeMainTab === 'upload' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Process ZIP File</span>
                        <span className="sm:hidden">Process</span>
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>

          {/* My Repositories Tab */}
          <TabsContent value="my-repos" className="animate-in fade-in-50 duration-300">
            <div className="bg-background/60 backdrop-blur-xl border border-border/50 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
              {/* {(() => {
                console.log('[DEBUG] Rendering my-repos tab:', {
                  isReposLoading,
                  isAppInstalled,
                  repositoriesLength: repositories.length,
                  filteredLength: filteredRepositories.length,
                });
                return null;
              })()} */}
              {isReposLoading ? (
                <>
                  {/* Top loader banner */}
                  <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold tracking-tight">
                          Getting your repositories...
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          Please wait while we fetch your GitHub repositories
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-10 w-64 rounded-xl" />
                      <Skeleton className="h-10 w-32 rounded-xl" />
                    </div>
                    <Skeleton className="h-12 w-full rounded-2xl" />
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                  </div>
                </>
              ) : !isAppInstalled ? (
                <>
                  <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-primary/10">
                        <Github className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold tracking-tight">
                          Connect to GitHub
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          Install our GitHub App to select from your repositories
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-8">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="rounded-full bg-primary/10 p-4 mb-6">
                        <Github className="h-8 w-8 text-primary" />
                      </div>
                      <h2 className="text-2xl font-semibold mb-2">Connect Your Repositories</h2>
                      <p className="text-muted-foreground max-w-md mb-8">
                        Install the gitvizz GitHub App to securely access and analyze your
                        repositories with one click.
                      </p>
                      <Button
                        size="lg"
                        className="w-full max-w-sm h-12 text-base rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02]"
                        onClick={handleInstallApp}
                      >
                        <Github className="h-5 w-5 mr-2" /> Set up GitHub App{' '}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 sm:p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Input
                        placeholder="Search repositories..."
                        className="w-full h-10 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Code className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                    <Button
                      variant="outline"
                      className="h-10 px-4 text-sm rounded-xl hover:bg-muted/50 transition-all duration-200 self-end sm:self-auto"
                      onClick={handleManageAccess}
                    >
                      Manage Access <ExternalLink className="h-4 w-4 ml-2" />
                    </Button>
                  </div>

                  <Tabs defaultValue="all" className="w-full" onValueChange={setActiveRepoFilter}>
                    <div className="flex justify-center mb-2">
                      <TabsList className="bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50 p-1 h-auto">
                        <TabsTrigger
                          value="all"
                          className="rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50"
                        >
                          All
                          <Badge variant="secondary" className="ml-2 text-xs h-5 px-2">
                            {repositories.length}
                          </Badge>
                        </TabsTrigger>
                        <TabsTrigger
                          value="public"
                          className="rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50"
                        >
                          <Code className="h-4 w-4 mr-2" />
                          Public
                          <Badge variant="secondary" className="ml-2 text-xs h-5 px-2">
                            {repositories.filter((r) => !r.private).length}
                          </Badge>
                        </TabsTrigger>
                        <TabsTrigger
                          value="private"
                          className="rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50"
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          Private
                          <Badge variant="secondary" className="ml-2 text-xs h-5 px-2">
                            {repositories.filter((r) => r.private).length}
                          </Badge>
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <div>
                      {filteredRepositories.length > 0 ? (
                        <div className="divide-y divide-border/30 border border-border/50 rounded-xl overflow-hidden bg-background/20 max-h-[45vh] overflow-y-auto">
                          {filteredRepositories.map((repo) => {
                            const repoState = repoBranchStates[repo.id];
                            const isLoadingBranches = loadingBranches.includes(repo.id);
                            const hasSelectedBranch = repoState?.selectedBranch;
                            // Fixed: Only show branch UI if explicitly toggled on, not just because branch is selected
                            const showBranchUI = repoState?.showBranchSelection === true;
                            const isProcessingRepo = processingRepos.includes(repo.id);

                            return (
                              <div
                                key={repo.id}
                                className={cn(
                                  'relative p-4 sm:p-5 hover:bg-muted/20 transition-all duration-200',
                                  (isProcessingRepo || loading) && 'opacity-60 bg-muted/5',
                                )}
                              >
                                {/* Main repository info */}
                                <div className="flex items-center gap-4 mb-3">
                                  <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                                    {repo.private ? (
                                      <Lock className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Code className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <a
                                        href={repo.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-semibold tracking-tight truncate hover:underline"
                                      >
                                        {repo.name}
                                      </a>
                                      {repo.private && (
                                        <Badge variant="outline" className="text-xs rounded-md">
                                          Private
                                        </Badge>
                                      )}
                                      {repo.language && (
                                        <Badge variant="secondary" className="text-xs rounded-md">
                                          {repo.language}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                      {repo.description}
                                    </p>
                                  </div>
                                </div>

                                {/* Minimalistic Branch Selection - Inline */}
                                {showBranchUI && (
                                  <div className="mb-3 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                                    <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                                    {repoState?.branches.length > 0 ? (
                                      <Select
                                        value={repoState.selectedBranch || ''}
                                        onValueChange={(branch) =>
                                          handleRepoBranchSelect(repo.id, branch)
                                        }
                                      >
                                        <SelectTrigger className="h-7 text-xs rounded-md bg-background/70 border-border/40 w-auto min-w-[120px]">
                                          <SelectValue placeholder="Branch" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[120px]">
                                          {repoState.branches.map((branchName) => (
                                            <SelectItem key={branchName} value={branchName}>
                                              <div className="flex items-center gap-2 w-full">
                                                <span className="flex-1 truncate">
                                                  {branchName}
                                                </span>
                                                {branchName === repoState.defaultBranch && (
                                                  <Badge
                                                    variant="secondary"
                                                    className="text-xs ml-2 shrink-0"
                                                  >
                                                    default
                                                  </Badge>
                                                )}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        {repoState?.defaultBranch || 'main'}
                                      </span>
                                    )}
                                    {isLoadingBranches && (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    )}
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center justify-between">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleRepoBranchSelection(repo)}
                                    disabled={isLoadingBranches || isProcessingRepo}
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    {isLoadingBranches ? (
                                      <>
                                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                        Loading
                                      </>
                                    ) : showBranchUI ? (
                                      <>
                                        <ChevronUp className="h-3 w-3 mr-1" />
                                        Hide
                                      </>
                                    ) : (
                                      <>
                                        <GitBranch className="h-3 w-3 mr-1" />
                                        {hasSelectedBranch ? (
                                          <span className="text-primary">
                                            {repoState.selectedBranch}
                                          </span>
                                        ) : (
                                          'Branch'
                                        )}
                                      </>
                                    )}
                                  </Button>

                                  <Button
                                    className="h-9 px-4 text-sm rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02]"
                                    onClick={() => handleVizifyRepo(repo)}
                                    disabled={
                                      isProcessingRepo ||
                                      loading ||
                                      !repoBranchStates[repo.id]?.selectedBranch
                                    }
                                  >
                                    {isProcessingRepo ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        <span className="hidden sm:inline">Processing...</span>
                                        <span className="sm:hidden">Processing</span>
                                      </>
                                    ) : !hasSelectedBranch ? (
                                      <>
                                        <GitBranch className="h-4 w-4 mr-2" />
                                        <span className="hidden sm:inline">
                                          Select Branch First
                                        </span>
                                        <span className="sm:hidden">Select Branch</span>
                                      </>
                                    ) : (
                                      <>
                                        <Zap className="h-4 w-4 mr-2" />
                                        <span className="hidden sm:inline">Vizify</span>
                                        <span className="sm:hidden">Go</span>
                                        {hasSelectedBranch && (
                                          <span className="hidden md:inline ml-2 text-xs opacity-75">
                                            ({repoState.selectedBranch})
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </Button>
                                </div>

                                {/* Processing shadow overlay */}
                                {isProcessingRepo && (
                                  <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px] flex items-center justify-center rounded-xl border border-border/20">
                                    <div className="bg-background/90 backdrop-blur-sm border border-border/40 rounded-lg px-3 py-2 shadow-lg">
                                      <div className="flex items-center gap-2 text-sm text-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        Processing repository...
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl">
                          <div className="rounded-full bg-muted p-3 mb-4">
                            <AlertCircle className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-medium mb-2">No Repositories Found</h3>
                          <p className="text-muted-foreground max-w-md mb-6">
                            {searchQuery
                              ? `No repositories match your search for "${searchQuery}".`
                              : `No ${activeRepoFilter !== 'all' ? activeRepoFilter : ''} repositories found. Try adding more via "Manage Access".`}
                          </p>
                        </div>
                      )}
                    </div>
                  </Tabs>
                </div>
              )}
            </div>
          </TabsContent>
          {status === 'authenticated' && <IndexedRepositories />}
        </Tabs>
      </div>
    </div>
  );
}
