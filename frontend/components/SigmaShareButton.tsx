'use client';

import React, { useRef } from 'react';
import { useSigma } from '@react-sigma/core';
import ShareGraphButton from './ShareGraphButtonNew';

interface SigmaShareButtonProps {
  nodeCount?: number;
  edgeCount?: number;
  repositoryName?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showTooltip?: boolean;
}

export default function SigmaShareButton({
  nodeCount,
  edgeCount,
  repositoryName,
  variant = 'ghost',
  size = 'sm',
  className = 'h-8 w-8 p-0',
  showTooltip = true,
}: SigmaShareButtonProps) {
  const sigma = useSigma();
  const containerRef = useRef<HTMLElement>(null);

  // Get the sigma container element
  React.useEffect(() => {
    if (sigma) {
      const sigmaContainer = sigma.getContainer();
      if (sigmaContainer) {
        containerRef.current = sigmaContainer.parentElement || sigmaContainer;
      }
    }
  }, [sigma]);

  return (
    <ShareGraphButton
      containerRef={containerRef}
      graphType="sigma"
      repositoryName={repositoryName}
      nodeCount={nodeCount}
      edgeCount={edgeCount}
      variant={variant}
      size={size}
      className={className}
      showTooltip={showTooltip}
      sigmaInstance={sigma}
    />
  );
}