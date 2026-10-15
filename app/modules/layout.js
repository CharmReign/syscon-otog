'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { AppShell } from '@/components/layout/app-shell';
import { HOME_HREF, canOpen } from '@/components/layout/nav-config';

// Shell (sidebar + topbar) for every signed-in page. This guard is for navigation only;
// the API enforces authentication and roles on every request.
export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const allowed = canOpen(user, pathname);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (!allowed) router.replace(HOME_HREF);
  }, [ready, user, allowed, router]);

  if (!ready || !allowed) return null;
  return <AppShell user={user} onLogout={logout}>{children}</AppShell>;
}
