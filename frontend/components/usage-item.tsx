'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code, Copy, ExternalLink } from 'lucide-react';
import type { Usage } from '../types/code-analysis';

interface UsageItemProps {
  usage: Usage;
  functionName: string;
  onJumpToLine: (line: number) => void;
  onCopyCode: (code: string) => void;
}

const usageTypeColors = {
  call: { bg: '#e8f5e8', color: '#388e3c', label: 'Function Call' },
  method: { bg: '#fff3e0', color: '#f57c00', label: 'Method Call' },
  import: { bg: '#e3f2fd', color: '#1976d2', label: 'Import' },
  export: { bg: '#f3e5f5', color: '#7b1fa2', label: 'Export' },
  property: { bg: '#fce4ec', color: '#c2185b', label: 'Property Access' },
  constructor: { bg: '#e0f2f1', color: '#00695c', label: 'Constructor' },
};

export function UsageItem({ usage, onJumpToLine, onCopyCode }: UsageItemProps) {
  const typeConfig = usageTypeColors[usage.type] || usageTypeColors.call;

  const handleCopyCode = () => {
    onCopyCode(usage.fullContext);
  };

  return (
    <div className="border border-border/40 rounded-lg p-3 sm:p-4 hover:border-border/60 transition-all hover:shadow-sm bg-card">
      {/* Usage Header */}
      <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
          <Code className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
              {usage.functionScope && (
                <span className="text-xs sm:text-sm font-medium text-foreground">
                  {usage.functionScope}()
                </span>
              )}
              <span className="text-xs text-muted-foreground">Line {usage.line}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{usage.usagePattern}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full"
            style={{
              backgroundColor: typeConfig.bg,
              color: typeConfig.color,
              borderColor: typeConfig.color + '40',
            }}
          >
            <span className="hidden sm:inline">{typeConfig.label}</span>
            <span className="sm:hidden">{typeConfig.label.split(' ')[0]}</span>
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 sm:h-6 sm:w-6 p-0"
            onClick={handleCopyCode}
            title="Copy code"
          >
            <Copy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 sm:h-6 sm:w-6 p-0"
            onClick={() => onJumpToLine(usage.line)}
            title="Jump to line"
          >
            <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </Button>
        </div>
      </div>

      {/* Code Context */}
      <div className="space-y-2">
        {/* Single line context */}
        <div className="bg-muted/20 rounded-md p-2 border border-border/20 overflow-x-auto">
          <code className="text-xs font-mono text-foreground/80 whitespace-nowrap">
            {usage.context}
          </code>
        </div>

        {/* Expandable full context */}
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform">▶</span>
            Show full context
          </summary>
          <div className="mt-2 bg-muted/10 rounded-md p-2 sm:p-3 border border-border/20">
            <pre className="text-xs font-mono text-foreground/70 whitespace-pre overflow-x-auto leading-relaxed">
              {usage.fullContext}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
