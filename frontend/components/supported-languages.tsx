'use client';

import { Badge } from '@/components/ui/badge';
import { Code2, Clock, Info } from 'lucide-react';
import { useState } from 'react';

export interface Language {
  name: string;
  supported: boolean;
  icon?: string;
}

interface SupportedLanguagesProps {
  languages: Language[];
  className?: string;
}

export function SupportedLanguages({ languages = [], className = '' }: SupportedLanguagesProps) {
  const [isHovered, setIsHovered] = useState(false);
  const supportedLanguages = languages.filter((lang) => lang.supported);
  const comingSoonLanguages = languages.filter((lang) => !lang.supported);

  // Don't render if no languages provided
  if (!languages || languages.length === 0) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Hover Trigger */}
      <div
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-help"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Code2 className="h-3 w-3" />
        <span>Supported Graph Languages</span>
        <Info className="h-3 w-3" />
      </div>

      {/* Hover Tooltip */}
      {isHovered && (
        <div className="absolute top-full right-0 mt-2 z-[100] bg-background/95 backdrop-blur-xl border border-border/60 rounded-xl p-3 shadow-lg min-w-[280px] animate-in fade-in-50 slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground">Currently Supported</p>

            {/* Currently Supported */}
            <div className="flex flex-wrap gap-1.5">
              {supportedLanguages.map((language) => (
                <Badge
                  key={language.name}
                  variant="secondary"
                  className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20 text-xs px-2 py-0.5 rounded-md"
                >
                  {language.name}
                </Badge>
              ))}
            </div>

            {/* Coming Soon */}
            {comingSoonLanguages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Coming Soon</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {comingSoonLanguages.map((language) => (
                    <Badge
                      key={language.name}
                      variant="outline"
                      className="bg-muted/50 text-muted-foreground border-muted-foreground/30 text-xs px-2 py-0.5 rounded-md"
                    >
                      {language.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
