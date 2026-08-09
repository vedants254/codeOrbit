'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch'; // Using Switch for a better toggle UX
import {
  Key,
  Eye,
  EyeOff,
  ArrowLeft,
  Plus,
  Shield,
  Zap,
  Globe,
  Lock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  Calendar,
  Info,
  Brain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { showToast } from '@/components/toaster';
import {
  saveApiKey,
  getAvailableModels,
  verifyApiKey,
  getUserApiKeys,
  deleteUserApiKey,
  getDetailedAvailableModels,
} from '@/utils/api';
import type { AvailableModelsResponse } from '@/api-client/types.gen';
import { useResultData } from '@/context/ResultDataContext';

export default function ApiKeysPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { userKeyPreferences, setUserKeyPreferences } = useResultData();
  const addKeyCardRef = useRef<HTMLDivElement>(null);

  // State management
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    isValid?: boolean;
    message?: string;
    availableModels?: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<AvailableModelsResponse | null>(null);
  const [detailedModels, setDetailedModels] = useState<any>(null);
  const [userApiKeys, setUserApiKeys] = useState<any[]>([]);
  const [provider, setProvider] = useState<string>('gemini');
  const [isDeletingKey, setIsDeletingKey] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Fetch available models and user API keys on mount
  useEffect(() => {
    const fetchAndSetModels = async () => {
      if (!session?.jwt_token) return;
      try {
        setIsLoading(true);
        const token = session?.jwt_token || undefined;

        // Fetch basic models first
        const models = await getAvailableModels(token);
        setAvailableModels(models);

        // Try to fetch enhanced data, fallback gracefully if not available
        try {
          const [detailedModelsData, userKeysData] = await Promise.all([
            getDetailedAvailableModels(token),
            getUserApiKeys(token),
          ]);

          setDetailedModels(detailedModelsData);
          setUserApiKeys(userKeysData.keys || []);
        } catch {
          console.log('Enhanced API endpoints not available, using basic functionality');
          // Set empty fallback data
          setDetailedModels(null);
          setUserApiKeys([]);
        }

        // Initialize preferences if they don't exist (only set once)
        if (Object.keys(userKeyPreferences).length === 0 && models.user_has_keys?.length > 0) {
          const initialPreferences: Record<string, boolean> = {};
          models.user_has_keys.forEach((key) => {
            initialPreferences[key] = true;
          });
          setUserKeyPreferences(initialPreferences);
        }
      } catch {
        showToast.error('Failed to load your key configuration.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndSetModels();
  }, [session?.jwt_token]); // Only depend on session token to avoid infinite loops

  // Redirect if not authenticated
  useEffect(() => {
    if (session === null) {
      // Check for session explicitly being null after loading
      router.push('/signin');
    }
  }, [session, router]);

  const handleToggleUserKey = (provider: string, enabled: boolean) => {
    const newPreferences = { ...userKeyPreferences, [provider]: enabled };
    setUserKeyPreferences(newPreferences);
    showToast.success(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} key preference updated.`,
    );
  };

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim() || !session?.jwt_token) return;

    setIsVerifying(true);
    setIsSaving(true);
    setVerificationResult(null);

    try {
      // Step 1: Verify the API key
      const result = await verifyApiKey({
        token: session?.jwt_token || undefined,
        provider,
        api_key: apiKey.trim(),
      });

      setVerificationResult({
        isValid: result.is_valid,
        message: result.message,
        availableModels: result.available_models,
      });

      if (result.is_valid) {
        showToast.success(`✅ ${result.message}`);

        // Step 2: Save the API key since verification succeeded
        try {
          await saveApiKey({
            token: session?.jwt_token || undefined,
            provider,
            api_key: apiKey.trim(),
            key_name: keyName.trim() || undefined,
          });

          setApiKey('');
          setKeyName('');
          setVerificationResult(null);
          showToast.success(
            `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key saved successfully!`,
          );

          // Refetch all data to update the UI with the new key status
          const token = session?.jwt_token || undefined;
          const models = await getAvailableModels(token);
          setAvailableModels(models);

          // Try to refresh enhanced data
          try {
            const [detailedModelsData, userKeysData] = await Promise.all([
              getDetailedAvailableModels(token),
              getUserApiKeys(token),
            ]);

            setDetailedModels(detailedModelsData);
            setUserApiKeys(userKeysData.keys || []);
          } catch {
            console.log('Enhanced endpoints not available, skipping enhanced refresh');
          }

          // Ensure the new key is enabled by default in preferences
          handleToggleUserKey(provider, true);
        } catch (saveError) {
          showToast.error(
            `Failed to save API key: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
          );
        }
      } else {
        showToast.error(`❌ ${result.message}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setVerificationResult({
        isValid: false,
        message: errorMessage,
      });
      showToast.error(`Failed to verify API key: ${errorMessage}`);
    } finally {
      setIsVerifying(false);
      setIsSaving(false);
    }
  };

  const handleSelectProviderToAdd = (providerValue: string) => {
    setProvider(providerValue);
    setVerificationResult(null); // Clear verification when switching providers
    addKeyCardRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDeleteKey = async (providerName: string, keyId?: string) => {
    if (!session?.jwt_token) return;

    setIsDeletingKey(providerName);
    try {
      await deleteUserApiKey(session?.jwt_token || undefined, providerName, keyId);

      showToast.success(
        `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} API key deleted successfully!`,
      );

      // Refetch all data to update the UI
      const token = session?.jwt_token || undefined;
      const models = await getAvailableModels(token);
      setAvailableModels(models);

      // Try to refresh enhanced data
      try {
        const [detailedModelsData, userKeysData] = await Promise.all([
          getDetailedAvailableModels(token),
          getUserApiKeys(token),
        ]);

        setDetailedModels(detailedModelsData);
        setUserApiKeys(userKeysData.keys || []);
      } catch {
        console.log('Enhanced endpoints not available, skipping enhanced refresh');
      }

      // Update preferences to disable the deleted key
      handleToggleUserKey(providerName, false);
    } catch (error) {
      showToast.error(
        `Failed to delete API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsDeletingKey(null);
    }
  };

  const getProviderInfo = (p: string) => {
    const info = {
      openai: {
        url: 'https://platform.openai.com/api-keys',
        instruction: 'Create an API key from your OpenAI dashboard.',
        description: 'Leading AI models including GPT-4, GPT-5, and o1 reasoning models',
        color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      },
      anthropic: {
        url: 'https://console.anthropic.com/',
        instruction: 'Generate an API key from Anthropic Console.',
        description: 'Claude 4, Claude Opus, and advanced reasoning capabilities',
        color: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      },
      gemini: {
        url: 'https://makersuite.google.com/app/apikey',
        instruction: 'Get your API key from Google AI Studio.',
        description: "Google's Gemini 2.5 Pro, Flash, and multimodal models",
        color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      },
      groq: {
        url: 'https://console.groq.com/keys',
        instruction: 'Create an API key from Groq Console.',
        description: 'Ultra-fast inference with Llama and Mixtral models',
        color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      },
    };
    return (
      info[p as keyof typeof info] || {
        url: '#',
        instruction: "Check the provider's documentation for API key instructions.",
        description: 'AI model provider',
        color: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
      }
    );
  };

  const getUserKeyForProvider = (providerName: string) => {
    return userApiKeys.find((key) => key.provider === providerName);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getModelStats = (providerName: string) => {
    const models = availableModels?.providers[providerName] || [];
    const detailedProviderModels = detailedModels?.detailed_models?.[providerName] || [];

    interface DetailedModel {
      name: string;
      is_reasoning_model?: boolean;
      supports_vision?: boolean;
      supports_function_calling?: boolean;
      max_tokens?: number;
      cost_per_1M_input?: number;
    }

    const reasoningModels = detailedProviderModels.filter(
      (m: DetailedModel) => m.is_reasoning_model,
    ).length;
    const visionModels = detailedProviderModels.filter(
      (m: DetailedModel) => m.supports_vision,
    ).length;
    const functionModels = detailedProviderModels.filter(
      (m: DetailedModel) => m.supports_function_calling,
    ).length;

    return {
      total: models.length,
      reasoning: reasoningModels,
      vision: visionModels,
      functions: functionModels,
    };
  };

  // --- Loading and Auth States ---
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading configurations...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 p-8">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h3 className="font-medium">Authentication Required</h3>
          <p className="text-sm text-muted-foreground">Please sign in to manage your API keys.</p>
        </div>
      </div>
    );
  }

  if (!availableModels) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 p-8">
          <XCircle className="h-10 w-10 mx-auto text-destructive" />
          <h3 className="font-medium">Failed to Load</h3>
          <p className="text-sm text-muted-foreground">
            There was an error fetching API key information.
          </p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  const allProviders = Object.entries(availableModels.providers).map(([key, models]) => ({
    value: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    description: `${models.length} models available`,
    hasUserKey: availableModels.user_has_keys?.includes(key) ?? false,
    // icon: getProviderInfo(key).icon,
  }));

  const providerInfo = getProviderInfo(provider);

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-primary/5 to-transparent -z-10" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-lg">API Key Management</h1>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800/60"
          >
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Secure & Encrypted
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl space-y-8">
        {/* Overview Stats */}

        {/* Add New Key Form */}
        <Card ref={addKeyCardRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add or Update API Key
            </CardTitle>
            <CardDescription>
              Select a provider and enter your API key to connect. Adding a key for an existing
              provider will overwrite it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="provider">AI Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select a provider..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-3">
                          {/* <span className="text-xl">{p.icon}</span> */}
                          <span className="font-medium">{p.label}</span>
                          {p.hasUserKey && <CheckCircle className="h-4 w-4 text-green-500" />}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keyName">Key Name (Optional)</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Personal Key"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apiKey">
                API Key for {allProviders.find((p) => p.value === provider)?.label}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showKey ? 'text' : 'password'}
                  placeholder="Paste your API key here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-9 w-9"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
              <a
                href={providerInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 pt-1"
              >
                <Globe className="h-3 w-3" />
                {providerInfo.instruction}
              </a>
            </div>

            {/* Verification Result */}
            {verificationResult && (
              <div
                className={cn(
                  'p-3 rounded-lg border text-sm',
                  verificationResult.isValid
                    ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
                    : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {verificationResult.isValid ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span className="font-medium">
                    {verificationResult.isValid ? 'Valid API Key' : 'Invalid API Key'}
                  </span>
                </div>
                <p>{verificationResult.message}</p>
                {verificationResult.availableModels &&
                  verificationResult.availableModels.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium mb-1">Available models:</p>
                      <div className="flex flex-wrap gap-1">
                        {verificationResult.availableModels.slice(0, 5).map((model) => (
                          <Badge key={model} variant="outline" className="text-xs">
                            {model}
                          </Badge>
                        ))}
                        {verificationResult.availableModels.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{verificationResult.availableModels.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}

            <Button
              onClick={handleVerifyAndSave}
              disabled={!apiKey.trim() || isVerifying || isSaving}
              className="w-full h-11 text-base"
            >
              {isVerifying || isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {isVerifying && !isSaving
                    ? 'Verifying...'
                    : isVerifying && isSaving
                      ? 'Verifying & Saving...'
                      : 'Saving...'}
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" /> Verify & Save
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Your Connected Providers List */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Provider Connections
            </h2>
            <p className="text-muted-foreground">
              Manage your connected keys below. Keys you provide have higher rate limits.
            </p>
          </div>
          {allProviders.map((p) => {
            const providerInfo = getProviderInfo(p.value);
            const userKey = getUserKeyForProvider(p.value);
            const modelStats = getModelStats(p.value);
            const isExpanded = expandedProvider === p.value;

            return (
              <Card
                key={p.value}
                className={cn(
                  'transition-all duration-200 overflow-hidden py-2',
                  p.hasUserKey
                    ? 'bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-900/20 dark:to-transparent border-green-200/50 dark:border-green-800/30'
                    : 'bg-gradient-to-r from-muted/30 to-transparent hover:from-muted/50',
                )}
              >
                {/* Main Provider Info */}
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{p.label}</h3>
                          {p.hasUserKey && (
                            <Badge className={cn('text-xs', providerInfo.color)}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {providerInfo.description}
                        </p>

                        {/* Model Statistics */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Badge variant="outline" className="text-xs">
                            {modelStats.total} models
                          </Badge>
                          {modelStats.reasoning > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Brain className="h-3 w-3 mr-1" />
                              {modelStats.reasoning} reasoning
                            </Badge>
                          )}
                          {modelStats.vision > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              {modelStats.vision} vision
                            </Badge>
                          )}
                          {modelStats.functions > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              {modelStats.functions} functions
                            </Badge>
                          )}
                        </div>

                        {/* User Key Information */}
                        {userKey && (
                          <div className="bg-background/60 rounded-lg p-3 mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm font-medium">
                                  {userKey.key_name || 'Personal API Key'}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Added {formatDate(userKey.created_at)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteKey(p.value)}
                                disabled={isDeletingKey === p.value}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {isDeletingKey === p.value ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-3 items-end">
                      {p.hasUserKey ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`switch-${p.value}`} className="text-sm font-medium">
                              Use My Key
                            </Label>
                            <Switch
                              id={`switch-${p.value}`}
                              checked={userKeyPreferences[p.value] ?? true}
                              onCheckedChange={(checked) => handleToggleUserKey(p.value, checked)}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedProvider(isExpanded ? null : p.value)}
                            className="flex items-center gap-2"
                          >
                            <Info className="h-4 w-4" />
                            Details
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="default"
                          onClick={() => handleSelectProviderToAdd(p.value)}
                          className="flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add Key
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && detailedModels?.detailed_models?.[p.value] && (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <h4 className="font-medium mb-3">Available Models</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                        {detailedModels.detailed_models[p.value].slice(0, 12).map((model: any) => (
                          <div
                            key={model.name}
                            className="bg-background/80 rounded-lg p-3 border border-border/20"
                          >
                            <p className="font-medium text-sm mb-1">{model.name}</p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {model.is_reasoning_model && (
                                <Badge variant="outline" className="text-xs">
                                  <Brain className="h-2 w-2 mr-1" />
                                  Reasoning
                                </Badge>
                              )}
                              {model.supports_vision && (
                                <Badge variant="outline" className="text-xs">
                                  <Eye className="h-2 w-2 mr-1" />
                                  Vision
                                </Badge>
                              )}
                              {model.supports_function_calling && (
                                <Badge variant="outline" className="text-xs">
                                  <Eye className="h-2 w-2 mr-1" />
                                  Functions
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>Max tokens: {model.max_tokens?.toLocaleString() || 'N/A'}</p>
                              {model.cost_per_1M_input > 0 && (
                                <p>Cost: ${model.cost_per_1M_input}/1M in</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {detailedModels.detailed_models[p.value].length > 12 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          +{detailedModels.detailed_models[p.value].length - 12} more models
                          available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Security Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Your Keys are Safe:</strong> API keys are stored using industry-standard
            encryption and are only used to make requests to providers on your behalf.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
