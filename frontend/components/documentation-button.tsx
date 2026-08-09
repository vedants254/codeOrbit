'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FileText, Lock, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { isWikiGenerated, generateWikiDocumentation, getWikiGenerationStatus } from '@/utils/api';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';

interface DocumentationButtonProps {
  currentRepoId: string;
  token?: string;
  sourceData: {
    repo_url?: string;
  };
  sourceType: string;
}

export default function DocumentationButton({
  currentRepoId,
  sourceData,
  sourceType,
}: DocumentationButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const isWikiGeneratedWithAuth = useApiWithAuth(isWikiGenerated);
  const generateWikiDocumentationWithAuth = useApiWithAuth(generateWikiDocumentation);
  const getWikiGenerationStatusWithAuth = useApiWithAuth(getWikiGenerationStatus);

  const [isDocGenerated, setIsDocGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('');

  const checkDocumentationStatus = useCallback(async () => {
    try {
      if (!session?.jwt_token || !currentRepoId) return;

      const wikiResponse = await isWikiGeneratedWithAuth(session?.jwt_token || undefined, currentRepoId);
      setIsDocGenerated(wikiResponse.is_generated);
      setCurrentStatus(wikiResponse.status);

      // If there's an error in the response, show it
      if (wikiResponse.error) {
        setError('Try again later or contact support');
      } else {
        setError(null);
      }

      // If status is running or pending, start polling
      if (wikiResponse.status === 'running' || wikiResponse.status === 'pending') {
        setIsGenerating(true);
      }
    } catch (err) {
      console.error('Error checking documentation status:', err);
      setError('Failed to check documentation status');
    }
  }, [session?.jwt_token, currentRepoId]);

  // Check if documentation is already generated when component mounts
  useEffect(() => {
    if (session?.jwt_token && currentRepoId) {
      checkDocumentationStatus();
    }
  }, [session?.jwt_token, currentRepoId, checkDocumentationStatus]);

  // Status polling interval when generating
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isGenerating && session?.jwt_token && currentRepoId) {
      interval = setInterval(async () => {
        try {
          setIsCheckingStatus(true);
          const statusResponse = await getWikiGenerationStatusWithAuth(
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
            setError(statusResponse.error || 'Documentation generation failed');
          }
          // Continue polling for 'pending' and 'running' statuses
        } catch (err) {
          console.error('Error checking status:', err);
          // Don't stop polling on status check errors, just log them
        } finally {
          setIsCheckingStatus(false);
        }
      }, 8000); // Check every 8 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, session?.jwt_token, currentRepoId]);

  const handleGenerateDocumentation = async () => {
    if (!session?.jwt_token || !currentRepoId || !sourceData) return;

    try {
      setIsGenerating(true);
      setError(null);
      setCurrentStatus('pending');

      // Get repository URL from sourceData
      let repositoryUrl = '';
      if (sourceType === 'github' && sourceData.repo_url) {
        repositoryUrl = sourceData.repo_url;
      } else {
        throw new Error('Repository URL not available');
      }

      await generateWikiDocumentationWithAuth(
        session?.jwt_token || undefined,
        repositoryUrl,
        'en', // language
        true, // comprehensive
        'default', // selectedModel
      );

      // Status polling will be handled by the useEffect above
    } catch (err) {
      console.error('Error generating documentation:', err);
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : 'Failed to generate documentation');
    }
  };

  const handleShowDocumentation = () => {
    if (currentRepoId) {
      router.push(`/${currentRepoId}/docs`);
    }
  };

  const handleClick = () => {
    if (!session?.jwt_token) {
      router.push('/signin');
      return;
    }

    if (isDocGenerated) {
      handleShowDocumentation();
    } else {
      handleGenerateDocumentation();
    }
  };

  const getButtonText = () => {
    if (isGenerating) {
      if (isCheckingStatus) {
        return 'Checking Status...';
      }
      switch (currentStatus) {
        case 'pending':
          return 'Queued...';
        case 'running':
          return 'Generating...';
        default:
          return 'Generating...';
      }
    }
    return isDocGenerated ? 'Show Documentation' : 'Generate Documentation';
  };

  const getButtonIcon = () => {
    if (isGenerating) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (isDocGenerated) {
      return <CheckCircle className="h-4 w-4" />;
    }
    if (!session?.jwt_token) {
      return <Lock className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={isGenerating}
        className={cn(
          'rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 flex items-center gap-2',
          !session?.jwt_token && 'opacity-60',
          isDocGenerated && 'bg-green-600 hover:bg-green-700 text-white',
          isGenerating && 'opacity-75 cursor-not-allowed',
        )}
      >
        {getButtonIcon()}
        <span>{getButtonText()}</span>
      </Button>

      {error && <p className="text-xs text-red-500 mt-1 px-2">{error}</p>}

      {currentStatus && !isDocGenerated && !error && (
        <p className="text-xs text-gray-500 mt-1 px-2 capitalize">Status: {currentStatus}</p>
      )}
    </div>
  );
}
