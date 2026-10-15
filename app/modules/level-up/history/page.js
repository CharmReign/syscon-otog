'use client';

import Link from 'next/link';
import { History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, StatusPill, useApi } from '@/components/otog/ui';
import { fmtDateTime } from '@/lib/format';

// Your own attempts only; the server ignores other users' records here.
export default function HistoryPage() {
  const { data, error, isLoading, refetch } = useApi('levelup/attempts');

  return (
    <div>
      <PageTitle eyebrow="Level Up: Product & Support" title="My quiz history" subtitle="Every quiz you've submitted, newest first. Open one to review it." />
      <Panel>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.attempts.length === 0 ? (
          <EmptyState icon={History} title="No attempts yet" body="Take a quiz and your results will be saved here."
            action={<Button asChild size="sm"><Link href="/modules/level-up/quizzes">Browse quizzes</Link></Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Quiz</th>
                  <th className="py-2 pr-4 font-medium text-right">Correct</th>
                  <th className="py-2 pr-4 font-medium text-right">Score</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                  <th className="py-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.attempts.map(a => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4"><Link href={`/modules/level-up/history/${a.id}`} className="font-medium hover:text-primary">{a.quizTitle}</Link></td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{a.correct}/{a.total}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-primary">{a.score}%</td>
                    <td className="py-2.5 pr-4"><StatusPill status={a.passed ? 'PASSED' : 'FAILED'} label={a.passed ? 'Passed' : 'Not passed'} /></td>
                    <td className="py-2.5 text-muted-foreground whitespace-nowrap">{fmtDateTime(a.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
