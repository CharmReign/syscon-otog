'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { HOME_HREF } from '@/components/layout/nav-config';

// The app opens on the login screen (app/landing.jsx is kept but not routed).
export default function Page() {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready) router.replace(user ? HOME_HREF : '/login');
  }, [ready, user, router]);

  return null;
}
