'use client';

// Quiz generation settings for one processed document. Creates a DRAFT for review.
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { selectClass } from '@/components/otog/confirm';
import { api } from '@/lib/api-client';
import { DEFAULT_QUIZ_SETTINGS, DIFFICULTIES, DIFFICULTY_LABELS, QUIZ_LIMITS, SHOW_ANSWERS } from '@/lib/levelup';
import { cn } from '@/lib/utils';

export function SettingsFields({ settings, onChange, includeGeneration = true }) {
  const set = (k) => (v) => onChange({ ...settings, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {includeGeneration && (
        <>
          <div>
            <label htmlFor="s-count" className="text-sm font-medium">Number of questions</label>
            <Input id="s-count" type="number" min={QUIZ_LIMITS.minQuestions} max={QUIZ_LIMITS.maxQuestions} value={settings.questionCount}
              onChange={(e) => set('questionCount')(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <label htmlFor="s-options" className="text-sm font-medium">Answer options</label>
            <select id="s-options" value={settings.optionCount} onChange={(e) => set('optionCount')(Number(e.target.value))} className={cn(selectClass, 'mt-1 w-full')}>
              {[3, 4, 5].map(n => <option key={n} value={n}>{n} options</option>)}
            </select>
          </div>
        </>
      )}
      <div>
        <label htmlFor="s-difficulty" className="text-sm font-medium">Difficulty</label>
        <select id="s-difficulty" value={settings.difficulty} onChange={(e) => set('difficulty')(e.target.value)} className={cn(selectClass, 'mt-1 w-full')}>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="s-pass" className="text-sm font-medium">Pass mark (%)</label>
        <Input id="s-pass" type="number" min={0} max={100} value={settings.passMark} onChange={(e) => set('passMark')(Number(e.target.value))} className="mt-1" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="s-show" className="text-sm font-medium">After submitting, learners see</label>
        <select id="s-show" value={settings.showAnswers} onChange={(e) => set('showAnswers')(e.target.value)} className={cn(selectClass, 'mt-1 w-full')}>
          <option value={SHOW_ANSWERS.AFTER_SUBMIT}>Their score, the correct answers and explanations</option>
          <option value={SHOW_ANSWERS.SCORE_ONLY}>Their score and which questions they missed (no answers)</option>
        </select>
      </div>
      {includeGeneration && (
        <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer">
          <span className="text-sm"><span className="font-medium">Include true/false questions</span><br /><span className="text-muted-foreground">About one in three questions becomes true/false.</span></span>
          <Switch checked={settings.includeTrueFalse} onCheckedChange={set('includeTrueFalse')} aria-label="Include true/false questions" />
        </label>
      )}
    </div>
  );
}

export function GenerateDialog({ document, generator, open, onOpenChange, onCreated }) {
  const [title, setTitle] = useState('');
  const [settings, setSettings] = useState(DEFAULT_QUIZ_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { quiz } = await api('levelup/quizzes', { method: 'POST', body: { documentId: document.id, title: title.trim() || undefined, settings } });
      onCreated(quiz);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Generate a quiz</DialogTitle>
          <DialogDescription>From “{document?.title}”. The quiz is saved as a draft for you to review before anyone sees it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="g-title" className="text-sm font-medium">Quiz title</label>
            <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${document?.title || ''} quiz`} maxLength={150} className="mt-1" />
          </div>
          <SettingsFields settings={settings} onChange={setSettings} />
          {generator && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Questions will be written by: <span className="font-medium text-foreground">{generator.label}</span>
              {generator.provider === 'offline' && ' (fill-in-the-blank and true/false built from the text)'}
            </p>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate draft</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
