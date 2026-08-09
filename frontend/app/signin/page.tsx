'use client';

import type React from 'react';
import { useState } from 'react';
import { redirect } from 'next/navigation';
import { Github, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { signIn, useSession } from 'next-auth/react';

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn('github', { callbackUrl: '/' });
    } catch (error) {
      console.error('Sign-in failed:', error);
      setLoading(false);
    }
  };

  if (session) {
    return redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Visual Anchor - Top Gradient */}
      <div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Header */}
      <Header />

      {/* Main content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="min-h-[calc(100vh-30vh)] flex items-center justify-center py-12">
          <div className="w-full max-w-md">
            {/* Sign-in card */}
            <div className="bg-background/80 backdrop-blur-xl border border-border/40 rounded-2xl shadow-md overflow-hidden">
              {/* Section Header */}
              <div className="px-8 py-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                <h2 className="text-2xl font-semibold tracking-tight">Sign in to gitvizz</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your GitHub account to get started
                </p>
              </div>

              {/* Form Content */}
              <div className="p-8 space-y-8">
                <div className="bg-muted/30 backdrop-blur-sm rounded-xl p-4 border border-border/30">
                  <p className="text-sm font-medium text-center">
                    Browse your repositories faster — no need to copy-paste URLs or personal access
                    tokens.
                  </p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-6">
                  {/* GitHub sign-in button */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 text-base rounded-xl bg-primary hover:bg-primary/90 transition-colors"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <Github className="h-5 w-5 mr-2" />
                        Sign in with GitHub
                        <ArrowRight className="h-5 w-5 ml-2" />
                      </>
                    )}
                  </Button>

                  {/* Privacy notice */}
                  <div className="bg-muted/30 backdrop-blur-sm rounded-xl p-4 border border-border/30">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-full bg-blue-500/10 flex-shrink-0">
                        <Lock className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Privacy & Security</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          We never store your GitHub tokens. All data stays local and secure.
                        </p>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Additional info */}
                <p className="text-center text-xs text-muted-foreground pt-2">
                  By signing in, you agree to our{' '}
                  <a href="#" className="text-primary hover:underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-primary hover:underline">
                    Privacy Policy
                  </a>
                </p>
              </div>
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
