'use client';

import React, { useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
// Dynamic import to avoid SSR issues with WebGL
let exportImageModule: any = null;
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Share2, Copy, Download, Loader2 } from 'lucide-react';

// Simple social media icons as SVG components
const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const LinkedInIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);


interface ShareGraphButtonProps {
  containerRef: React.RefObject<HTMLElement>;
  graphType: 'sigma' | 'reagraph';
  repositoryName?: string;
  nodeCount?: number;
  edgeCount?: number;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showTooltip?: boolean;
  sigmaInstance?: any; // Sigma instance for sigma graphs
}

interface SharePlatform {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  action: (data: ShareData) => void;
  color: string;
}

interface ShareData {
  text: string;
  url: string;
  imageBlob?: Blob;
}

export default function ShareGraphButton({
  containerRef,
  graphType,
  repositoryName,
  nodeCount,
  edgeCount,
  variant = 'outline',
  size = 'icon',
  className = '',
  showTooltip = true,
  sigmaInstance,
}: ShareGraphButtonProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Generate share text based on available data
  const generateShareText = useCallback(() => {
    const baseUrl = 'https://gitvizz.com';
    
    // Array of natural, varied text templates
    const templates = [
      {
        withRepo: (repo: string, stats: string) => 
          `Just mapped out the architecture of ${repo} 🗺️ ${stats}Amazing how connected everything is! Built with GitVizz`,
        withoutRepo: (stats: string) => 
          `Diving deep into code architecture today 🧭 ${stats}Love seeing how everything connects! #GitVizz`
      },
      {
        withRepo: (repo: string, stats: string) => 
          `Visualizing the dependencies in ${repo} 📊 ${stats}This is so satisfying to look at! Created with GitVizz`,
        withoutRepo: (stats: string) => 
          `Creating beautiful code dependency visualizations ✨ ${stats}There's something magical about seeing code structure! #GitVizz`
      },
      {
        withRepo: (repo: string, stats: string) => 
          `Exploring ${repo}'s codebase structure 🕸️ ${stats}GitVizz makes complex codebases so much easier to understand!`,
        withoutRepo: (stats: string) => 
          `Mapping code relationships like a detective 🔍 ${stats}GitVizz turns messy codebases into beautiful graphs!`
      },
      {
        withRepo: (repo: string, stats: string) => 
          `${repo} under the microscope 🔬 ${stats}Never gets old seeing how developers structure their code! #GitVizz`,
        withoutRepo: (stats: string) => 
          `Code architecture visualization session 🎨 ${stats}Every codebase tells a story! #GitVizz`
      }
    ];

    // Pick a random template
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    // Generate stats text
    let statsText = '';
    if (nodeCount && edgeCount) {
      statsText = `${nodeCount} components, ${edgeCount} connections. `;
    } else if (nodeCount) {
      statsText = `${nodeCount} components analyzed. `;
    }

    // Generate main text
    let text = '';
    if (repositoryName) {
      text = template.withRepo(repositoryName, statsText);
    } else {
      text = template.withoutRepo(statsText);
    }

    return { text, url: baseUrl };
  }, [repositoryName, nodeCount, edgeCount]);

  // Capture screenshot using sigma.js export or html2canvas fallback
  const captureScreenshot = useCallback(async (): Promise<Blob | null> => {
    try {
      setIsCapturing(true);

      // For Sigma.js graphs, use the official export function
      if (graphType === 'sigma' && sigmaInstance) {
        console.log('Using sigma.js official export functionality');
        
        try {
          // Load sigma export module dynamically
          if (!exportImageModule) {
            exportImageModule = await import('@sigma/export-image');
          }
          
          const blob = await exportImageModule.toBlob(sigmaInstance, {
            backgroundColor: '#ffffff',
            format: 'png',
            width: containerRef.current?.offsetWidth || 800,
            height: containerRef.current?.offsetHeight || 600,
          });
          
          console.log('Sigma export successful, blob size:', blob.size);
          return blob;
        } catch (error) {
          console.error('Sigma export failed:', error);
          // Fall through to html2canvas fallback
        }
      }

      // Fallback for Reagraph or if Sigma export fails
      if (!containerRef.current) {
        console.warn('Container ref not available for screenshot');
        return null;
      }

      console.log('Using html2canvas fallback for', graphType);
      
      // Wait for rendering
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      // For Reagraph, try to find canvas element
      let targetElement = containerRef.current;
      if (graphType === 'reagraph') {
        const canvas = containerRef.current.querySelector('canvas');
        if (canvas) {
          targetElement = canvas as HTMLElement;
        }
      }

      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (element) => {
          // Skip control buttons and overlays
          const classList = element.classList;
          return classList.contains('absolute') || 
                 element.tagName === 'BUTTON' ||
                 classList.contains('z-10') ||
                 classList.contains('z-50');
        },
      });

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          console.log('html2canvas capture, blob size:', blob?.size);
          resolve(blob);
        }, 'image/png', 0.9);
      });
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [containerRef, graphType, sigmaInstance]);

  // Copy to clipboard function
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  // Copy image to clipboard function
  const copyImageToClipboard = useCallback(async () => {
    const imageBlob = await captureScreenshot();
    if (!imageBlob) {
      console.warn('Failed to capture screenshot for clipboard');
      return;
    }

    if (navigator.clipboard && 'write' in navigator.clipboard) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageBlob,
          }),
        ]);
        console.log('Image copied to clipboard');
      } catch (error) {
        console.error('Failed to copy image to clipboard:', error);
      }
    } else {
      console.warn('Clipboard API not supported');
    }
    setIsDropdownOpen(false);
  }, [captureScreenshot]);

  // Download image function
  const downloadImage = useCallback(async (blob: Blob) => {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gitvizz-graph-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, []);

  // Define share platforms
  const platforms: SharePlatform[] = [
    {
      name: 'X (Twitter)',
      icon: TwitterIcon,
      color: 'text-blue-500',
      action: ({ text, url }) => {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, '_blank', 'width=600,height=400');
      },
    },
    {
      name: 'LinkedIn',
      icon: LinkedInIcon,
      color: 'text-blue-700',
      action: ({ url }) => {
        const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        window.open(linkedinUrl, '_blank', 'width=600,height=600');
      },
    },
  ];

  // Handle platform share
  const handleShare = useCallback(async (platform: SharePlatform) => {
    const shareData = generateShareText();
    const imageBlob = await captureScreenshot();
    
    // Copy image to clipboard if available
    if (imageBlob && navigator.clipboard && 'write' in navigator.clipboard) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageBlob,
          }),
        ]);
        console.log('Image copied to clipboard');
      } catch (error) {
        console.warn('Failed to copy image to clipboard:', error);
      }
    }
    
    platform.action({ ...shareData, imageBlob: imageBlob || undefined });
    setIsDropdownOpen(false);
  }, [generateShareText, captureScreenshot]);

  // Handle copy link
  const handleCopyLink = useCallback(async () => {
    const { url } = generateShareText();
    await copyToClipboard(url);
    setIsDropdownOpen(false);
  }, [generateShareText, copyToClipboard]);

  // Handle download screenshot
  const handleDownloadScreenshot = useCallback(async () => {
    const imageBlob = await captureScreenshot();
    if (imageBlob) {
      await downloadImage(imageBlob);
    } else {
      console.warn('Failed to capture screenshot for download');
    }
    setIsDropdownOpen(false);
  }, [captureScreenshot, downloadImage]);

  const shareButton = (
    <Button
      variant={variant}
      size={size}
      className={`${className} ${isCapturing ? 'opacity-50' : ''}`}
      disabled={isCapturing}
    >
      {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
    </Button>
  );

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        {showTooltip && size === 'icon' ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{shareButton}</TooltipTrigger>
              <TooltipContent>
                <p>Share Graph</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          shareButton
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
          Share on Social Media
        </div>

        {platforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <DropdownMenuItem
              key={platform.name}
              onClick={() => handleShare(platform)}
              className="cursor-pointer"
            >
              <Icon className={`h-4 w-4 mr-2 ${platform.color}`} />
              {platform.name}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={copyImageToClipboard} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2 text-green-600" />
          Copy Image
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2 text-gray-600" />
          Copy Link
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleDownloadScreenshot} className="cursor-pointer">
          <Download className="h-4 w-4 mr-2 text-gray-600" />
          Download Screenshot
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}