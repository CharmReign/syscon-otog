'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, FileText, FolderCog, ListChecks, Trophy, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { BadgeGrid } from '@/components/levelup/badges';
import { LeaderboardTable } from '@/components/levelup/leaderboard-table';
import { QuizCard } from '@/components/levelup/quiz-card';
import { EmptyState, ErrorState, Loading, Panel, ProgressBar, Ring, StatCard, StatusPill, useApi } from '@/components/otog/ui';
import { isAdmin } from '@/lib/access';
import { categoryLabel } from '@/lib/levelup';
import { timeAgo } from '@/lib/format';

// Level Up: Product and Support dashboard, the default page after sign-in.
export default function LevelUpDashboard() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const stats = useApi('levelup/stats');
  const quizzes = useApi('levelup/quizzes');
  const docs = useApi('levelup/documents');

  if (stats.isLoading || quizzes.isLoading) return <Loading label="Loading your dashboard…" />;
  if (stats.error || quizzes.error) return <ErrorState error={stats.error || quizzes.error} onRetry={() => { stats.refetch(); quizzes.refetch(); }} />;

  const s = stats.data.stats;
  const all = quizzes.data.quizzes;
  const published = all.filter(q => q.status === 'PUBLISHED');
  // Recommend the first published quiz you haven't passed yet, untried ones first.
  const todo = published.filter(q => !s.bestByQuiz[q.id]?.passed).sort((a, b) => Number(!!s.bestByQuiz[a.id]) - Number(!!s.bestByQuiz[b.id]));
  const upNext = todo[0];
  const materials = (docs.data?.documents || []).filter(d => d.status === 'READY').slice(0, 5);
  const drafts = all.filter(q => q.status === 'DRAFT').length;
  const failedDocs = (docs.data?.documents || []).filter(d => d.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Level Up: Product &amp; Support</div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Welcome back, {user?.name}</h1>
        <p className="text-sm mt-1">Your product and support learning journey</p>
        <div className="mt-6 flex items-end justify-between gap-4">
          <span className="text-sm">Overall progress</span>
          <span className="text-2xl font-bold tabular-nums">{s.progress}%</span>
        </div>
        <ProgressBar value={s.progress} className="mt-2" label="Quizzes passed" />
        <div className="mt-5 flex flex-wrap gap-2">
          {upNext
            ? <Button asChild><Link href={`/modules/level-up/quizzes/${upNext.id}`}>{s.bestByQuiz[upNext.id] ? 'Retake' : 'Start'} “{upNext.title}” <ArrowRight className="w-4 h-4" /></Link></Button>
            : <Button asChild><Link href="/modules/level-up/quizzes">Browse quizzes <ArrowRight className="w-4 h-4" /></Link></Button>}
          <Button variant="outline" asChild><Link href="/modules/level-up/materials"><BookOpen className="w-4 h-4" /> Learning materials</Link></Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <Ring percent={s.progress} size={64} label={`${s.progress}% of quizzes passed`} />
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Overall</div>
            <div className="text-2xl font-bold text-primary tabular-nums">{s.passedCount} / {s.publishedCount}</div>
            <div className="text-sm text-muted-foreground">quizzes passed</div>
          </div>
        </div>
        <StatCard label="Score" value={s.points.toLocaleString()} sub="points earned" />
        <StatCard label="Your rank" value={s.rank ? `#${s.rank}` : '—'} sub={s.rank ? `of ${s.learners} learners` : 'Complete a quiz to get ranked'} />
      </div>

      {admin && (
        <Panel className="border-dashed">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold flex items-center gap-2"><FolderCog className="w-4 h-4 text-primary" /> Quiz management</div>
              <p className="text-sm text-muted-foreground mt-1">
                {drafts ? `${drafts} draft quiz${drafts > 1 ? 'zes' : ''} waiting for review. ` : 'No drafts waiting for review. '}
                {failedDocs ? `${failedDocs} document${failedDocs > 1 ? 's' : ''} failed processing.` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild><Link href="/modules/level-up/manage?upload=1"><Upload className="w-4 h-4" /> Upload document</Link></Button>
              <Button variant="outline" asChild><Link href="/modules/level-up/manage">Manage quizzes</Link></Button>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Quizzes</h2>
            {published.length > 0 && <Link href="/modules/level-up/quizzes" className="text-sm text-primary hover:underline">View all →</Link>}
          </div>
          {published.length === 0 ? (
            <Panel>
              <EmptyState icon={ListChecks} title="No quizzes published yet"
                body={admin ? 'Upload a product or support document, generate a quiz from it, review it, and publish it for the team.' : 'Quizzes appear here once an administrator publishes them.'}
                action={admin && <Button asChild size="sm"><Link href="/modules/level-up/manage?upload=1"><Upload className="w-4 h-4" /> Upload a document</Link></Button>} />
            </Panel>
          ) : (
            published.slice(0, 6).map((q, i) => <QuizCard key={q.id} quiz={q} index={i} best={s.bestByQuiz[q.id]} upNext={upNext?.id === q.id} />)
          )}
        </div>
        <Panel title="My badges" className="h-fit">
          <BadgeGrid badges={s.badges} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Learning materials" actions={<Link href="/modules/level-up/materials" className="text-sm text-primary hover:underline">All materials →</Link>}>
          {docs.isLoading ? <Loading /> : docs.error ? <ErrorState error={docs.error} /> : materials.length === 0 ? (
            <EmptyState icon={FileText} title="No materials yet" body="Processed documents will be listed here for everyone to read." />
          ) : (
            <ul className="divide-y">
              {materials.map(d => (
                <li key={d.id}>
                  <Link href={`/modules/level-up/materials/${d.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">{categoryLabel(d.category)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent activity" actions={<Link href="/modules/level-up/history" className="text-sm text-primary hover:underline">My history →</Link>}>
          {s.recent.length === 0 ? (
            <EmptyState icon={ListChecks} title="No attempts yet" body="Your quiz results will show up here." />
          ) : (
            <ul className="divide-y">
              {s.recent.map(a => (
                <li key={a.id}>
                  <Link href={`/modules/level-up/history/${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{a.quizTitle}</span>
                    <StatusPill status={a.passed ? 'PASSED' : 'FAILED'} label={`${a.score}%`} />
                    <span className="text-xs text-muted-foreground w-24 text-right">{timeAgo(a.submittedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Leaderboard snapshot" actions={<Link href="/modules/level-up/leaderboard" className="text-sm text-primary hover:underline">View full leaderboard →</Link>}>
        {s.leaderboard.length === 0 ? (
          <EmptyState icon={Trophy} title="No scores yet" body="Be the first on the board: pass a quiz to earn points." />
        ) : (
          <LeaderboardTable rows={s.leaderboard.slice(0, 5)} />
        )}
      </Panel>
    </div>
  );
}
