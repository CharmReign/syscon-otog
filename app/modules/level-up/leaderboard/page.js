'use client';

import { Trophy } from 'lucide-react';

import { LeaderboardTable } from '@/components/levelup/leaderboard-table';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';

export default function LeaderboardPage() {
  const { data, error, isLoading, refetch } = useApi('levelup/stats');
  return (
    <div>
      <PageTitle eyebrow="Level Up: Product & Support" title="Leaderboard"
        subtitle="Points are your best score on each published quiz (10 points per correct answer), added up. Only totals are shown, not individual answers." />
      <Panel>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.stats.leaderboard.length === 0 ? (
          <EmptyState icon={Trophy} title="No scores yet" body="The board fills up as people complete quizzes." />
        ) : <LeaderboardTable rows={data.stats.leaderboard} />}
      </Panel>
    </div>
  );
}
