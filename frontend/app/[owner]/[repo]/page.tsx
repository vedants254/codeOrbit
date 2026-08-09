'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function GitHubStyleRoute() {
  const params = useParams();
  const router = useRouter();

  const owner = params.owner as string;
  const repo = params.repo as string;

  useEffect(() => {
    if (owner && repo) {
      // Simply redirect to home page with the GitHub URL as a query parameter
      const githubUrl = `https://github.com/${owner}/${repo}`;
      router.push(`/?repo=${encodeURIComponent(githubUrl)}`);
    }
  }, [owner, repo, router]);

  // Show minimal loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-muted-foreground">Redirecting to GitVizz...</p>
      </div>
    </div>
  );
}