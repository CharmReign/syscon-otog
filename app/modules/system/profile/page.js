'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { ProfilePage } from './profile';

export default function Page() {
  return <ProfilePage user={useAuth().user} />;
}
