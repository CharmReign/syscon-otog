'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Menu, LogOut, ChevronDown, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { CreditFooter } from '@/components/common/credit-footer';
import { Sidebar } from '@/components/layout/sidebar';
import { hrefOf } from '@/components/layout/nav-config';
import { ROLE_LABELS } from '@/lib/access';
import { initials } from '@/lib/format';

export function AppShell({ user, onLogout, children }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Opens a page by its nav key, e.g. go('quizzes').
  const go = (key) => router.push(hrefOf(key));

  // The top search looks across internal documents, Confluence and Jira.
  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length >= 2) router.push(`/modules/as-is-navigator?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block flex-shrink-0"><Sidebar user={user} onLogout={onLogout} /></div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-80 border-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar mobile user={user} onLogout={onLogout} onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-background/90 backdrop-blur flex items-center px-4 md:px-8 gap-2 flex-shrink-0">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="w-5 h-5" /></Button>
          <form onSubmit={search} className="flex-1 max-w-md" role="search">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents, Confluence and Jira…" aria-label="Search knowledge" className="pl-9 h-9 bg-muted/60" />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-muted transition" aria-label="Account menu">
                  <Avatar className="w-8 h-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials(user?.name || '')}</AvatarFallback></Avatar>
                  <div className="hidden sm:block text-left leading-tight">
                    <div className="text-sm font-semibold">{user?.name}</div>
                    <div className="text-[11px] text-muted-foreground">{user?.email || ROLE_LABELS[user?.role]}</div>
                  </div>
                  <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="font-medium">{user?.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">{ROLE_LABELS[user?.role]}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go('profile')}><User className="w-4 h-4 mr-2" /> My Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout}><LogOut className="w-4 h-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-4 md:px-8 py-6 max-w-[1400px] mx-auto">
            {children}
          </div>
          <CreditFooter className="pb-4" />
        </main>
      </div>
    </div>
  );
}
