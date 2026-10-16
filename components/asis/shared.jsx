'use client';

// Small pieces shared by the AS-IS Navigator pages: character-limited fields, the
// Live Claude / Demo script switch, section labels and file downloads.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const TONE_TEXT = { green: 'text-success', amber: 'text-warning', red: 'text-destructive', cyan: 'text-primary', gray: 'text-muted-foreground' };

export const SectionLabel = ({ children, className }) => <div className={cn('text-[11px] uppercase tracking-wider font-semibold text-muted-foreground', className)}>{children}</div>;

const fmtN = (n) => n.toLocaleString('en-AU');

// "used / limit" under a field. `compact` shows it only while editing or near the limit.
function Counter({ value, limit, note, compact, focused }) {
  const n = String(value ?? '').length;
  const full = n >= limit;
  const near = n > limit * 0.9;
  if (compact && !focused && n <= limit * 0.8) return null;
  return (
    <div className="flex justify-between gap-2 text-[11px] mt-1" aria-live="polite">
      <span className={full ? 'text-destructive' : 'text-muted-foreground'}>{full ? 'Limit reached.' : note || ''}</span>
      <span className={cn('tabular-nums font-semibold ml-auto', full ? 'text-destructive' : near ? 'text-warning' : 'text-muted-foreground')}>{fmtN(n)} / {fmtN(limit)}</span>
    </div>
  );
}

// Stops typing past the limit and says when a paste was cut short.
function useLimit(limit, value, onPaste) {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    props: {
      maxLength: limit,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      onPaste: (e) => {
        onPaste?.(e);
        const pasted = e.clipboardData?.getData('text') || '';
        const el = e.target;
        const room = limit - (String(value ?? '').length - Math.max(0, (el.selectionEnd || 0) - (el.selectionStart || 0)));
        if (pasted.length > room) toast.warning(`Only the first ${fmtN(Math.max(0, room))} of ${fmtN(pasted.length)} pasted characters fit. The limit for this field is ${fmtN(limit)}.`);
      },
    },
  };
}

export function LimitedTextarea({ limit, note, compact, className, onBlur, onFocus, onPaste, ...props }) {
  const { focused, props: limitProps } = useLimit(limit, props.value, onPaste);
  return (
    <div className="min-w-0">
      <Textarea {...props} {...limitProps} className={className}
        onFocus={(e) => { limitProps.onFocus(); onFocus?.(e); }} onBlur={(e) => { limitProps.onBlur(); onBlur?.(e); }} />
      <Counter value={props.value} limit={limit} note={note} compact={compact} focused={focused} />
    </div>
  );
}

export function LimitedInput({ limit, note, compact = true, className, wrapClassName, onBlur, onFocus, onPaste, ...props }) {
  const { focused, props: limitProps } = useLimit(limit, props.value, onPaste);
  return (
    <div className={cn('min-w-0', wrapClassName)}>
      <Input {...props} {...limitProps} className={className}
        onFocus={(e) => { limitProps.onFocus(); onFocus?.(e); }} onBlur={(e) => { limitProps.onBlur(); onBlur?.(e); }} />
      <Counter value={props.value} limit={limit} note={note} compact={compact} focused={focused} />
    </div>
  );
}

// Live Claude or the demo script, remembered in this browser. Without an API key on
// the server only the demo script can run.
const MODE_KEY = 'asis_navigator_mode';
export function useAiMode(ai) {
  const [stored, setStored] = useState(null);
  useEffect(() => {
    try { setStored(localStorage.getItem(MODE_KEY)); } catch { /* storage unavailable */ }
  }, []);
  const demo = ai === false ? true : stored ? stored === 'demo' : !ai;
  const setDemo = (on) => {
    if (!on && ai === false) return toast.error('Live Claude needs a Claude API key (ANTHROPIC_API_KEY) on the server.');
    try { localStorage.setItem(MODE_KEY, on ? 'demo' : 'live'); } catch { /* storage unavailable */ }
    setStored(on ? 'demo' : 'live');
    toast.success(on ? 'Demo script: AI steps use scripted answers, no AI calls' : 'Live Claude: AI steps call Claude');
  };
  return [demo, setDemo];
}

export function ModeToggle({ demo, setDemo, ai }) {
  return (
    <div className="inline-flex rounded-md border overflow-hidden text-xs font-semibold" role="group" aria-label="AI mode">
      {[[false, 'Live Claude'], [true, 'Demo script']].map(([on, label]) => (
        <button key={label} type="button" aria-pressed={demo === on} onClick={() => demo !== on && setDemo(on)}
          title={on ? 'Scripted answers, no AI calls' : ai ? 'Calls Claude on the server' : 'Needs ANTHROPIC_API_KEY on the server'}
          className={cn('px-3 h-8', demo === on ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function DemoBanner() {
  return (
    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      Demo script mode: every AI step answers from a fictional sample (parole release date calculation), whatever you upload. Switch to Live Claude to analyse real documents.
    </p>
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const fileSafe = (s) => String(s || 'project').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'project';
