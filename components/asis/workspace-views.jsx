'use client';

// Views of an AS-IS project's knowledge base: Overview, Findings, Open items (decisions
// and questions), History, the source dialog, the discovery summary and the register export.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, ClipboardCopy, Download, ExternalLink, FileText, Info, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, Panel, Pill } from '@/components/otog/ui';
import { SOURCE_ICON } from '@/components/asis/sources-tab';
import { LimitedInput, LimitedTextarea, SectionLabel, TONE_TEXT, downloadBlob } from '@/components/asis/shared';
import {
  CHANGE_GROUPS, DECISION_STATUS, DECISION_TONE, FINDING_LABELS, FINDING_STATUS, FINDING_TONE, GAP_TONE, LIMITS,
  discoverySummary, projectStats, registerFileName,
} from '@/lib/asis';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const SOURCE_KIND_LABEL = { document: 'Uploaded document', image: 'Screenshot', pasted: 'Pasted content', note: 'Note', internal: 'Internal document', confluence: 'Confluence page', jira: 'Jira issue' };
const BORDER = { green: 'success', amber: 'warning', red: 'destructive', cyan: 'primary', gray: 'border' };
const statusLabel = (s) => s.charAt(0) + s.slice(1).toLowerCase();

// ---- overview ----

export function OverviewTab({ project: p, onTab }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const a = p.analysis;
  const s = projectStats(p);
  if (!a) return <Panel><EmptyState title="No baseline yet" body="Fill in the intake on the Sources tab and create the AS-IS baseline." action={<Button size="sm" onClick={() => onTab('sources')}>Start the intake</Button>} /></Panel>;

  const tiles = [
    ...FINDING_STATUS.map((st, i) => ({ label: FINDING_LABELS[st], n: s.counts[st], tone: FINDING_TONE[st], tab: 'findings', always: i < 2 })),
    { label: 'Gaps', n: s.gaps, tone: 'cyan', tab: 'findings' },
    { label: 'Open items', n: s.openItems, tone: 'cyan', tab: 'open', always: true },
  ].filter(t => t.n > 0 || t.always);
  const list = (items, empty) => (items?.length ? <ul className="list-disc pl-5 space-y-1">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-muted-foreground italic">{empty}</p>);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(t => (
          <button key={t.label} type="button" onClick={() => onTab(t.tab)} className="rounded-xl border bg-card py-3 text-center hover:border-primary/60">
            <div className={cn('text-2xl font-bold tabular-nums', TONE_TEXT[t.tone])}>{t.n}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t.label}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-right">Overview reflects KB {a.refreshedIn || 'v1.0'} · updated {fmtDateTime(p.updatedAt)} · {s.sources} source{s.sources === 1 ? '' : 's'}</p>
      {a.notice && <p className="rounded-lg bg-muted px-3 py-2 text-sm flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /> {a.notice}</p>}

      <Panel title="AS-IS process">
        <div className="text-sm space-y-3">
          <p>{a.summary}</p>
          {a.currentState.length > 0 && <ol className="list-decimal pl-5 space-y-1">{a.currentState.map((x, i) => <li key={i}>{x}</li>)}</ol>}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Stakeholders">
          {a.stakeholders.length
            ? <ul className="divide-y text-sm">{a.stakeholders.map((x, i) => <li key={i} className="py-1.5"><span className="font-semibold">{x.role}</span> — {x.involvement}</li>)}</ul>
            : <p className="text-sm text-muted-foreground italic">No stakeholders identified yet.</p>}
        </Panel>
        <Panel title="Business rules"><div className="text-sm">{list(a.businessRules, 'No business rules identified yet.')}</div></Panel>
        <Panel title="Compliance flags"><div className="text-sm">{list(a.complianceFlags, 'No compliance flags raised.')}</div></Panel>
      </div>

      <Panel className="border-primary/40 bg-primary/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">Super-Agent 2 · Design</div>
            <p className="text-sm text-muted-foreground">{p.design ? `TO-BE design built on KB ${p.design.basedOnKb}${p.design.basedOnKb !== `v${p.version}` ? ' · the knowledge base has changed since' : ''}` : 'Turn this AS-IS into a TO-BE process design.'}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setSummaryOpen(true)}><ClipboardCopy className="w-4 h-4" /> Copy summary</Button>
            <Button onClick={() => onTab('design')}>{p.design ? 'Open TO-BE design' : 'Start TO-BE design'} <ArrowRight className="w-4 h-4" /></Button>
          </div>
        </div>
      </Panel>
      {summaryOpen && <DiscoveryDialog project={p} onClose={() => setSummaryOpen(false)} />}
    </div>
  );
}

function DiscoveryDialog({ project, onClose }) {
  const [text] = useState(() => discoverySummary(project));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Discovery summary copied');
    } catch {
      toast.error("Couldn't copy automatically. Select the text and press Ctrl+C.");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Discovery summary</DialogTitle>
          <DialogDescription>The AS-IS knowledge base as plain text, for sharing or another tool.</DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={text} rows={16} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Discovery summary" />
        <p className="text-xs text-muted-foreground">{text.length.toLocaleString()} characters · {text.split('\n').length} lines</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), `${project.name.replace(/[^a-z0-9]+/gi, '_')}_Discovery_Summary_KBv${project.version}.txt`)}><Download className="w-4 h-4" /> Download .txt</Button>
          <Button onClick={copy}><ClipboardCopy className="w-4 h-4" /> Copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- sources ----

export function SourceDialog({ project, source, onClose }) {
  const name = source.name.toLowerCase();
  const linked = project.findings.filter(f => {
    const s = (f.source || '').toLowerCase();
    return s && (s.includes(name) || name.includes(s));
  });
  const Icon = SOURCE_ICON[source.kind] || FileText;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words pr-6 flex items-center gap-2"><Icon className="w-5 h-5 text-primary shrink-0" /> {source.name}</DialogTitle>
          <DialogDescription>{SOURCE_KIND_LABEL[source.kind] || 'Source'}{source.detail ? ` · ${source.detail}` : ''}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[['Added', fmtDateTime(source.addedAt)], ['By', source.addedByName], ['Knowledge base', source.version], ['Length', source.charCount ? `${source.charCount.toLocaleString()} characters` : '—']].map(([k, v]) => (
            <div key={k} className="rounded-md bg-muted/60 px-3 py-2"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        {source.url && (
          <a href={source.url} target={source.url.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            Open the original <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <div>
          <SectionLabel className="mb-1.5">Findings from this source ({linked.length})</SectionLabel>
          {linked.length === 0
            ? <p className="text-sm text-muted-foreground">No findings name this source directly. The analysis may have combined several sources.</p>
            : <ul className="space-y-1.5">{linked.map(f => <li key={f.id} className="flex gap-2 text-sm"><Pill tone={FINDING_TONE[f.status]}>{FINDING_LABELS[f.status]}</Pill><span>{f.text}</span></li>)}</ul>}
        </div>
        {source.excerpt && (
          <div>
            <SectionLabel className="mb-1.5">Excerpt</SectionLabel>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap rounded-md border p-3 max-h-48 overflow-y-auto">{source.excerpt}{source.charCount > source.excerpt.length ? '…' : ''}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- findings ----

export function FindingsTab({ project: p, mutate, base }) {
  const [draft, setDraft] = useState({ text: '', status: 'PENDING', source: '' });
  const [saving, setSaving] = useState(false);
  const s = projectStats(p);
  const a = p.analysis;

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (await mutate(`${base}/findings`, 'POST', draft, 'Finding added')) setDraft({ text: '', status: draft.status, source: '' });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {p.findings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FINDING_STATUS.filter(st => s.counts[st]).map(st => <Pill key={st} tone={FINDING_TONE[st]}>{FINDING_LABELS[st]}: {s.counts[st]}</Pill>)}
        </div>
      )}
      <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm flex gap-2">
        <Info className="w-4 h-4 text-success shrink-0 mt-0.5" />
        To resolve a Pending finding, set its status to Confirmed and add a resolution note. Changes save straight away.
      </p>

      {p.findings.length === 0 && <Panel><EmptyState title="No findings yet" body="Create the baseline, or record findings by hand below." /></Panel>}
      {FINDING_STATUS.map(st => {
        const items = p.findings.filter(f => f.status === st);
        if (!items.length) return null;
        return (
          <section key={st} aria-label={FINDING_LABELS[st]}>
            <SectionLabel className={cn('mb-2', TONE_TEXT[FINDING_TONE[st]])}>{FINDING_LABELS[st]} <span className="text-muted-foreground">({items.length})</span></SectionLabel>
            <div className="space-y-2">{items.map(f => <FindingRow key={f.id} finding={f} mutate={mutate} base={base} />)}</div>
          </section>
        );
      })}

      <Panel title="Record a finding">
        <form onSubmit={add} className="space-y-2">
          <LimitedTextarea limit={LIMITS.findingText} compact value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={2} placeholder="What did you find out about how it works today?" aria-label="Finding" />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={selectClass} aria-label="Status">
              {FINDING_STATUS.filter(st => st !== 'SUPERSEDED').map(st => <option key={st} value={st}>{FINDING_LABELS[st]}</option>)}
            </select>
            <LimitedInput wrapClassName="flex-1" limit={LIMITS.findingSource} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="Source (e.g. Workshop 28 Aug)" aria-label="Source" />
            <Button type="submit" disabled={!draft.text.trim() || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</Button>
          </div>
        </form>
      </Panel>

      {a?.gaps?.length > 0 && (
        <Panel title="Gap analysis">
          <ul className="space-y-2">{a.gaps.map((g, i) => <li key={i} className="flex gap-3 text-sm"><Pill tone={GAP_TONE[g.priority]}>{g.priority}</Pill><div><div>{g.gap}</div><div className="text-xs text-muted-foreground">{g.why}</div></div></li>)}</ul>
        </Panel>
      )}
      {a?.painPoints?.length > 0 && (
        <Panel title="Pain points">
          <ul className="space-y-2">{a.painPoints.map((x, i) => <li key={i} className="flex gap-3 text-sm"><AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" /><div><div>{x.point}</div><div className="text-xs text-muted-foreground">Impact: {x.impact}</div></div></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

function FindingRow({ finding: f, mutate, base }) {
  const [note, setNote] = useState(f.note || '');
  useEffect(() => { setNote(f.note || ''); }, [f.note]);
  const path = `${base}/findings/${f.id}`;
  const superseded = f.status === 'SUPERSEDED';
  return (
    <div className={cn('rounded-lg border bg-card p-3 border-l-4', superseded && 'opacity-70')} style={{ borderLeftColor: `hsl(var(--${BORDER[FINDING_TONE[f.status]]}))` }}>
      <p className={cn('text-sm', superseded && 'line-through')}>{f.text}</p>
      <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-muted-foreground">
        <select value={f.status} onChange={(e) => mutate(path, 'PATCH', { status: e.target.value }, `Marked ${FINDING_LABELS[e.target.value].toLowerCase()}`)}
          className={cn(selectClass, 'h-7 text-xs')} aria-label="Finding status">
          {FINDING_STATUS.map(st => <option key={st} value={st}>{FINDING_LABELS[st]}</option>)}
        </select>
        <span className="flex-1 min-w-0 truncate">Source: {f.source || '—'}{f.origin === 'manual' ? ' · added by hand' : ''}</span>
        {f.resolvedAt && f.status === 'CONFIRMED' && <span className="text-success">Confirmed {fmtDate(f.resolvedAt)}</span>}
        {f.supersededAt && superseded && <span>Superseded {fmtDate(f.supersededAt)}</span>}
        <Confirm title="Remove this finding?" destructive confirmLabel="Remove" onConfirm={() => mutate(path, 'DELETE', undefined, 'Finding removed')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove finding"><Trash2 className="w-3.5 h-3.5" /></Button>
        </Confirm>
      </div>
      {(f.status === 'CONFIRMED' || f.note) && (
        <LimitedInput limit={LIMITS.findingNote} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (f.note || '') && mutate(path, 'PATCH', { note }, 'Note saved')}
          placeholder="Resolution note (optional), e.g. Confirmed in workshop 28 Aug" aria-label="Resolution note" wrapClassName="mt-2" className="h-8 text-xs" />
      )}
    </div>
  );
}

// ---- open items: decisions and questions ----

export function OpenItemsTab({ project: p, mutate, base, onTab }) {
  const [filter, setFilter] = useState('ALL');
  const items = p.decisions;
  const pending = projectStats(p).counts.PENDING;
  const shown = items.filter(d => filter === 'ALL' || d.kind === filter);

  const add = async (kind) => {
    if (await mutate(`${base}/decisions`, 'POST', { kind }, kind === 'QUESTION' ? 'Question added at the bottom' : 'Decision added at the bottom')) {
      if (filter !== 'ALL' && filter !== kind) setFilter('ALL');
    }
  };
  const remove = async (d) => {
    const res = await mutate(`${base}/decisions/${d.id}`, 'DELETE');
    if (res) toast(`“${d.title.slice(0, 60)}” deleted`, { action: { label: 'Undo', onClick: () => mutate(`${base}/deleted-items/${d.id}`, 'POST', undefined, 'Restored') } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter open items">
          {[['ALL', 'All'], ['DECISION', 'Decisions'], ['QUESTION', 'Questions']].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={cn('px-3 h-8 rounded-full border text-xs font-semibold', filter === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
              {l} <span className="opacity-75 tabular-nums">{items.filter(d => k === 'ALL' || d.kind === k).length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={!items.length} onClick={() => downloadBlob(new Blob([registerHtml(p)], { type: 'text/html' }), registerFileName(p))}><Download className="w-4 h-4" /> Export register</Button>
          <Button onClick={() => add('DECISION')}><Plus className="w-4 h-4" /> Decision</Button>
          <Button onClick={() => add('QUESTION')}><Plus className="w-4 h-4" /> Question</Button>
        </div>
      </div>
      {pending > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning flex gap-2 flex-wrap items-center">
          {pending} finding{pending === 1 ? ' is' : 's are'} still pending. If one needs a decision, add it here.
          <button type="button" className="text-primary font-semibold hover:underline" onClick={() => onTab('findings')}>Review findings →</button>
        </p>
      )}
      <p className="text-sm text-muted-foreground">Pending and proposed items are never treated as confirmed requirements. Text fields save when you leave them.</p>
      {shown.length === 0
        ? <Panel><EmptyState title="No open items" body="Add a decision or question, or create the baseline." /></Panel>
        : shown.map(d => <ItemRow key={d.id} item={d} mutate={mutate} base={base} onRemove={() => remove(d)} />)}

      {p.deletedItems.length > 0 && (
        <details className="rounded-xl border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Recently deleted · {p.deletedItems.length}</summary>
          <ul className="mt-3 space-y-1.5">
            {p.deletedItems.map(x => (
              <li key={x.id} className="flex items-center gap-2 flex-wrap rounded-md border px-3 py-2 text-sm">
                <Pill tone="cyan">{x.kind === 'QUESTION' ? 'Question' : 'Decision'}</Pill>
                <span className="flex-1 min-w-0 truncate" title={x.title}>{x.title}</span>
                <span className="text-xs text-muted-foreground">deleted {fmtDateTime(x.deletedAt)}{x.deletedByName ? ` by ${x.deletedByName}` : ''}</span>
                <Button size="sm" variant="outline" onClick={() => mutate(`${base}/deleted-items/${x.id}`, 'POST', undefined, 'Restored')}><RotateCcw className="w-3.5 h-3.5" /> Restore</Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2 flex-wrap text-xs text-muted-foreground mt-2">
            <span>The last {LIMITS.deletedItems} deleted items are kept with the project.</span>
            <Confirm title="Empty the recently deleted list?" description="These items can't be restored afterwards." destructive confirmLabel="Empty list" onConfirm={() => mutate(`${base}/deleted-items`, 'DELETE', undefined, 'List emptied')}>
              <button type="button" className="text-destructive font-semibold hover:underline">Empty this list</button>
            </Confirm>
          </div>
        </details>
      )}
    </div>
  );
}

const ITEM_TEXT = ['title', 'description', 'position', 'outcome', 'owner'];

function ItemRow({ item: d, mutate, base, onRemove }) {
  const pick = () => Object.fromEntries(ITEM_TEXT.map(k => [k, d[k] || '']));
  const [form, setForm] = useState(pick);
  useEffect(() => { setForm(pick()); }, [d.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = `${base}/decisions/${d.id}`;
  const q = d.kind === 'QUESTION';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = (k) => () => { if (form[k] !== (d[k] || '') && (k !== 'title' || form.title.trim())) mutate(path, 'PATCH', { [k]: form[k] }); };
  const tone = DECISION_TONE[d.status];

  return (
    <Panel className={cn('p-4 space-y-3 border-l-4', d.status === 'SUPERSEDED' && 'opacity-70')} style={{ borderLeftColor: `hsl(var(--${BORDER[tone]}))` }}>
      <div className="flex items-start gap-2">
        <Pill tone="cyan" className="mt-2">{q ? 'Question' : 'Decision'}</Pill>
        <LimitedInput wrapClassName="flex-1" limit={LIMITS.itemTitle} value={form.title} onChange={set('title')} onBlur={save('title')} aria-label={q ? 'Question' : 'Decision title'}
          placeholder={q ? 'What do we need to find out?' : 'Decision or issue title'} className="font-semibold" />
        <Button variant="ghost" size="icon" aria-label="Delete this item" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <SectionLabel className="mb-1">{q ? 'Context' : 'Description'}</SectionLabel>
          <LimitedTextarea compact limit={LIMITS.itemText} value={form.description} onChange={set('description')} onBlur={save('description')} rows={2} aria-label={q ? 'Context' : 'Description'}
            placeholder={q ? 'Why does this matter? Who might know?' : 'Describe the decision or issue…'} />
        </div>
        <div>
          <SectionLabel className="mb-1">{q ? 'Current answer' : 'Current position'}{d.answeredIn && <span className="normal-case tracking-normal font-normal text-primary"> · answer found in {d.answeredIn}</span>}</SectionLabel>
          <LimitedTextarea compact limit={LIMITS.itemText} value={form.position} onChange={set('position')} onBlur={save('position')} rows={2} aria-label={q ? 'Current answer' : 'Current position'}
            placeholder={q ? 'What is known so far' : 'Where the discussion stands now'} />
        </div>
      </div>
      <div>
        <div className="flex justify-between gap-2 flex-wrap mb-1">
          <SectionLabel>Outcome / resolution{d.resolvedAt && d.status === 'CONFIRMED' && <span className="normal-case tracking-normal font-normal text-success"> · resolved {fmtDate(d.resolvedAt)}</span>}</SectionLabel>
          {form.outcome.trim() && d.status !== 'CONFIRMED' && d.status !== 'SUPERSEDED' && (
            <button type="button" className="text-xs font-semibold text-success hover:underline" onClick={() => mutate(path, 'PATCH', { outcome: form.outcome, status: 'CONFIRMED' }, 'Marked as confirmed')}>✓ Mark as confirmed</button>
          )}
        </div>
        <LimitedTextarea compact limit={LIMITS.itemText} value={form.outcome} onChange={set('outcome')} onBlur={save('outcome')} rows={2} aria-label="Outcome"
          placeholder={q ? 'The confirmed answer, once agreed' : 'The final decision, once agreed'} className={cn(d.status === 'CONFIRMED' && form.outcome.trim() && 'border-success/50')} />
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div>
          <SectionLabel className="mb-1">Type</SectionLabel>
          <select value={d.kind} onChange={(e) => mutate(path, 'PATCH', { kind: e.target.value })} className={cn(selectClass, 'w-full')} aria-label="Type">
            <option value="DECISION">Decision</option><option value="QUESTION">Question</option>
          </select>
        </div>
        <div>
          <SectionLabel className="mb-1">Status</SectionLabel>
          <select value={d.status} onChange={(e) => mutate(path, 'PATCH', { status: e.target.value })} className={cn(selectClass, 'w-full')} aria-label="Status">
            {DECISION_STATUS.map(st => <option key={st} value={st}>{st === 'CONFIRMED' && q ? 'Confirmed (answered)' : statusLabel(st)}</option>)}
          </select>
        </div>
        <div>
          <SectionLabel className="mb-1">Owner</SectionLabel>
          <LimitedInput limit={LIMITS.owner} value={form.owner} onChange={set('owner')} onBlur={save('owner')} placeholder="Who owns this?" aria-label="Owner" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Raised {fmtDate(d.raisedAt)}{d.raisedIn ? ` · ${d.raisedIn}` : ''} · last updated {fmtDateTime(d.updatedAt)} by {d.updatedByName}</p>
    </Panel>
  );
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Standalone, printable register of decisions and questions. Open it in a browser and print to PDF.
function registerHtml(p) {
  const color = { CONFIRMED: '#15803d', PENDING: '#b45309', OPEN: '#b45309', PROPOSED: '#0369a1', SUPERSEDED: '#475569' };
  const ordered = [...p.decisions.filter(d => d.kind !== 'QUESTION'), ...p.decisions.filter(d => d.kind === 'QUESTION')];
  const nQ = ordered.filter(d => d.kind === 'QUESTION').length;
  const counts = [`Decisions: ${ordered.length - nQ}`, `Questions: ${nQ}`, ...DECISION_STATUS.map(st => [st, ordered.filter(d => d.status === st).length]).filter(([, n]) => n).map(([st, n]) => `${st}: ${n}`)].join(' · ');
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const block = (label, value, cls = 'f') => (value ? `<div class="${cls}"><div class="l">${label}</div><div>${esc(value)}</div></div>` : '');
  const items = ordered.map((d, i) => {
    const q = d.kind === 'QUESTION';
    return `
    <div class="d" style="border-left-color:${color[d.status] || '#475569'}">
      <div class="h"><div class="t"><span class="k">${q ? 'QUESTION' : 'DECISION'}</span>${i + 1}. ${esc(d.title)}</div><span class="s" style="color:${color[d.status] || '#475569'}">${esc(d.status)}</span></div>
      ${block(q ? 'Context' : 'Description', d.description)}${block(q ? 'Current answer' : 'Current position', d.position)}${block('Outcome / resolution', d.outcome, 'f o')}
      <div class="m"><span><b>Owner:</b> ${esc(d.owner || '—')}</span><span><b>Raised:</b> ${esc(fmtDate(d.raisedAt))}</span>${d.resolvedAt && d.status === 'CONFIRMED' ? `<span><b>Resolved:</b> ${esc(fmtDate(d.resolvedAt))}</span>` : ''}</div>
    </div>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Decisions &amp; Open Items Register — ${esc(p.name)}</title>
<style>
*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0}.page{max-width:780px;margin:0 auto;padding:32px}
.bar{display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-size:13px}
.bar button{background:#1e3668;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer}
.head{border-bottom:3px solid #1e3668;padding-bottom:16px;margin-bottom:20px}.eyebrow{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b}
h1{margin:4px 0;font-size:24px}.sub{color:#1e3668;font-weight:600}.sum{background:#f1f5f9;border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:20px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.d{border:1px solid #cbd5e1;border-left:5px solid;border-radius:8px;padding:14px 18px;margin-bottom:14px;break-inside:avoid}.h{display:flex;justify-content:space-between;gap:12px}
.t{font-weight:700;font-size:15px}.k{font-size:9px;font-weight:800;letter-spacing:1px;padding:2px 7px;border-radius:4px;background:#eef4ff;color:#1e3668;margin-right:6px;vertical-align:2px}
.s{font-size:10px;font-weight:700}.f{margin-top:10px;font-size:12px;line-height:1.5}.o{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 10px}
.l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:2px}
.m{display:flex;gap:20px;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:12px;flex-wrap:wrap}.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:40px;font-size:10px;color:#64748b}
.sig div div{border-bottom:1.5px solid #0f172a;height:32px;margin:6px 0}.foot{margin-top:28px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
@media print{.bar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:15mm 18mm}}
</style></head><body><div class="page">
<div class="bar"><span>Open in a browser, then print and choose “Save as PDF”.</span><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="head"><div class="eyebrow">Harris Computer · Syscon Justice System</div><h1>Decisions &amp; Open Items Register</h1><div class="sub">${esc(p.name)}</div>
${p.module ? `<div style="font-size:13px;color:#64748b">Module: ${esc(p.module)}</div>` : ''}<div style="font-size:12px;color:#64748b;margin-top:6px">Prepared ${esc(today)} · Knowledge base v${esc(p.version)}</div></div>
<div class="sum"><b>Total items: ${ordered.length}</b><span>${esc(counts)}</span></div>
${items}
<div class="sig">${['Prepared by', 'Reviewed by', 'Approved by'].map(r => `<div><b>${r}</b><div></div>Name / date</div>`).join('')}</div>
<div class="foot"><span>OneTeamOneGoal · AS-IS Navigator</span><span>${esc(p.name)} · KB v${esc(p.version)}</span></div>
</div></body></html>`;
}

// ---- history: every version and what changed in it ----

export function HistoryTab({ project: p }) {
  const versions = [...p.versionHistory].reverse();
  const [sel, setSel] = useState(versions[0]?.version);
  const v = versions.find(x => x.version === sel) || versions[0];
  const ch = v?.changes || {};
  const groups = CHANGE_GROUPS.filter(g => ch[g.key]?.length);
  const added = p.sources.filter(s => s.version === `v${v?.version}`);
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
      <ol className="space-y-1.5">
        {versions.map((x, i) => (
          <li key={`${x.version}-${i}`}>
            <button type="button" aria-pressed={x === v} onClick={() => setSel(x.version)}
              className={cn('w-full text-left rounded-lg border px-3 py-2', x === v ? 'border-primary bg-primary/10' : 'bg-card hover:border-primary/50')}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="font-semibold text-primary">KB v{x.version}{i === 0 ? ' · latest' : ''}</span>
                <span className="text-muted-foreground">{fmtDate(x.at)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{x.note}</div>
            </button>
          </li>
        ))}
      </ol>
      {v && (
        <div className="space-y-4 min-w-0">
          <Panel className="p-4">
            <div className="font-semibold">KB v{v.version}</div>
            <p className="text-sm mt-1">{v.note}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(v.at)}{v.byName ? ` · ${v.byName}` : ''}{v.classification ? ` · new information classified ${FINDING_LABELS[v.classification]?.toLowerCase()}` : ''}</p>
            {v.context && <p className="text-sm text-muted-foreground italic mt-2">“{v.context}”</p>}
            {added.length > 0 && <p className="text-sm mt-2"><span className="font-semibold">Sources added:</span> {added.map(s => s.name).join(', ')}</p>}
            {v.notice && <p className="text-xs text-muted-foreground mt-2">{v.notice}</p>}
          </Panel>
          {groups.length === 0
            ? <Panel><EmptyState title="No change details for this version" /></Panel>
            : groups.map(g => (
              <section key={g.key}>
                <SectionLabel className={cn('mb-2', TONE_TEXT[g.tone])}>{g.label} ({ch[g.key].length})</SectionLabel>
                <ul className="space-y-1.5">{ch[g.key].map((item, i) => <li key={i} className="rounded-lg border bg-card px-3 py-2 text-sm">{item}</li>)}</ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
