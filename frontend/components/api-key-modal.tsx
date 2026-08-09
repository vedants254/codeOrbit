'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Key, 
  ExternalLink, 
  Settings, 
  Zap, 
  AlertTriangle,
  CheckCircle 
} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userHasKeys?: string[];
  availableProviders?: string[];
}

export function ApiKeyModal({ 
  isOpen, 
  onClose, 
  userHasKeys = [], 
  availableProviders = [] 
}: ApiKeyModalProps) {
  const router = useRouter();

  const handleGoToApiKeys = () => {
    onClose();
    router.push('/api-keys');
  };

  const getProviderInfo = (provider: string) => {
    const info = {
      openai: { icon: '🤖', name: 'OpenAI' },
      anthropic: { icon: '🧠', name: 'Anthropic' },
      gemini: { icon: '💎', name: 'Google Gemini' },
      groq: { icon: '⚡️', name: 'Groq' },
      xai: { icon: '🚀', name: 'xAI' },
    };
    return info[provider as keyof typeof info] || { icon: '🔑', name: provider };
  };

  const hasAnyKeys = userHasKeys.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <DialogTitle className="text-xl">API Key Required</DialogTitle>
              <DialogDescription className="text-base mt-1">
                {hasAnyKeys 
                  ? 'Configure your API keys to continue chatting with the repository.'
                  : 'Add your API keys to start chatting with the repository.'
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Current Status */}
          <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Current Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {hasAnyKeys ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    You have API keys configured for:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {userHasKeys.map((provider) => {
                      const info = getProviderInfo(provider);
                      return (
                        <Badge 
                          key={provider} 
                          variant="secondary"
                          className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          <span className="mr-1">{info.icon}</span>
                          {info.name}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Manage your keys to enable/disable providers or add new ones.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No API keys configured. You&apos;ll be using system keys with rate limits.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableProviders.map((provider) => {
                      const info = getProviderInfo(provider);
                      return (
                        <Badge key={provider} variant="outline" className="text-xs">
                          <span className="mr-1">{info.icon}</span>
                          {info.name} (Rate Limited)
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Benefits Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Benefits of Adding Your Keys
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  Higher rate limits for unlimited chatting
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  Access to premium models and latest features
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  Faster response times
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  Full control over your AI provider preferences
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleGoToApiKeys}
              className="flex-1"
              size="lg"
            >
              <Key className="h-4 w-4 mr-2" />
              {hasAnyKeys ? 'Manage API Keys' : 'Add API Keys'}
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              size="lg"
            >
              Continue with System Keys
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Your API keys are encrypted and secure. We never store or log your keys in plain text.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}