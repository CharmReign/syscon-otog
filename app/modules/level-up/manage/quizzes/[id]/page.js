'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Info, Loader2, Plus, RefreshCw, Rocket, Save, Trash2, Undo2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, Panel, Pill, StatusPill, useApi } from '@/components/otog/ui';
import { SettingsFields } from '@/components/levelup/generate-dialog';
import { api } from '@/lib/api-client';
import { QUESTION_TYPES, QUIZ_LIMITS } from '@/lib/levelup';
import { quizProblems } from '@/lib/quiz-validation';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const blankQuestion = (sectionId) => ({
  id: `new-${Math.random().toString(36).slice(2, 10)}`, type: QUESTION_TYPES.MULTIPLE_CHOICE,
  prompt: '', options: ['', '', '', ''], correctIndex: -1, explanation: '', sourceSectionId: sectionId || '', sourceQuote: '',
});

// Admin review: edit questions, answers, explanations and settings, then publish.
export default function QuizEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useApi(`levelup/quizzes/${id}?manage=1`);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);

  const quiz = data?.quiz;
  useEffect(() => { if (quiz) setDraft(toDraft(quiz)); }, [quiz]);

  const sectionIds = useMemo(() => quiz?.sections.map(s => s.id) || [], [quiz]);
  // Same rules the server applies on publish, so problems show while editing.
  const problems = useMemo(() => (draft ? quizProblems(cleanQuestions(draft.questions), sectionIds) : []), [draft, sectionIds]);
  const problemsByIndex = useMemo(() => Object.fromEntries(problems.map(p => [p.index, p.problems])), [problems]);
  const dirty = useMemo(() => quiz && draft && JSON.stringify(toDraft(quiz)) !== JSON.stringify(draft), [quiz, draft]);

  if (isLoading || (quiz && !draft)) return <Loading />;
  if (error?.status === 404) return <Panel><EmptyState title="Quiz not found" body="It may have been deleted." /></Panel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const locked = quiz.status === 'PUBLISHED';
  const refreshLists = () => ['levelup/quizzes', 'levelup/stats'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));

  const run = async (label, fn, success) => {
    setBusy(label);
    try {
      const res = await fn();
      if (res?.quiz) queryClient.setQueryData([`levelup/quizzes/${id}?manage=1`], { quiz: res.quiz });
      refreshLists();
      if (success) toast.success(success);
      return res;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', () => api(`levelup/quizzes/${id}`, {
    method: 'PATCH',
    body: { title: draft.title, description: draft.description, settings: draft.settings, questions: cleanQuestions(draft.questions) },
  }), 'Changes saved');

  const publish = async () => {
    if (dirty && !(await save())) return;
    await run('publish', () => api(`levelup/quizzes/${id}/publish`, { method: 'POST' }), 'Published. Employees can take it now.');
  };

  const setQ = (i, patch) => setDraft(d => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const sectionRef = (sid) => quiz.sections.find(s => s.id === sid)?.ref;

  return (
    <div className="space-y-5 max-w-4xl">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/level-up/manage"><ArrowLeft className="w-4 h-4" /> Manage quizzes</Link></Button>

      <Panel>
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={quiz.status} />
              <span className="text-xs text-muted-foreground">v{quiz.version} · {quiz.generator === 'ai' ? 'AI-generated' : 'Generated offline'} · from <Link href={`/modules/level-up/materials/${quiz.documentId}`} className="text-primary hover:underline">{quiz.documentTitle}</Link></span>
            </div>
            <div>
              <label htmlFor="q-title" className="text-sm font-medium">Title</label>
              <Input id="q-title" value={draft.title} disabled={locked} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={150} className="mt-1 text-base font-semibold" />
            </div>
            <div>
              <label htmlFor="q-desc" className="text-sm font-medium">Description</label>
              <Textarea id="q-desc" value={draft.description} disabled={locked} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} maxLength={1000} className="mt-1" />
            </div>
          </div>
          <div className="flex md:flex-col gap-2 flex-wrap md:w-44">
            {locked ? (
              <Button variant="outline" disabled={!!busy} onClick={() => run('unpublish', () => api(`levelup/quizzes/${id}/unpublish`, { method: 'POST' }), 'Unpublished')}>
                {busy === 'unpublish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Unpublish
              </Button>
            ) : (
              <>
                <Button onClick={publish} disabled={!!busy || problems.length > 0} title={problems.length ? 'Fix the problems first' : undefined}>
                  {busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Publish
                </Button>
                <Button variant="outline" onClick={save} disabled={!dirty || !!busy}>
                  {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
                </Button>
                <Button variant="outline" onClick={() => setRegenOpen(true)} disabled={!!busy}><RefreshCw className="w-4 h-4" /> Regenerate</Button>
              </>
            )}
            <Button variant="ghost" asChild><Link href={`/modules/level-up/quizzes/${id}`}><Eye className="w-4 h-4" /> Preview</Link></Button>
            <Confirm title="Delete this quiz?" description="Learners' past results are kept." destructive confirmLabel="Delete"
              onConfirm={() => run('delete', () => api(`levelup/quizzes/${id}`, { method: 'DELETE' }), 'Quiz deleted').then(r => r && router.push('/modules/level-up/manage'))}>
              <Button variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /> Delete</Button>
            </Confirm>
          </div>
        </div>

        {locked && <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm flex items-center gap-2"><Info className="w-4 h-4 text-primary" /> Published {fmtDateTime(quiz.publishedAt)} by {quiz.publishedByName}. Unpublish it to make changes.</p>}
        {quiz.notice && <p className="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{quiz.notice}</p>}
        {!locked && (problems.length ? (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {problems.length} question{problems.length > 1 ? 's need' : ' needs'} attention before publishing.</p>
        ) : (
          <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Every question has a correct answer, an explanation and a source. Check the wording, then publish.</p>
        ))}
      </Panel>

      <Panel title="Learner settings">
        <SettingsFields includeGeneration={false} settings={draft.settings} onChange={(settings) => !locked && setDraft({ ...draft, settings })} />
      </Panel>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">Questions ({draft.questions.length})</h2>
        {dirty && !locked && <Pill tone="amber">Unsaved changes</Pill>}
      </div>

      {draft.questions.map((q, i) => (
        <Panel key={q.id} className={cn(problemsByIndex[i] && 'border-destructive/50')}>
          <div className="flex items-start gap-3">
            <div className="text-lg font-bold text-muted-foreground tabular-nums w-8 shrink-0 pt-1">{i + 1}</div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex gap-2 flex-wrap items-center">
                <select value={q.type} disabled={locked} aria-label="Question type" className={cn(selectClass, 'w-48')}
                  onChange={(e) => setQ(i, e.target.value === QUESTION_TYPES.TRUE_FALSE
                    ? { type: e.target.value, options: ['True', 'False'], correctIndex: -1 }
                    : { type: e.target.value, options: ['', '', '', ''], correctIndex: -1 })}>
                  <option value={QUESTION_TYPES.MULTIPLE_CHOICE}>Multiple choice</option>
                  <option value={QUESTION_TYPES.TRUE_FALSE}>True / false</option>
                </select>
                <select value={q.sourceSectionId} disabled={locked} aria-label="Source section" className={cn(selectClass, 'flex-1 min-w-[12rem]')}
                  onChange={(e) => setQ(i, { sourceSectionId: e.target.value })}>
                  <option value="">Choose the source section…</option>
                  {quiz.sections.map(s => <option key={s.id} value={s.id}>{s.ref}</option>)}
                </select>
              </div>
              <Textarea value={q.prompt} disabled={locked} onChange={(e) => setQ(i, { prompt: e.target.value })} rows={2} aria-label={`Question ${i + 1} text`} placeholder="Question text" />

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground mb-1">Options. Select the correct answer.</legend>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === oi} disabled={locked} onChange={() => setQ(i, { correctIndex: oi })}
                      aria-label={`Mark option ${oi + 1} correct`} className="w-4 h-4 accent-[hsl(var(--primary))]" />
                    <Input value={opt} disabled={locked || q.type === QUESTION_TYPES.TRUE_FALSE} aria-label={`Option ${oi + 1}`}
                      onChange={(e) => setQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })}
                      className={cn(q.correctIndex === oi && 'border-success')} />
                    {q.type === QUESTION_TYPES.MULTIPLE_CHOICE && !locked && q.options.length > 2 && (
                      <Button size="icon" variant="ghost" aria-label={`Remove option ${oi + 1}`}
                        onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== oi), correctIndex: q.correctIndex === oi ? -1 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex })}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {q.type === QUESTION_TYPES.MULTIPLE_CHOICE && !locked && q.options.length < QUIZ_LIMITS.maxOptions && (
                  <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...q.options, ''] })}><Plus className="w-3.5 h-3.5" /> Add option</Button>
                )}
              </fieldset>

              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`exp-${q.id}`}>Explanation shown after submitting</label>
                <Textarea id={`exp-${q.id}`} value={q.explanation} disabled={locked} onChange={(e) => setQ(i, { explanation: e.target.value })} rows={2} className="mt-1" />
              </div>
              {q.sourceQuote && (
                <blockquote className="border-l-2 border-primary/60 pl-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">{sectionRef(q.sourceSectionId) || 'Source'}:</span> “{q.sourceQuote}”
                </blockquote>
              )}
              {problemsByIndex[i] && (
                <ul className="text-sm text-destructive space-y-0.5">{problemsByIndex[i].map(p => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{p}</li>)}</ul>
              )}
            </div>
            {!locked && (
              <Button size="icon" variant="ghost" aria-label={`Delete question ${i + 1}`} onClick={() => setDraft(d => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Panel>
      ))}

      {!locked && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDraft(d => ({ ...d, questions: [...d.questions, blankQuestion(quiz.sections[0]?.id)] }))}><Plus className="w-4 h-4" /> Add question</Button>
          <Button onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft</Button>
        </div>
      )}

      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} quiz={quiz} dirty={dirty}
        onRegenerate={(settings) => run('regen', () => api(`levelup/quizzes/${id}/regenerate`, { method: 'POST', body: { settings } }), 'New questions generated').then(() => setRegenOpen(false))}
        busy={busy === 'regen'} />
    </div>
  );
}

function RegenerateDialog({ open, onOpenChange, quiz, dirty, onRegenerate, busy }) {
  const [settings, setSettings] = useState(quiz.settings);
  useEffect(() => { if (open) setSettings(quiz.settings); }, [open, quiz.settings]);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Regenerate questions</DialogTitle>
          <DialogDescription>Replaces every question with a new set from “{quiz.documentTitle}”.{dirty ? ' Your unsaved edits will be lost.' : ''}</DialogDescription>
        </DialogHeader>
        <SettingsFields settings={settings} onChange={setSettings} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onRegenerate(settings)} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Regenerate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(q) {
  return {
    title: q.title, description: q.description || '',
    settings: { ...q.settings },
    questions: q.questions.map(({ sourceRef, ...x }) => ({ ...x, options: [...x.options] })),
  };
}

// New questions get a server id on save; trim whitespace the way the server will.
function cleanQuestions(questions) {
  return questions.map(q => ({
    ...q,
    id: q.id.startsWith('new-') ? undefined : q.id,
    prompt: q.prompt.trim(),
    options: q.options.map(o => o.trim()),
    explanation: q.explanation.trim(),
  }));
}
