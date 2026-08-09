'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { UsageItem } from './usage-item';
import type { ReferenceFile } from '../types/code-analysis';

interface ReferenceFileCardProps {
  referenceFile: ReferenceFile;
  functionName: string;
  onOpenFile: (filePath: string, line?: number) => void;
  onCopyCode: (code: string) => void;
}

export function ReferenceFileCard({
  referenceFile,
  functionName,
  onOpenFile,
  onCopyCode,
}: ReferenceFileCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleJumpToLine = (line: number) => {
    onOpenFile(referenceFile.file, line);
  };

  return (
    <div className="bg-card border border-border/40 rounded-lg overflow-hidden hover:border-border/60 transition-all">
      {/* File Header */}
      <div className="p-3 sm:p-4 border-b border-border/20 bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded hover:bg-muted/40 transition-colors flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
              )}
            </button>

            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate">
                {referenceFile.fileName}
              </h3>
              {/* <p className="text-xs text-muted-foreground font-mono truncate">{referenceFile.relativePath}</p> */}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full"
            >
              {referenceFile.totalUsages} usage{referenceFile.totalUsages !== 1 ? 's' : ''}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="text-xs px-2 py-1 h-6 sm:h-7 sm:px-3"
              onClick={() => onOpenFile(referenceFile.file)}
            >
              <span className="hidden sm:inline">Open File</span>
              <span className="sm:hidden">Open</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Usage List */}
      {isExpanded && (
        <div className="p-3 sm:p-4">
          <div className="space-y-2 sm:space-y-3">
            {referenceFile.usages.map((usage, index) => (
              <UsageItem
                key={`${usage.line}-${usage.column}-${index}`}
                usage={usage}
                functionName={functionName}
                onJumpToLine={handleJumpToLine}
                onCopyCode={onCopyCode}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
