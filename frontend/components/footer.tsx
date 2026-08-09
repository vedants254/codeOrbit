'use client';

import { Github, Globe, Star } from 'lucide-react';
import { NumberTicker } from '@/components/ui/number-ticker';
import { useEffect, useState } from 'react';

const Footer = () => {
  const [stars, setStars] = useState(37);

  useEffect(() => {
    fetch('/api/github-stars')
      .then((res) => res.json())
      .then((data) => setStars(data.stars))
      .catch(() => setStars(37)); // Fallback to default
  }, []);

  return (
    <footer className="relative w-full bottom-0 z-10 border-t border-border/50 bg-background/80 backdrop-blur-sm mt-4">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Top section with Open Source emphasis */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/YOUR_USERNAME/GitVizz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub Repository"
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:underline transition-colors group"
            >
              <Github className="h-5 w-5 group-hover:scale-110 transition-transform" />
              <span>Proudly Open Source</span>
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 group-hover:text-yellow-500 transition-colors fill-yellow-500 text-yellow-500" />
                <NumberTicker value={stars} className="text-sm font-semibold" />
              </div>
            </a>
          </div>

          {/* Attribution */}
          <div className="text-xs text-muted-foreground text-center md:text-right">
            GitVizz - Understand Any Codebase in Minutes
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="text-center text-xs text-muted-foreground border-t border-border/30 pt-4">
          &copy; {new Date().getFullYear()} gitvizz - Understand Any Codebase in Minutes.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
