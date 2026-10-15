'use client';

import { Lock } from 'lucide-react';

import { BadgeGrid } from '@/components/levelup/badges';
import { ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { ROLE_LABELS } from '@/lib/access';
import { fmtDate } from '@/lib/format';

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// Account details and Level Up progress for the signed-in user.
export function ProfilePage({ user }) {
  const stats = useApi('levelup/stats');
  const s = stats.data?.stats;
  return (
    <div className="max-w-3xl">
      <PageTitle title="My Profile" />
      <Panel title="Account info" className="mb-6">
        <div className="space-y-5">
          <Field label="Display name">{user.name}</Field>
          <Field label="Username">{user.username}</Field>
          {user.email && <Field label="Email"><span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-muted-foreground" />{user.email}</span></Field>}
          <div className="border-t pt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Role">{ROLE_LABELS[user.role]}</Field>
            <Field label="Member since">{fmtDate(user.createdAt)}</Field>
            <Field label="Quizzes passed">{s ? `${s.passedCount} of ${s.publishedCount}` : '—'}</Field>
            <Field label="Total score">{s ? s.points.toLocaleString() : '—'}</Field>
          </div>
        </div>
      </Panel>
      <Panel title="Badges">
        {stats.isLoading ? <Loading /> : stats.error ? <ErrorState error={stats.error} onRetry={stats.refetch} /> : <BadgeGrid badges={s.badges} />}
      </Panel>
    </div>
  );
}
