'use client';

// Takes a quiz: answer, move back and forth, then submit for server-side scoring.
// Interaction design from steep's QuizView (numbered options, 1–N keys, progress bar).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, RotateCcw, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AttemptReview, AttemptSummary } from '@/components/levelup/attempt-review';
import { ErrorState, Panel, Pill, ProgressBar, StatusPill } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { DIFFICULTY_LABELS } from '@/lib/levelup';
import { cn } from '@/lib/utils';

export function QuizRunner({ quiz }) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const total = quiz.questions.length;
  const q = quiz.questions[index];
  const answeredCount = Object.keys(answers).length;
  const unanswered = total - answeredCount;

  const choose = useCallback((i) => {
    if (!q || i >= q.options.length) return;
    setAnswers(a => ({ ...a, [q.id]: i }));
  }, [q]);

  const next = useCallback(() => {
    if (index + 1 < total) setIndex(index + 1);
    else setReviewing(true);
  }, [index, total]);
  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (attempt || reviewing) return;
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) choose(n - 1);
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && answers[q?.id] !== undefined)) next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attempt, reviewing, choose, next, prev, answers, q]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { attempt: a } = await api(`levelup/quizzes/${quiz.id}/submit`, { method: 'POST', body: { answers } });
      setAttempt(a);
      queryClient.invalidateQueries({ queryKey: ['levelup/stats'] });
      queryClient.invalidateQueries({ queryKey: ['levelup/attempts'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setReviewing(false);
    setAttempt(null);
  };

  if (attempt) {
    return (
      <div className="space-y-6">
        <AttemptSummary attempt={attempt} actions={<>
          <Button onClick={restart}><RotateCcw className="w-4 h-4" /> Try again</Button>
          <Button variant="outline" asChild><Link href="/modules/level-up/quizzes">More quizzes</Link></Button>
          {!attempt.preview && <Button variant="ghost" asChild><Link href="/modules/level-up/history">My history</Link></Button>}
        </>} />
        <AttemptReview attempt={attempt} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quiz.preview && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span className="font-semibold">Preview.</span> This quiz isn't published, so employees can't see it and this attempt won't be recorded.
        </p>
      )}
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{quiz.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
              <StatusPill status={quiz.difficulty} label={DIFFICULTY_LABELS[quiz.difficulty]} />
              <span>{reviewing ? 'Ready to submit' : `Question ${index + 1} of ${total}`}</span>
              <span>· pass mark {quiz.passMark}%</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild><Link href="/modules/level-up/quizzes">Quit</Link></Button>
        </div>
        <ProgressBar value={(answeredCount / total) * 100} className="mt-4 h-1.5" label="Questions answered" />

        {/* Question navigator */}
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Jump to question">
          {quiz.questions.map((x, i) => (
            <button key={x.id} type="button" onClick={() => { setReviewing(false); setIndex(i); }}
              aria-label={`Question ${i + 1}${answers[x.id] !== undefined ? ', answered' : ''}`}
              aria-current={!reviewing && i === index ? 'step' : undefined}
              className={cn('w-7 h-7 rounded-md text-xs font-semibold border tabular-nums transition-colors',
                !reviewing && i === index ? 'border-primary text-primary' : '',
                answers[x.id] !== undefined ? 'bg-primary/15' : 'bg-muted/50 text-muted-foreground')}>
              {i + 1}
            </button>
          ))}
        </div>
      </Panel>

      {!reviewing ? (
        <Panel>
          <h2 className="text-lg md:text-xl font-semibold leading-snug">{q.prompt}</h2>
          <ul className="mt-5 space-y-2.5" role="radiogroup" aria-label="Answers">
            {q.options.map((opt, i) => {
              const chosen = answers[q.id] === i;
              return (
                <li key={i}>
                  <button type="button" role="radio" aria-checked={chosen} onClick={() => choose(i)}
                    className={cn('flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                      chosen ? 'border-primary bg-primary/10' : 'bg-muted/40 hover:border-primary/60')}>
                    <span className={cn('flex w-6 h-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', chosen && 'border-primary bg-primary text-primary-foreground')}>{i + 1}</span>
                    <span className="flex-1">{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={prev} disabled={index === 0}><ArrowLeft className="w-4 h-4" /> Previous</Button>
            <Button onClick={next}>{index + 1 < total ? 'Next' : 'Review answers'} <ArrowRight className="w-4 h-4" /></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Tip: press 1–{q.options.length} to answer, ← → to move between questions.</p>
        </Panel>
      ) : (
        <Panel title="Ready to submit?">
          <p className="text-sm">
            You've answered {answeredCount} of {total} questions.
            {unanswered > 0 && <span className="text-warning font-medium"> {unanswered} unanswered question{unanswered > 1 ? 's' : ''} will count as wrong.</span>}
          </p>
          <ol className="mt-4 space-y-1.5 text-sm">
            {quiz.questions.map((x, i) => (
              <li key={x.id} className="flex items-start gap-2">
                <span className="tabular-nums text-muted-foreground w-6">{i + 1}.</span>
                <button type="button" className="flex-1 text-left hover:text-primary truncate" onClick={() => { setReviewing(false); setIndex(i); }}>{x.prompt}</button>
                {answers[x.id] === undefined ? <Pill tone="amber">Unanswered</Pill> : <Pill tone="cyan">Answered</Pill>}
              </li>
            ))}
          </ol>
          {error && <ErrorState error={error} className="mt-4" />}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setReviewing(false); setIndex(total - 1); }}><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit answers
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
