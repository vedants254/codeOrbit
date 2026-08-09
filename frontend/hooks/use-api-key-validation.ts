'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getAvailableModels, type AvailableModelsResponse } from '@/utils/api';
import { showToast } from '@/components/toaster';
import { useApiWithAuth } from '@/hooks/useApiWithAuth';

export interface ApiKeyValidationResult {
  hasValidKeys: boolean;
  availableProviders: string[];
  userHasKeys: string[];
  isLoading: boolean;
  error: string | null;
  showApiKeyModal: boolean;
  setShowApiKeyModal: (show: boolean) => void;
  refreshKeys: () => Promise<void>;
  checkApiKeysBeforeAction: () => Promise<boolean>;
}

export function useApiKeyValidation(): ApiKeyValidationResult {
  const { data: session } = useSession();
  const router = useRouter();
  const getAvailableModelsWithAuth = useApiWithAuth(getAvailableModels);
  const [availableModels, setAvailableModels] = useState<AvailableModelsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const refreshKeys = async () => {
    if (!session?.jwt_token) return;

    setIsLoading(true);
    setError(null);

    try {
      const models = await getAvailableModelsWithAuth(session.jwt_token || undefined);
      setAvailableModels(models);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load API keys';
      setError(errorMessage);
      showToast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Load API keys on mount and session change
  useEffect(() => {
    if (session?.jwt_token) {
      refreshKeys();
    } else {
      setIsLoading(false);
    }
  }, [session?.jwt_token]);

  const checkApiKeysBeforeAction = async (): Promise<boolean> => {
    if (!session?.jwt_token) {
      showToast.error('Please sign in first');
      return false;
    }

    if (isLoading) {
      showToast.info('Checking API keys...');
      return false;
    }

    const userHasKeys = availableModels?.user_has_keys || [];

    if (userHasKeys.length === 0) {
      setShowApiKeyModal(true);
      return false;
    }

    return true;
  };

  const hasValidKeys = Boolean(availableModels?.user_has_keys?.length);
  const availableProviders = availableModels ? Object.keys(availableModels.providers) : [];
  const userHasKeys = availableModels?.user_has_keys || [];

  return {
    hasValidKeys,
    availableProviders,
    userHasKeys,
    isLoading,
    error,
    showApiKeyModal,
    setShowApiKeyModal,
    refreshKeys,
    checkApiKeysBeforeAction,
  };
}
