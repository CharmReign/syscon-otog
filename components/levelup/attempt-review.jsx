'use client';

// Results and per-question review for a submitted attempt (adapted from steep's quiz
// Results). Correct answers and explanations only appear when the server includes them.
import { CheckCircle2, XCircle, EyeOff } from 'lucide-react';

import { Panel, Pill, Ring } from '@/components/otog/ui';
import { fmtDateTime } from '@/lib/format';

const headline = (pct) => (pct === 100 ? 'Perfect score' : pct >= 80 ? 'Great work' : pct >= 50 ? 'Getting there' : 'Worth another look');

export function AttemptSummary({ attempt, actions }) {
  return (
    <Panel>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <Ring percent={attempt.score} label={`${attempt.score}% correct`} />
        <div className="text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
            <h2 className="text-2xl font-bold">{headline(attempt.score)}</h2>
            <Pill tone={attempt.passed ? 'green' : 'amber'}>{attempt.passed ? 'Passed' : `Pass mark ${attempt.passMark}%`}</Pill>
            {attempt.preview && <Pill tone="gray">Preview · not recorded</Pill>}
          </div>
          <p className="mt-1 text-muted-foreground">
            You got {attempt.correct} of {attempt.total} right
            {!attempt.preview && <> and earned <span className="font-semibold text-primary">{attempt.points} points</span></>}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{attempt.quizTitle} · {fmtDateTime(attempt.submittedAt)}</p>
          {actions && <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">{actions}</div>}
        </div>
      </div>
    </Panel>
  );
}

export function AttemptReview({ attempt }) {
  return (
    <Panel title="Review">
      {!attempt.answersRevealed && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <EyeOff className="w-4 h-4" /> This quiz shows which questions you got right, but not the answers.
        </p>
      )}
      <ol className="space-y-5">
        {attempt.review.map((r, i) => (
          <li key={i} className="flex gap-3 text-sm">
            {r.correct ? <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="mt-0.5 w-5 h-5 shrink-0 text-destructive" aria-label="Incorrect" />}
            <div className="min-w-0">
              <p className="font-medium">{i + 1}. {r.prompt}</p>
              <p className="mt-1 text-muted-foreground">
                {r.chosen == null ? 'Not answered.' : <>Your answer: <span className="text-foreground">{r.options[r.chosen]}</span></>}
                {attempt.answersRevealed && !r.correct && <> · Correct answer: <span className="text-foreground font-medium">{r.options[r.correctIndex]}</span></>}
              </p>
              {attempt.answersRevealed && r.explanation && <p className="mt-1.5 text-muted-foreground">{r.explanation}</p>}
              {attempt.answersRevealed && r.sourceRef && <p className="mt-1 text-xs text-primary">Source: {r.sourceRef}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
