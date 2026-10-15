'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileText } from 'lucide-react';

import { Pill, StatusPill } from '@/components/otog/ui';
import { DIFFICULTY_LABELS } from '@/lib/levelup';
import { cn } from '@/lib/utils';

// One quiz row, styled like the numbered "zone" cards in the reference dashboard.
export function QuizCard({ quiz, index, best, upNext, showStatus }) {
  const passed = best?.passed;
  return (
    <Link href={`/modules/level-up/quizzes/${quiz.id}`}
      className={cn('group block rounded-xl border bg-card p-5 transition-colors hover:border-primary/60', upNext && 'border-primary/60 ring-1 ring-primary/30')}>
      <div className="flex items-start gap-4">
        {index != null && <div className="text-2xl font-bold text-muted-foreground tabular-nums w-9 shrink-0">{String(index + 1).padStart(2, '0')}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base">{quiz.title}</h3>
            {upNext && <Pill tone="cyan">Up next</Pill>}
            {showStatus && quiz.status !== 'PUBLISHED' && <StatusPill status={quiz.status} />}
          </div>
          {quiz.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{quiz.description}</p>}
          <div className="flex items-center gap-2 flex-wrap mt-3 text-xs">
            <StatusPill status={quiz.difficulty} label={DIFFICULTY_LABELS[quiz.difficulty]} />
            <span className="text-muted-foreground">{quiz.questionCount} questions</span>
            <span className="text-muted-foreground inline-flex items-center gap-1 min-w-0"><FileText className="w-3 h-3 shrink-0" /><span className="truncate max-w-[16rem]">{quiz.documentTitle}</span></span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {best ? (
            <div className="flex flex-col items-end">
              <span className={cn('text-lg font-bold tabular-nums', passed ? 'text-success' : 'text-warning')}>{best.score}%</span>
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">{passed ? <><CheckCircle2 className="w-3 h-3 text-success" /> Passed</> : 'Best score'}</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">Start <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></span>
          )}
        </div>
      </div>
    </Link>
  );
}
