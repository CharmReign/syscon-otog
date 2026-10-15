'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { HOME_HREF } from '@/components/layout/nav-config';
import { api } from '@/lib/api-client';

const AuthContext = createContext(null);

// The session lives in an httpOnly cookie set by the server; this provider only mirrors
// who is signed in (from /api/auth/me) so the UI can render. The server re-checks the
// session and role on every API call.
export function AuthProvider({ children }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const { user: u } = await api('auth/me');
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (username, password) => {
    const { user: u } = await api('auth/login', { method: 'POST', body: { username, password } });
    queryClient.clear();
    setUser(u);
    router.push(HOME_HREF);
    toast.success(`Welcome back, ${u.name.split(' ')[0]}`);
  };

  const logout = async () => {
    await api('auth/logout', { method: 'POST' }).catch(() => {});
    queryClient.clear();
    setUser(null);
    router.push('/login');
  };

  return <AuthContext.Provider value={{ user, ready, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
