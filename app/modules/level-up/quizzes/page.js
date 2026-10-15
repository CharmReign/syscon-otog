'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Search, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/auth-provider';
import { QuizCard } from '@/components/levelup/quiz-card';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { isAdmin } from '@/lib/access';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/lib/levelup';
import { cn } from '@/lib/utils';

export default function QuizzesPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const quizzes = useApi('levelup/quizzes');
  const stats = useApi('levelup/stats');
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');

  // Employees only receive published quizzes; admins see drafts here too, labelled.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (quizzes.data?.quizzes || []).filter(x =>
      (!difficulty || x.difficulty === difficulty) &&
      (!q || `${x.title} ${x.description} ${x.documentTitle}`.toLowerCase().includes(q)));
  }, [quizzes.data, query, difficulty]);

  return (
    <div>
      <PageTitle eyebrow="Level Up: Product & Support" title="Quizzes" subtitle="Each quiz is generated from an uploaded product or support document and reviewed before it's published."
        actions={admin && <Button asChild variant="outline"><Link href="/modules/level-up/manage"><Upload className="w-4 h-4" /> Manage quizzes</Link></Button>} />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search quizzes" aria-label="Search quizzes" className="pl-9" />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filter by difficulty">
          {['', ...DIFFICULTIES].map(d => (
            <button key={d || 'all'} type="button" onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}
              className={cn('px-3 h-9 rounded-md border text-sm', difficulty === d ? 'border-primary bg-primary/10 text-primary font-semibold' : 'hover:border-primary/50')}>
              {d ? DIFFICULTY_LABELS[d] : 'All'}
            </button>
          ))}
        </div>
      </div>

      {quizzes.isLoading ? <Loading /> : quizzes.error ? <ErrorState error={quizzes.error} onRetry={quizzes.refetch} /> : list.length === 0 ? (
        <Panel>
          <EmptyState icon={ListChecks} title={quizzes.data.quizzes.length ? 'No quizzes match' : 'No quizzes yet'}
            body={quizzes.data.quizzes.length ? 'Try a different search or difficulty.' : admin ? 'Upload a document in Manage quizzes to generate the first one.' : 'Quizzes appear here once an administrator publishes them.'} />
        </Panel>
      ) : (
        <div className="space-y-3">
          {list.map((q, i) => <QuizCard key={q.id} quiz={q} index={i} best={stats.data?.stats.bestByQuiz[q.id]} showStatus={admin} />)}
        </div>
      )}
    </div>
  );
}
