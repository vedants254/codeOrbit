'use client';

import { useResultData } from '@/context/ResultDataContext';
import { useEffect, Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Github, Star, Code, Search, MessageSquare, FileText, Network, Eye, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { NumberTicker } from '@/components/ui/number-ticker';

// Custom Components
import { RepoTabs } from '@/components/repo-tabs';
import { showToast } from '@/components/toaster';
import Footer from '@/components/footer';
import Header from '@/components/header';

function HomeContent() {
  const { error, outputMessage, setError, setOutputMessage } = useResultData();
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefilledRepo = searchParams.get('repo');
  const [stars, setStars] = useState(37);

  useEffect(() => {
    fetch('/api/github-stars')
      .then((res) => res.json())
      .then((data) => setStars(data.stars))
      .catch(() => setStars(37)); // Fallback to default
  }, []);

  // Clean up URL after prefill is detected and processed
  useEffect(() => {
    if (prefilledRepo) {
      // Remove the query parameter from URL to prevent refresh issues
      router.replace('/', { scroll: false });
    }
  }, [prefilledRepo, router]);

  useEffect(() => {
    if (error) {
      showToast.error(error);
      setError(''); // Clear error after showing
    }
  }, [error, setError]);

  useEffect(() => {
    if (outputMessage) {
      showToast.success(outputMessage);
      setOutputMessage(''); // Clear message after showing
    }
  }, [outputMessage, setOutputMessage]);

  const features = [
    {
      title: 'Graph Search',
      description: 'Interactive dependency graphs with intelligent search capabilities',
      image: '/screenshots/graph_search.png',
      icon: Search,
    },
    {
      title: 'Graph Dependency View',
      description: 'Visual code navigation with smart highlighting and dependency connections',
      image: '/screenshots/graph_highlight.png',
      icon: Network,
    },
    {
      title: 'Chat with Repository',
      description: 'AI-powered conversations about your codebase with context-aware responses',
      image: '/screenshots/chat_with_repo_powered_by_graph.png',
      icon: MessageSquare,
      comingSoon: true,
      githubContribution: true,
    },
    {
      title: 'Code Viewer',
      description: 'Advanced code visualization with syntax highlighting and navigation',
      image: '/screenshots/code_viewer.png',
      icon: Eye,
    },
    {
      title: 'LLM Context Builder',
      description: 'Build comprehensive context for Large Language Models automatically',
      image: '/screenshots/build_context_for_llms.png',
      icon: Code,
    },
    {
      title: 'Documentation Generator',
      description: 'Automatically generate comprehensive documentation from your repository',
      image: '/screenshots/generate_documentation.png',
      icon: FileText,
      comingSoon: true,
      githubContribution: true,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between bg-background text-foreground antialiased relative">
      {/* Visual Anchor - Top Gradient */}
      <div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Header */}
      <Header />

      {/* Open Source Badge */}
      <div className="flex justify-center mb-4 relative z-10">
        <a
          href="https://github.com/YOUR_USERNAME/GitVizz"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Badge
            variant="outline"
            className="px-4 py-2 bg-background/80 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300 cursor-pointer"
          >
            <Github className="h-4 w-4 mr-2" />
            <span className="font-semibold">Proudly Open Source</span>
            <div className="flex items-center gap-1 ml-2">
              <Star className="h-4 w-4 group-hover:text-yellow-500 transition-colors fill-yellow-500 text-yellow-500" />
              <NumberTicker value={stars} className="text-sm font-semibold" />
            </div>
          </Badge>
        </a>
      </div>

      <main className="flex flex-col items-center w-full relative z-10 max-w-7xl mx-auto px-6 pb-4">
        {/* Subtle Hero Section */}
        <div className="text-center mb-4 lg:mb-8 max-w-3xl">
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight mb-3 lg:mb-4">
            <span className="text-primary">Understand Any Codebase</span> in Minutes, Not Hours
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground mb-4 lg:mb-6">
            AI-powered repository analysis that turns complex codebases into interactive
            documentation, dependency graphs, and intelligent conversations.
          </p>

          {/* Hub to Vizz Hint */}
          <div className="inline-flex items-center gap-2 px-3 lg:px-4 py-2 bg-muted/30 backdrop-blur-sm rounded-full border border-border/30 text-xs lg:text-sm text-muted-foreground hover:bg-primary/5 hover:border-primary/30 transition-all duration-300 cursor-default">
            <span className="font-mono">github.com/user/repo</span>
            <span className="text-primary">→</span>
            <span className="font-mono text-primary font-medium">gitvizz.com/user/repo</span>
          </div>
        </div>
        <RepoTabs prefilledRepo={prefilledRepo} />

        {/* Features Showcase */}
        <div className="w-full mb-8 lg:mb-12">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-2">
              Powerful Features
            </h2>
            <p className="text-sm lg:text-base text-muted-foreground">
              Explore repositories like never before with our comprehensive toolset
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <div
                  key={index}
                  className="group relative bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden hover:border-primary/20 transition-all duration-300 hover:shadow-lg"
                >
                  {/* Image Container */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <div className="relative h-48 sm:h-56 lg:h-64 overflow-hidden bg-muted/20 cursor-pointer">
                        <Image
                          src={feature.image}
                          alt={feature.title}
                          fill
                          className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                      </div>
                    </DialogTrigger>
                    <DialogContent className="!w-auto !max-w-[95vw] sm:!max-w-[95vw] md:!max-w-[95vw] lg:!max-w-[95vw] xl:!max-w-[95vw] !p-0 !border-0 bg-transparent shadow-none">
                      <DialogTitle className="sr-only">{feature.title} screenshot</DialogTitle>
                      <DialogDescription className="sr-only">
                        Expanded preview of {feature.title}
                      </DialogDescription>
                      <Image
                        src={feature.image}
                        alt={feature.title}
                        width={1600}
                        height={1000}
                        className="w-auto h-auto max-w-[90vw] max-h-[85vh] object-contain"
                      />
                    </DialogContent>
                  </Dialog>

                  {/* Content */}
                  <div className="p-4 lg:p-6">
                    <div className="flex items-center gap-2 mb-2 lg:mb-3">
                      <IconComponent className="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
                      <h3 className="text-lg lg:text-xl font-semibold">{feature.title}</h3>
                      {feature.comingSoon && (
                        <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm lg:text-base text-muted-foreground leading-relaxed mb-3">
                      {feature.description}
                    </p>
                    {feature.githubContribution && (
                      <div className="flex items-center gap-2">
                        <a
                          href="https://github.com/YOUR_USERNAME/GitVizz"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors group"
                        >
                          <Github className="h-3 w-3" />
                          <span>Contribute on GitHub</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contributing Section */}
        <div className="w-full mb-8 lg:mb-12">
          <div className="bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 p-6 lg:p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-2">
                Help Us Build the Future
              </h2>
              <p className="text-sm lg:text-base text-muted-foreground">
                GitVizz is open source and we&apos;re looking for contributors to help us improve
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Documentation', description: 'Help improve our docs and guides' },
                { title: 'Video Content', description: 'Create tutorials and demos' },
                { title: 'MCP Integration', description: 'Model Context Protocol features' },
                { title: 'Chat Features', description: 'AI-powered repository chat' },
              ].map((area, index) => (
                <div key={index} className="text-center p-4 rounded-lg border border-border/30 hover:border-primary/30 transition-colors">
                  <h3 className="font-semibold mb-2">{area.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{area.description}</p>
                  <a
                    href="https://github.com/YOUR_USERNAME/GitVizz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors group"
                  >
                    <Github className="h-3 w-3" />
                    <span>Contribute</span>
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Visual Anchor - Bottom Gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
