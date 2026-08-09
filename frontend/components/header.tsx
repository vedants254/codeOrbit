'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Github, LogOut, ChevronDown } from 'lucide-react';
import Logo from '@/public/logo.svg';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ThemeToggle from '@/components/theme-toggle';
import { signOut, useSession } from 'next-auth/react';

const Header = () => {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <header className="relative z-20 py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between">
          {/* Logo and Brand - Left aligned */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2 bg-primary/10 rounded-xl backdrop-blur-sm transition-all duration-300 group-hover:bg-primary/15">
              <Image
                src={Logo || '/placeholder.svg'}
                alt="gitvizz"
                width={36}
                height={36}
                className="h-9 w-9"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">gitvizz</h1>
              <p className="text-xs text-muted-foreground">Understand Any Codebase in Minutes</p>
            </div>
          </Link>

          {/* Auth Section - Right aligned */}
          <div className="flex items-center gap-4">
            <ThemeToggle className="mr-2 bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-border/30" />
            {session && session.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                    <div className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 border border-border">
                          <AvatarImage
                            src={session.user.image || '/placeholder.svg'}
                            alt={session.user.name ?? 'User'}
                          />
                          <AvatarFallback>{session.user.name?.charAt(0) || 'U'}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium hidden sm:inline">
                          {session.user.name}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-medium">{session.user.name}</p>
                      <p className="text-xs text-muted-foreground">{session.user.email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <Link href="/api-keys" className="cursor-pointer">
                      API Keys
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      signOut({
                        callbackUrl: '/',
                      })
                    }
                    className="text-red-500 focus:text-red-500 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => router.push('/signin')}
                className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 transition-all duration-200"
              >
                <Github className="h-4 w-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
