'use client';

// TO-BE Design (Super-Agent 2): the future-state process drafted from the AS-IS knowledge
// base. Every pain point and gap is traced to the steps that address it, and steps that
// rely on anything not yet confirmed are flagged. The BA edits steps and traceability in
// place; the design downloads as a Word document, in the standard layout or written into
// the team's own template.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Compass, Download, FileUp, Flag, Loader2, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, Panel, Pill } from '@/components/otog/ui';
import { LimitedInput, LimitedTextarea, SectionLabel, TONE_TEXT, downloadBlob } from '@/components/asis/shared';
import { api } from '@/lib/api-client';
import { LIMITS, asIsSource, defaultToBeName, toBeFileName } from '@/lib/asis';
import {
  CHANGE_LABEL, CHANGE_TONE, DESIGN_CHANGE, DIRECTION_LABEL, KIND_LABEL, TRACE_LABEL, TRACE_STATUS, TRACE_TONE,
  designModel, designRefTables, flagLabel,
} from '@/lib/asis-design';
import { describeTemplate, fillTemplate, mergeFillResults } from '@/lib/asis-template';
import { fmtBytes, fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const noAi = 'Live Claude needs a Claude API key on the server. Switch to Demo script to rehearse.';
const today = () => new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function RefChip({ r }) {
  const lv = r.live.level;
  const style = lv === 'invalid' ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : lv === 'unconfirmed' ? 'border-warning/40 bg-warning/10 text-warning'
      : lv === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'bg-muted/60 text-muted-foreground';
  const status = lv === 'invalid' ? (r.live.status === 'MISSING' ? 'removed' : 'superseded') : r.live.status?.toLowerCase();
  return (
    <span title={r.text} className={cn('inline-flex items-baseline gap-1 max-w-full rounded-md border px-2 py-0.5 text-[11px]', style)}>
      {(lv === 'invalid' || lv === 'unconfirmed') && <span aria-hidden="true">⚑</span>}
      <strong className="whitespace-nowrap">{KIND_LABEL[r.kind]}{status ? ` · ${status}` : ''}</strong>
      <span className="truncate text-foreground/80">{r.text}</span>
    </span>
  );
}

export function DesignTab({ project: p, base, demo, canRun, busy, withBusy, mutate, store, onTab }) {
  const d = p.design;
  const [direction, setDirection] = useState(d?.direction || '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [draft, setDraft] = useState(() => ({ steps: d?.steps || [], traceability: d?.traceability || [] }));
  const [fileName, setFileName] = useState(p.toBeFileName || '');
  const timer = useRef(null);
  const pending = useRef(null);

  // A new or restored design replaces the local copy; the BA's own saves don't.
  useEffect(() => {
    setDraft({ steps: d?.steps || [], traceability: d?.traceability || [] });
    setDirection(d?.direction || '');
  }, [d?.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFileName(p.toBeFileName || ''); }, [p.toBeFileName]);

  const flush = async () => {
    clearTimeout(timer.current);
    const body = pending.current;
    pending.current = null;
    if (body) await mutate(`${base}/design`, 'PATCH', body);
  };
  // Leaving the tab saves any edit still waiting for its debounce.
  useEffect(() => () => { if (pending.current) flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (next, delay = 700) => {
    setDraft(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  const m = useMemo(() => (d ? designModel({ ...p, design: { ...d, ...draft } }) : null), [p, d, draft]);

  if (!p.analysis) return <Panel><EmptyState icon={Compass} title="The TO-BE design starts from the AS-IS baseline" action={<Button size="sm" onClick={() => onTab('sources')}>Create the baseline</Button>} /></Panel>;

  const generate = () => withBusy(p.design ? 'Updating the TO-BE design…' : 'Designing the TO-BE process…', async () => {
    await flush();
    const res = await api(`${base}/design`, { method: 'POST', body: { direction, demo } });
    store(res.project);
    setPanelOpen(false);
    setFlaggedOnly(false);
    toast.success(p.design ? 'TO-BE design updated' : 'TO-BE design created');
  });

  const downloadStandard = () => withBusy('Preparing the Word document…', async () => {
    await flush();
    const res = await fetch(`/api/${base}/design/docx`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message || `Download failed (${res.status})`);
    const name = toBeFileName(p);
    downloadBlob(await res.blob(), name);
    toast.success(`Downloaded ${name}`);
  });

  const downloadTemplated = () => withBusy('Opening your TO-BE template…', async (setMessage) => {
    await flush();
    const t = p.toBeTemplate;
    const n = t.batchCount;
    const results = new Array(n);
    let done = 0;
    const progress = () => setMessage(`Writing ${t.sectionCount} template sections (${done} of ${n} parts)…`);
    progress();
    const runBatch = async (i) => {
      results[i] = (await api(`${base}/design/fill`, { method: 'POST', body: { batch: i, demo, today: today() } })).result;
      done += 1;
      progress();
    };
    // Two at a time keeps it quick without flooding the AI service.
    for (let i = 0; i < n; i += 2) await Promise.all([runBatch(i), i + 1 < n ? runBatch(i + 1) : null]);
    const out = mergeFillResults(results);
    if (!out.sections.length) throw new Error('No section content came back. Try again.');
    setMessage('Building the Word document…');
    const res = await fetch(`/api/${base}/template`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message || "The template couldn't be loaded.");
    const blob = await fillTemplate(await res.arrayBuffer(), out);
    const name = toBeFileName(p);
    downloadBlob(blob, name);
    toast.success(`Downloaded ${name}. Word may ask to update fields so the contents page refreshes.`);
  });

  const uploadTemplate = async (file) => {
    if (!/\.(docx|dotx)$/i.test(file.name)) return toast.error('The TO-BE template must be a Word file (.docx or .dotx). Save older .doc files as .docx first.');
    if (file.size > LIMITS.templateBytes) return toast.error('The template is over 4 MB. Remove large images from it and upload it again.');
    await withBusy('Reading the template…', async () => {
      const outline = await describeTemplate(file);
      const form = new FormData();
      form.set('file', file);
      form.set('outline', JSON.stringify(outline));
      const res = await api(`${base}/template`, { method: 'POST', body: form });
      store(res.project);
      toast.success(`TO-BE template saved: ${outline.sections.length} sections, ${outline.tables.length} tables`);
    });
  };

  const directionPanel = (
    <Panel className="bg-muted/30">
      <label htmlFor="design-dir" className="text-sm font-medium">Design direction <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
      <div className="mt-1">
        <LimitedTextarea id="design-dir" limit={LIMITS.direction} value={direction} onChange={(e) => setDirection(e.target.value)} rows={4}
          note="Your instructions take priority over the previous design."
          placeholder="e.g. Use the OMS sentence calculator once release 24.2 is in. Keep a human second check. No new integrations this phase." />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{d ? 'Regenerating starts from the current design, including your edits, and applies this direction. The version it replaces is kept, so you can switch back.' : 'Tell Super-Agent 2 about constraints, preferred options or scope. Leave it blank to let it propose.'}</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        <Button onClick={generate} disabled={!canRun || busy} title={canRun ? undefined : noAi}><Sparkles className="w-4 h-4" /> {d ? (m?.stale ? `Regenerate for KB v${p.version}` : 'Regenerate design') : 'Generate TO-BE design'}</Button>
        {d && <Button variant="ghost" onClick={() => setPanelOpen(false)}>Cancel</Button>}
      </div>
    </Panel>
  );
  const templateCard = <TemplateCard project={p} base={base} busy={busy} mutate={mutate} onUpload={uploadTemplate} />;

  if (!d) {
    const t = designRefTables(p);
    const cnt = (k) => t.order.filter(r => r.kind === k).length;
    const unconfirmed = t.order.filter(r => ['finding', 'decision', 'question'].includes(r.kind) && r.status !== 'CONFIRMED').length;
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <SectionLabel>Super-Agent 2 · Design</SectionLabel>
          <h2 className="text-xl font-bold mt-1">Design the TO-BE process from this AS-IS</h2>
          <p className="text-sm text-muted-foreground mt-1">Super-Agent 2 reads this project&apos;s knowledge base and proposes the future-state process. Every pain point and gap is traced to the step that solves it. Steps that rely on anything not yet confirmed are flagged, so you know what to validate with the customer.</p>
        </div>
        <Panel className="p-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground tabular-nums">
          <span><b className="text-foreground">{cnt('asis')}</b> AS-IS steps</span>
          <span><b className="text-foreground">{cnt('pain')}</b> pain points</span>
          <span><b className="text-foreground">{cnt('gap')}</b> gaps</span>
          <span><b className="text-foreground">{cnt('finding')}</b> findings</span>
          <span><b className="text-foreground">{cnt('decision') + cnt('question')}</b> open items</span>
          {unconfirmed > 0 && <span className="text-warning">⚑ <b>{unconfirmed}</b> not confirmed, flagged where used</span>}
        </Panel>
        {templateCard}
        {directionPanel}
      </div>
    );
  }

  const steps = flaggedOnly ? m.steps.filter(s => s.flags.length) : m.steps;
  const cov = m.coverage;
  const pct = (n) => `${cov.total ? (n / cov.total) * 100 : 0}%`;
  const setStep = (i, field, value, delay) => edit({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }, delay);
  const moveStep = (i, dir) => {
    const list = [...draft.steps];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    edit({ ...draft, steps: list }, 0);
  };
  const removeStep = (i) => {
    const gone = draft.steps[i].id;
    edit({ steps: draft.steps.filter((_, j) => j !== i), traceability: draft.traceability.map(t => ({ ...t, stepIds: (t.stepIds || []).filter(x => x !== gone) })) }, 0);
    toast.success('Step removed');
  };
  const addStep = () => edit({ ...draft, steps: [...draft.steps, { id: `U${Date.now()}`, name: 'New step', actor: '', system: '', change: 'NEW', description: '', replaces: [], basedOn: [] }] }, 0);
  const setTrace = (i, field, value, delay) => edit({ ...draft, traceability: draft.traceability.map((t, j) => (j === i ? { ...t, [field]: value } : t)) }, delay);
  const saveFileName = () => fileName !== (p.toBeFileName || '') && mutate(base, 'PATCH', { toBeFileName: fileName }, 'File name saved');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <SectionLabel>Super-Agent 2 · Design</SectionLabel>
          <h2 className="text-xl font-bold mt-0.5">TO-BE process</h2>
          <p className="text-xs text-muted-foreground">Built on KB {d.basedOnKb} · {fmtDateTime(d.generatedAt)}{d.generatedByName ? ` by ${d.generatedByName}` : ''}{d.demo ? ' · demo script' : ''}{d.changeNote && p.designPrev ? ` · ${d.changeNote}` : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {p.designPrev && (
            <Button variant="outline" disabled={busy} onClick={async () => { await flush(); if (await mutate(`${base}/design/restore`, 'POST', undefined, 'Previous design restored. Press again to switch back.')) setPanelOpen(false); }}
              title={`Switch to the design built on ${p.designPrev.basedOnKb}`}><RotateCcw className="w-4 h-4" /> Previous version</Button>
          )}
          <Button variant="outline" aria-expanded={panelOpen} onClick={() => setPanelOpen(v => !v)}><Compass className="w-4 h-4" /> {panelOpen ? 'Hide direction' : 'Direction & regenerate'}</Button>
          {p.toBeTemplate
            ? <Button disabled={busy || (!canRun)} title={canRun ? `Fill ${p.toBeTemplate.name}` : noAi} onClick={downloadTemplated}><Download className="w-4 h-4" /> Word (your template)</Button>
            : <Button disabled={busy} onClick={downloadStandard}><Download className="w-4 h-4" /> Word document</Button>}
        </div>
      </div>

      {m.stale && !panelOpen && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning flex gap-3 items-center flex-wrap">
          <span className="flex-1 min-w-[240px]">The knowledge base is now <b>v{p.version}</b>; this design was built on <b>{d.basedOnKb}</b>. The flags below already show current statuses. Regenerate the design to take in the new information.</span>
          <Button size="sm" onClick={() => setPanelOpen(true)}>Regenerate for KB v{p.version}</Button>
        </p>
      )}
      {panelOpen && directionPanel}
      {templateCard}

      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="tobe-filename" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Word file name</label>
        <LimitedInput id="tobe-filename" wrapClassName="flex-1 min-w-[240px]" limit={LIMITS.fileName} value={fileName} placeholder={defaultToBeName(p)}
          onChange={(e) => setFileName(e.target.value)} onBlur={saveFileName} className="h-8 text-sm" />
        <p className="basis-full text-xs text-muted-foreground">
          {asIsSource(p) ? `Based on the AS-IS document “${asIsSource(p).name}”.` : 'No AS-IS document found in the sources, so the project name is used.'} The KB version and date are added so a copy that&apos;s open in Word is never overwritten.
          {p.toBeTemplate && <> Need the standard layout instead? <button type="button" className="text-primary font-semibold hover:underline" disabled={busy} onClick={downloadStandard}>Download the standard Word layout</button></>}
        </p>
      </div>

      <Panel>
        <p className="text-sm leading-relaxed max-w-3xl">{d.summary}</p>
        {d.principles?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{d.principles.map((x, i) => <span key={i} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">{x}</span>)}</div>}
      </Panel>

      {d.direction && (
        <Panel>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <SectionLabel>Your direction</SectionLabel>
            <button type="button" className="text-xs text-primary font-semibold hover:underline" onClick={() => setPanelOpen(true)}>Edit direction →</button>
          </div>
          <p className="text-sm text-muted-foreground italic whitespace-pre-wrap break-words mt-1">“{d.direction}”</p>
          {d.directionApplied?.length
            ? <ul className="mt-2 divide-y">{d.directionApplied.map((x, i) => (
              <li key={i} className="flex gap-3 py-2 flex-wrap">
                <Pill tone={x.status === 'APPLIED' ? 'green' : x.status === 'PARTIAL' ? 'amber' : 'red'}>{DIRECTION_LABEL[x.status]}</Pill>
                <div className="flex-1 min-w-[220px]"><div className="text-sm font-semibold">{x.instruction}</div>{x.how && <div className="text-sm text-muted-foreground">{x.how}</div>}</div>
              </li>
            ))}</ul>
            : <p className="text-sm text-warning mt-2">This design didn&apos;t report how each instruction was applied. Use Direction &amp; regenerate to check them.</p>}
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" disabled={!m.flaggedSteps} aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(v => !v)}
          className={cn('rounded-xl border p-4 text-left', m.flaggedSteps ? 'bg-warning/10 border-warning/40' : 'bg-card', flaggedOnly && 'ring-2 ring-warning')}>
          <SectionLabel>Needs validation</SectionLabel>
          <div className={cn('text-2xl font-bold tabular-nums mt-1', m.flaggedSteps ? 'text-warning' : 'text-success')}>{m.flaggedSteps ? `⚑ ${m.flaggedSteps} of ${m.steps.length} steps` : '✓ All steps confirmed'}</div>
          <div className="text-xs text-muted-foreground">{m.flaggedSteps ? (flaggedOnly ? 'Showing only these steps · click to show all' : 'Depend on unconfirmed information · click to show only these') : 'No step relies on unconfirmed information'}</div>
        </button>
        <div className="rounded-xl border bg-card p-4">
          <SectionLabel>Pain points &amp; gaps covered</SectionLabel>
          <div className="text-2xl font-bold tabular-nums mt-1">{cov.addressed} <span className="text-sm font-semibold text-muted-foreground">of {cov.total} addressed</span></div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted my-2" role="img" aria-label={`${cov.addressed} addressed, ${cov.partial} partly, ${cov.none} not addressed`}>
            <div className="bg-success" style={{ width: pct(cov.addressed) }} /><div className="bg-warning" style={{ width: pct(cov.partial) }} /><div className="bg-destructive" style={{ width: pct(cov.none) }} />
          </div>
          <div className="text-xs text-muted-foreground">{cov.partial} partly · {cov.none} not addressed</div>
        </div>
      </div>

      <section>
        <SectionLabel className="mb-2">TO-BE process{flaggedOnly && <span className="normal-case tracking-normal text-warning"> · showing {steps.length} flagged</span>}</SectionLabel>
        <ol className="space-y-2.5">
          {steps.map(st => {
            const i = st.n - 1;
            const removed = st.change === 'REMOVED';
            const flagged = st.flags.length > 0;
            return (
              <li key={st.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2.5">
                <div className={cn('w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold tabular-nums', removed ? 'border-destructive/50 text-destructive' : 'border-primary bg-primary/15 text-primary')}>{st.n}</div>
                <div className={cn('rounded-lg border bg-card p-3 border-l-4 min-w-0', flagged ? 'border-warning/50' : '', removed && 'opacity-80')}
                  style={{ borderLeftColor: flagged ? 'hsl(var(--warning))' : undefined }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={st.change} onChange={(e) => setStep(i, 'change', e.target.value, 0)} aria-label="Type of change" className={cn(selectClass, 'h-7 text-xs font-semibold', TONE_TEXT[CHANGE_TONE[st.change]])}>
                      {DESIGN_CHANGE.map(c => <option key={c} value={c}>{CHANGE_LABEL[c]}</option>)}
                    </select>
                    {flagged && <Pill tone="amber"><Flag className="w-3 h-3" /> Needs validation</Pill>}
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0 || flaggedOnly} onClick={() => moveStep(i, -1)} aria-label="Move step up"><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === m.steps.length - 1 || flaggedOnly} onClick={() => moveStep(i, 1)} aria-label="Move step down"><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Confirm title="Remove this step?" description="It's also removed from the traceability rows that point at it." destructive confirmLabel="Remove" onConfirm={() => removeStep(i)}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove step"><X className="w-3.5 h-3.5" /></Button>
                      </Confirm>
                    </div>
                  </div>
                  <LimitedInput limit={LIMITS.stepName} value={st.name} onChange={(e) => setStep(i, 'name', e.target.value)} aria-label="Step name"
                    wrapClassName="mt-2" className={cn('font-semibold border-transparent shadow-none hover:border-input focus-visible:border-input', removed && 'line-through')} />
                  <div className="grid gap-2 sm:grid-cols-2 mt-1">
                    <LimitedInput limit={LIMITS.stepActor} value={st.actor} onChange={(e) => setStep(i, 'actor', e.target.value)} placeholder="Actor (role)" aria-label="Actor" className="h-8 text-sm" />
                    <LimitedInput limit={LIMITS.stepActor} value={st.system} onChange={(e) => setStep(i, 'system', e.target.value)} placeholder="System" aria-label="System" className="h-8 text-sm" />
                  </div>
                  <div className="mt-2"><LimitedTextarea compact limit={LIMITS.stepText} value={st.description} onChange={(e) => setStep(i, 'description', e.target.value)} rows={2} placeholder="What happens in this step" aria-label="Step description" /></div>
                  {st.replaces?.length > 0 && <p className="text-xs text-muted-foreground mt-1.5"><span className="font-semibold">Replaces AS-IS:</span> {st.replaces.map(r => r.text).join(' · ')}</p>}
                  {st.refs.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{st.refs.map((r, k) => <RefChip key={k} r={r} />)}</div>}
                </div>
              </li>
            );
          })}
        </ol>
        {!flaggedOnly && <Button variant="outline" size="sm" className="mt-3 ml-10" onClick={addStep} disabled={draft.steps.length >= LIMITS.designSteps}><Plus className="w-4 h-4" /> Add step</Button>}
      </section>

      <section>
        <SectionLabel className="mb-2">Traceability · AS-IS pain points &amp; gaps</SectionLabel>
        <div className="space-y-2">
          {m.trace.map((t, i) => (
            <div key={t.ref} className="rounded-lg border bg-card p-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="min-w-0">
                <Pill tone={t.kind === 'gap' ? 'cyan' : 'amber'}>{t.kind === 'gap' ? `Gap${t.priority ? ` · ${t.priority}` : ''}` : 'Pain point'}</Pill>
                <div className="text-sm font-semibold mt-1.5">{t.text}</div>
                {t.detail && <div className="text-xs text-muted-foreground">{t.detail}</div>}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={t.status} onChange={(e) => setTrace(i, 'status', e.target.value, 0)} aria-label="Coverage" className={cn(selectClass, 'h-7 text-xs font-semibold', TONE_TEXT[TRACE_TONE[t.status]])}>
                    {TRACE_STATUS.map(x => <option key={x} value={x}>{TRACE_LABEL[x]}</option>)}
                  </select>
                  {t.stepNums.length > 0 && <span className="text-xs text-muted-foreground">Step{t.stepNums.length > 1 ? 's' : ''} {t.stepNums.join(', ')}</span>}
                </div>
                <div className="mt-1.5"><LimitedTextarea compact limit={LIMITS.resolution} value={t.resolution} onChange={(e) => setTrace(i, 'resolution', e.target.value)} rows={2} aria-label="How the TO-BE addresses it" /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2">To validate with the customer</SectionLabel>
        {!m.validation.length && !m.assumptions.length
          ? <Panel className="p-4 text-sm text-success">✓ Nothing outstanding. The design rests on confirmed information.</Panel>
          : (
            <Panel className="p-4">
              <ul className="divide-y">
                {m.validation.map((v, i) => (
                  <li key={i} className="flex gap-3 py-2 flex-wrap items-start">
                    <Pill tone={v.live.level === 'invalid' ? 'red' : 'amber'}>{v.live.level === 'invalid' ? (v.live.status === 'MISSING' ? 'Removed' : 'Superseded') : v.live.status}</Pill>
                    <div className="flex-1 min-w-[220px]">
                      <div className="text-sm">{v.text}</div>
                      <div className="text-xs text-muted-foreground">{KIND_LABEL[v.kind]}{v.steps.length ? ` · affects step${v.steps.length > 1 ? 's' : ''} ${v.steps.join(', ')}` : ''}{v.assumptions ? ` · ${v.assumptions} assumption${v.assumptions > 1 ? 's' : ''}` : ''}</div>
                    </div>
                    <button type="button" className="text-xs text-primary font-semibold hover:underline" onClick={() => onTab(v.kind === 'finding' ? 'findings' : 'open')}>{v.kind === 'finding' ? 'Open in Findings →' : 'Open in Open items →'}</button>
                  </li>
                ))}
              </ul>
              {m.assumptions.length > 0 && (
                <>
                  <div className="text-sm font-semibold mt-3 mb-1">Design assumptions</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {m.assumptions.map((a, i) => <li key={i}>{a.text}{a.flags.length > 0 && <span className="text-xs text-warning"> · ⚑ relies on {a.flags.map(r => flagLabel(r).toLowerCase()).join(', ')}</span>}</li>)}
                  </ul>
                </>
              )}
            </Panel>
          )}
      </section>
    </div>
  );
}

function TemplateCard({ project: p, base, busy, mutate, onUpload }) {
  const t = p.toBeTemplate;
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (files) => { const f = files?.[0]; if (f) onUpload(f); };
  return (
    <Panel className={cn(!t && 'border-primary/40 bg-primary/5')}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <SectionLabel>TO-BE template</SectionLabel>
          {t ? (
            <>
              <div className="font-semibold mt-1 break-words">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.sectionCount} sections · {t.tableCount} tables · {fmtBytes(t.size)} · uploaded {fmtDate(t.uploadedAt)}{t.uploadedByName ? ` by ${t.uploadedByName}` : ''}</div>
              <p className="text-sm mt-1.5">The Word download fills this template: its cover page, styles, headers, footers, headings and tables are kept, and each section is written from the TO-BE design.</p>
            </>
          ) : <p className="text-sm mt-1 max-w-3xl">Upload your TO-BE Word template and the download will follow it: same cover page, styles, headers, footers, headings and tables, with each section written from the design. Without one, a standard layout is used.</p>}
        </div>
        {t && (
          <Confirm title="Remove the TO-BE template?" description="Downloads will use the standard layout until you upload a template again." destructive confirmLabel="Remove" onConfirm={() => mutate(`${base}/template`, 'DELETE', undefined, 'Template removed. The standard layout will be used.')}>
            <Button variant="ghost" size="sm" disabled={busy}><Trash2 className="w-4 h-4" /> Remove</Button>
          </Confirm>
        )}
      </div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        className={cn('mt-3 w-full rounded-lg border-2 border-dashed px-4 py-3 text-sm text-muted-foreground', over ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
        {busy ? <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> : <FileUp className="w-4 h-4 inline mr-1" />}
        {over ? (t ? 'Drop to replace the template' : 'Drop to use this template') : <><b className="text-foreground">{t ? 'Drag a new template here to replace it' : 'Drag your TO-BE template here'}</b> or click to choose · Word .docx or .dotx, up to 4 MB</>}
      </button>
      <input ref={input} type="file" accept=".docx,.dotx" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      {t?.headings?.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-primary">Sections that will be written</summary>
          <ol className="mt-1.5 text-xs space-y-0.5">
            {t.headings.map((h, i) => <li key={i} style={{ paddingLeft: (h.level - 1) * 16 }}>{h.text}{h.tables > 0 && <span className="text-muted-foreground"> · {h.tables} table{h.tables > 1 ? 's' : ''}</span>}</li>)}
          </ol>
        </details>
      )}
    </Panel>
  );
}
