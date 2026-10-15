'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { SettingsPage } from './settings';

export default function Page() {
  return <SettingsPage user={useAuth().user} />;
}
