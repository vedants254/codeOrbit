'use client';

import { ToasterProvider } from '@/components/toaster';
import { ResultDataProvider } from '@/context/ResultDataContext';
import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ResultDataProvider>
        <ToasterProvider>{children}</ToasterProvider>
      </ResultDataProvider>
    </ThemeProvider>
  );
}
