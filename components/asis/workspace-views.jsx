'use client';

// Views of an AS-IS project's knowledge base: sidebar (status, history, sources),
// dashboard, findings, decisions register and "What changed?".
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, BookOpen, ClipboardCopy, Download, ExternalLink, FileText, Info, Loader2, MessageSquareText,
  Plus, Ticket, Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, Panel, Pill } from '@/components/otog/ui';
import {
  CHANGE_GROUPS, DECISION_STATUS, DECISION_TONE, FINDING_LABELS, FINDING_STATUS, FINDING_TONE, GAP_TONE,
  discoverySummary, projectStats,
} from '@/lib/asis';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const SOURCE_ICON = { document: FileText, note: MessageSquareText, internal: FileText, confluence: BookOpen, jira: Ticket };
const SOURCE_KIND_LABEL = { document: 'Uploaded document', note: 'Note', internal: 'Internal document', confluence: 'Confluence page', jira: 'Jira issue' };
const TONE_TEXT = { green: 'text-success', amber: 'text-warning', red: 'text-destructive', cyan: 'text-primary', gray: 'text-muted-foreground' };

const SectionLabel = ({ children, className }) => <div className={cn('text-[11px] uppercase tracking-wider font-semibold text-muted-foreground', className)}>{children}</div>;

// ---- sidebar ----

export function ProjectSidebar({ project: p, onAddKnowledge }) {
  const [source, setSource] = useState(null);
  const s = projectStats(p);
  const tiles = [
    ['Sources', s.sources, 'cyan'], ['Confirmed', s.counts.CONFIRMED, 'green'], ['Pending', s.counts.PENDING, 'amber'],
    ['Conflicting', s.counts.CONFLICTING, 'red'], ['Gaps', s.gaps, 'cyan'], ['Questions', s.questions, 'gray'],
  ];
  return (
    <aside className="space-y-4 order-last lg:order-none lg:sticky lg:top-20">
      <Panel className="p-4">
        <SectionLabel className="mb-2">Knowledge base status</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {tiles.map(([label, n, tone]) => (
            <div key={label} className="rounded-lg bg-muted/60 py-2 text-center">
              <div className={cn('text-lg font-bold tabular-nums', TONE_TEXT[tone])}>{n}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
            </div>
          ))}
        </div>
        <Button className="w-full mt-3" size="sm" onClick={onAddKnowledge}><Plus className="w-4 h-4" /> Add knowledge</Button>
      </Panel>

      <Panel className="p-4">
        <SectionLabel className="mb-2">Version history</SectionLabel>
        <ol className="space-y-2.5 max-h-64 overflow-y-auto">
          {[...p.versionHistory].reverse().map((v, i) => (
            <li key={`${v.version}-${i}`} className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-primary text-xs">KB v{v.version}</div>
                <div className="text-xs">{v.note}</div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(v.at)} · {v.byName}</div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className="p-4">
        <SectionLabel className="mb-2">Knowledge sources</SectionLabel>
        {p.sources.length === 0 ? <p className="text-sm text-muted-foreground">No sources yet.</p> : (
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {[...p.sources].reverse().map(src => {
              const Icon = SOURCE_ICON[src.kind] || FileText;
              return (
                <li key={src.id}>
                  <button type="button" onClick={() => setSource(src)} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{src.name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">v{src.version}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {source && <SourceDialog project={p} source={source} onClose={() => setSource(null)} />}
    </aside>
  );
}

function SourceDialog({ project, source, onClose }) {
  const name = source.name.toLowerCase();
  const linked = project.findings.filter(f => {
    const s = (f.source || '').toLowerCase();
    return s && (s.includes(name) || name.includes(s));
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{source.name}</DialogTitle>
          <DialogDescription>{SOURCE_KIND_LABEL[source.kind] || 'Source'}{source.detail ? ` · ${source.detail}` : ''}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[['Added', fmtDateTime(source.addedAt)], ['By', source.addedByName], ['Knowledge base', `v${source.version}`], ['Length', `${(source.charCount || 0).toLocaleString()} characters`]].map(([k, v]) => (
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

// ---- dashboard ----

export function DashboardTab({ project: p, onGoToIntake }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const a = p.analysis;
  const s = projectStats(p);
  if (!a) return <Panel><EmptyState title="No analysis yet" body="Fill in the intake, add any documents or references, and run the initial analysis to populate the dashboard." action={<Button size="sm" onClick={onGoToIntake}>Go to intake</Button>} /></Panel>;

  const tiles = [...FINDING_STATUS.map(st => [FINDING_LABELS[st], s.counts[st], FINDING_TONE[st]]), ['Gaps', s.gaps, 'cyan']].filter(([, n]) => n > 0);
  const list = (items) => (items?.length ? <ul className="list-disc pl-5 space-y-1">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-muted-foreground italic">None recorded.</p>);

  return (
    <div className="space-y-4">
      {tiles.length > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {tiles.map(([label, n, tone]) => (
            <div key={label} className="rounded-xl border bg-card py-3 text-center">
              <div className={cn('text-2xl font-bold tabular-nums', TONE_TEXT[tone])}>{n}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">Analysed {fmtDateTime(a.analysedAt)} · KB v{p.version} · {s.sources} source{s.sources === 1 ? '' : 's'}{a.templateName ? ` · Template: ${a.templateName}` : ''}</p>
      {a.notice && <p className="rounded-lg bg-muted px-3 py-2 text-sm flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /> {a.notice}</p>}

      <Panel title="AS-IS process">
        <div className="text-sm space-y-3">
          <p>{a.summary}</p>
          {a.currentState.length > 0 && <ol className="list-decimal pl-5 space-y-1">{a.currentState.map((x, i) => <li key={i}>{x}</li>)}</ol>}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Stakeholders">
          {a.stakeholders.length ? (
            <ul className="divide-y text-sm">{a.stakeholders.map((x, i) => <li key={i} className="py-1.5"><span className="font-semibold">{x.role}</span> — {x.involvement}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground italic">None recorded.</p>}
        </Panel>
        <Panel title="Business rules"><div className="text-sm">{list(a.businessRules)}</div></Panel>
        <Panel title="Compliance flags"><div className="text-sm">{list(a.complianceFlags)}</div></Panel>
        <Panel title="Outstanding questions"><div className="text-sm">{list(a.questions)}</div></Panel>
      </div>

      <Panel className="border-primary/40 bg-primary/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">Ready for future-state design</div>
            <p className="text-sm text-muted-foreground">Copy the Discovery Summary and hand it to the design stage (Super-Agent 2).</p>
          </div>
          <Button onClick={() => setSummaryOpen(true)}><ClipboardCopy className="w-4 h-4" /> Discovery summary</Button>
        </div>
      </Panel>
      {summaryOpen && <DiscoveryDialog project={p} onClose={() => setSummaryOpen(false)} />}
    </div>
  );
}

const fileSafe = (s) => String(s || 'project').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'project';

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DiscoveryDialog({ project, onClose }) {
  const [text] = useState(() => discoverySummary(project));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Discovery summary copied');
    } catch {
      toast.error("Couldn't copy automatically. Select the text and copy it.");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Discovery summary</DialogTitle>
          <DialogDescription>Paste this as the first message to the design stage (Super-Agent 2).</DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={text} rows={16} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Discovery summary" />
        <p className="text-xs text-muted-foreground">{text.length.toLocaleString()} characters · {text.split('\n').length} lines</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => download(`${fileSafe(project.name)}_Discovery_Summary.txt`, text, 'text/plain')}><Download className="w-4 h-4" /> Download .txt</Button>
          <Button onClick={copy}><ClipboardCopy className="w-4 h-4" /> Copy</Button>
        </DialogFooter>
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

      {p.findings.length === 0 && <Panel><EmptyState title="No findings yet" body="Run the analysis, or record findings by hand below." /></Panel>}
      {FINDING_STATUS.map(st => {
        const items = p.findings.filter(f => f.status === st);
        if (!items.length) return null;
        return (
          <section key={st} aria-label={FINDING_LABELS[st]}>
            <SectionLabel className={cn('mb-2 flex items-center gap-2', TONE_TEXT[FINDING_TONE[st]])}>{FINDING_LABELS[st]} <span className="text-muted-foreground">({items.length})</span></SectionLabel>
            <div className="space-y-2">{items.map(f => <FindingRow key={f.id} finding={f} mutate={mutate} base={base} />)}</div>
          </section>
        );
      })}

      <Panel title="Record a finding">
        <form onSubmit={add} className="space-y-2">
          <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={2} maxLength={2000} placeholder="What did you find out about how it works today?" aria-label="Finding" />
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={selectClass} aria-label="Status">
              {FINDING_STATUS.filter(st => st !== 'SUPERSEDED').map(st => <option key={st} value={st}>{FINDING_LABELS[st]}</option>)}
            </select>
            <Input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="Source (e.g. Workshop 28 Aug)" aria-label="Source" maxLength={300} />
            <Button type="submit" disabled={!draft.text.trim() || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</Button>
          </div>
        </form>
      </Panel>

      {a?.gaps?.length > 0 && (
        <Panel title="Gap analysis">
          <ul className="space-y-2">
            {a.gaps.map((g, i) => <li key={i} className="flex gap-3 text-sm"><Pill tone={GAP_TONE[g.priority]}>{g.priority}</Pill><div><div>{g.gap}</div><div className="text-xs text-muted-foreground">{g.why}</div></div></li>)}
          </ul>
        </Panel>
      )}
      {a?.painPoints?.length > 0 && (
        <Panel title="Pain points">
          <ul className="space-y-2">
            {a.painPoints.map((x, i) => <li key={i} className="flex gap-3 text-sm"><AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" /><div><div>{x.point}</div><div className="text-xs text-muted-foreground">Impact: {x.impact}</div></div></li>)}
          </ul>
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
    <div className={cn('rounded-lg border bg-card p-3 border-l-4', superseded && 'opacity-70')} style={{ borderLeftColor: `hsl(var(--${{ green: 'success', amber: 'warning', red: 'destructive', cyan: 'primary', gray: 'border' }[FINDING_TONE[f.status]]}))` }}>
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
        <Input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (f.note || '') && mutate(path, 'PATCH', { note }, 'Note saved')}
          placeholder="Resolution note (optional), e.g. Confirmed in workshop 28 Aug" aria-label="Resolution note" maxLength={1000} className="mt-2 h-8 text-xs" />
      )}
    </div>
  );
}

// ---- decisions ----

export function DecisionsTab({ project: p, mutate, base }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">Decisions and open items. Pending and Proposed items are never treated as confirmed requirements.</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!p.decisions.length} onClick={() => download(`${fileSafe(p.name)}_Decisions_Register.html`, decisionsRegisterHtml(p), 'text/html')}>
            <Download className="w-4 h-4" /> Decisions register
          </Button>
          <Button onClick={() => mutate(`${base}/decisions`, 'POST', {}, 'Item added')}><Plus className="w-4 h-4" /> Add item</Button>
        </div>
      </div>
      {p.decisions.length === 0
        ? <Panel><EmptyState title="No decisions yet" body="Add an item, or run the analysis to pick up decisions from the sources." /></Panel>
        : p.decisions.map(d => <DecisionRow key={d.id} decision={d} mutate={mutate} base={base} />)}
    </div>
  );
}

const DECISION_FIELDS = ['title', 'description', 'position', 'owner'];

function DecisionRow({ decision: d, mutate, base }) {
  const pick = () => Object.fromEntries(DECISION_FIELDS.map(k => [k, d[k] || '']));
  const [form, setForm] = useState(pick);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(pick()); }, [d.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = DECISION_FIELDS.some(k => form[k] !== (d[k] || ''));
  const path = `${base}/decisions/${d.id}`;
  const save = async () => { setSaving(true); await mutate(path, 'PATCH', form, 'Saved'); setSaving(false); };

  return (
    <Panel className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Decision title" maxLength={200} className="font-semibold" />
        <Pill tone={DECISION_TONE[d.status]} className="mt-2">{d.status.toLowerCase()}</Pill>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <SectionLabel className="mb-1">Description</SectionLabel>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} aria-label="Description" />
        </div>
        <div>
          <SectionLabel className="mb-1">Current position</SectionLabel>
          <Textarea value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} rows={2} maxLength={2000} aria-label="Current position" />
        </div>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <SectionLabel className="mb-1">Status</SectionLabel>
          <select value={d.status} onChange={(e) => mutate(path, 'PATCH', { status: e.target.value })} className={selectClass} aria-label="Status">
            {DECISION_STATUS.map(st => <option key={st} value={st}>{st.charAt(0) + st.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <SectionLabel className="mb-1">Owner</SectionLabel>
          <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Who owns this?" maxLength={120} aria-label="Owner" />
        </div>
        <Confirm title="Delete this item?" destructive confirmLabel="Delete" onConfirm={() => mutate(path, 'DELETE', undefined, 'Item removed')}>
          <Button variant="ghost" size="sm">Delete</Button>
        </Confirm>
        <Button size="sm" disabled={!dirty || saving || !form.title.trim()} onClick={save}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</Button>
      </div>
      <p className="text-xs text-muted-foreground">Raised {fmtDate(d.raisedAt)} · last updated {fmtDateTime(d.updatedAt)} by {d.updatedByName}</p>
    </Panel>
  );
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Standalone, printable decisions register. Open it in a browser and print to PDF.
function decisionsRegisterHtml(p) {
  const color = { CONFIRMED: '#15803d', PENDING: '#b45309', OPEN: '#b45309', PROPOSED: '#0369a1', SUPERSEDED: '#475569' };
  const counts = DECISION_STATUS.map(st => [st, p.decisions.filter(d => d.status === st).length]).filter(([, n]) => n).map(([st, n]) => `${st}: ${n}`).join(' · ');
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const block = (label, value) => (value ? `<div class="f"><div class="l">${label}</div><div>${esc(value)}</div></div>` : '');
  const items = p.decisions.map((d, i) => `
    <div class="d" style="border-left-color:${color[d.status] || '#475569'}">
      <div class="h"><div class="t">${i + 1}. ${esc(d.title)}</div><span class="s" style="color:${color[d.status] || '#475569'}">${esc(d.status)}</span></div>
      ${block('Description', d.description)}${block('Current position', d.position)}
      <div class="m"><span><b>Owner:</b> ${esc(d.owner || '—')}</span><span><b>Raised:</b> ${esc(fmtDate(d.raisedAt))}</span></div>
    </div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Decisions Register — ${esc(p.name)}</title>
<style>
*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0}.page{max-width:780px;margin:0 auto;padding:32px}
.bar{display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-size:13px}
.bar button{background:#0f766e;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer}
.head{border-bottom:3px solid #0f766e;padding-bottom:16px;margin-bottom:20px}.eyebrow{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b}
h1{margin:4px 0;font-size:24px}.sub{color:#0f766e;font-weight:600}.sum{background:#f1f5f9;border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:20px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.d{border:1px solid #cbd5e1;border-left:5px solid;border-radius:8px;padding:14px 18px;margin-bottom:14px;break-inside:avoid}.h{display:flex;justify-content:space-between;gap:12px}
.t{font-weight:700;font-size:15px}.s{font-size:10px;font-weight:700}.f{margin-top:10px;font-size:12px;line-height:1.5}.l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:2px}
.m{display:flex;gap:20px;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:12px}.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:40px;font-size:10px;color:#64748b}
.sig div div{border-bottom:1.5px solid #0f172a;height:32px;margin:6px 0}.foot{margin-top:28px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
@media print{.bar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:15mm 18mm}}
</style></head><body><div class="page">
<div class="bar"><span>Open in a browser, then print and choose “Save as PDF”.</span><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="head"><div class="eyebrow">Syscon Justice · AS-IS Navigator</div><h1>Decisions Register</h1><div class="sub">${esc(p.name)}</div>
${p.module ? `<div style="font-size:13px;color:#64748b">Module: ${esc(p.module)}</div>` : ''}<div style="font-size:12px;color:#64748b;margin-top:6px">Prepared ${esc(today)} · Knowledge base v${esc(p.version)}</div></div>
<div class="sum"><b>Total items: ${p.decisions.length}</b><span>${esc(counts)}</span></div>
${items}
<div class="sig">${['Prepared by', 'Reviewed by', 'Approved by'].map(r => `<div><b>${r}</b><div></div>Name / date</div>`).join('')}</div>
<div class="foot"><span>OneTeamOneGoal · AS-IS Navigator</span><span>${esc(p.name)} · KB v${esc(p.version)}</span></div>
</div></body></html>`;
}

// ---- what changed ----

export function ChangesTab({ project: p, onAddKnowledge }) {
  const c = p.changes;
  if (!c) return <Panel><EmptyState title="Nothing to compare yet" body="Add new knowledge and the update is compared with what's already known. The differences show up here." action={<Button size="sm" onClick={onAddKnowledge}>Add knowledge</Button>} /></Panel>;
  const groups = CHANGE_GROUPS.filter(g => c[g.key]?.length);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
        Latest update: KB v{c.version}, {fmtDateTime(c.at)}, classified <b>{FINDING_LABELS[c.classification]?.toLowerCase()}</b>{c.context ? ` — “${c.context.slice(0, 160)}${c.context.length > 160 ? '…' : ''}”` : ''}. Earlier findings are kept; review these changes before treating them as the validated AS-IS.
      </p>
      {c.notice && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{c.notice}</p>}
      {groups.length === 0 && <Panel><EmptyState title="No differences found" body="The new information didn't add to or change the knowledge base." /></Panel>}
      {groups.map(g => (
        <section key={g.key}>
          <SectionLabel className={cn('mb-2', TONE_TEXT[g.tone])}>{g.label} ({c[g.key].length})</SectionLabel>
          <ul className="space-y-1.5">{c[g.key].map((item, i) => <li key={i} className="rounded-lg border bg-card px-3 py-2 text-sm">{item}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
