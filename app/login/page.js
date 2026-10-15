'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { HOME_HREF } from '@/components/layout/nav-config';
import { LoginScreen } from './login';

export default function Page() {
  const router = useRouter();
  const { user, ready, login } = useAuth();

  // Signed-in users skip the login screen.
  useEffect(() => {
    if (ready && user) router.replace(HOME_HREF);
  }, [ready, user, router]);

  if (!ready || user) return null;
  return <LoginScreen onLogin={login} />;
}
