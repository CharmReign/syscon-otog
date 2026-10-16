'use client';

// Sources: the intake creates the AS-IS baseline (KB v1.0) once. After that the intake is
// read-only and new information goes in through Add knowledge (v1.1, v1.2 …), so nothing
// the BA has edited is overwritten.
import { useState } from 'react';
import { BookOpen, FileText, Image as ImageIcon, Info, Loader2, MessageSquareText, RefreshCw, Save, Search, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { selectClass } from '@/components/otog/confirm';
import { Panel } from '@/components/otog/ui';
import { FileDrop, PasteBox, ReferencePicker, analysisForm } from '@/components/asis/inputs';
import { LimitedInput, LimitedTextarea, SectionLabel } from '@/components/asis/shared';
import { CLASSIFICATIONS, LIMITS, PAIN_POINTS, nextVersion } from '@/lib/asis';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const SOURCE_ICON = { document: FileText, image: ImageIcon, pasted: MessageSquareText, note: MessageSquareText, internal: FileText, confluence: BookOpen, jira: Ticket };

const Field = ({ label, hint, htmlFor, children }) => (
  <div>
    <label className="text-sm font-medium" htmlFor={htmlFor}>{label}{hint && <span className="text-xs font-normal text-muted-foreground"> {hint}</span>}</label>
    <div className="mt-1">{children}</div>
  </div>
);

const noAi = 'Live Claude needs a Claude API key on the server. Switch to Demo script to rehearse.';
const strip = (refs) => refs.map(({ key, ...r }) => r);

export function SourcesTab({ project: p, canRun, busy, onSaveIntake, onBaseline, onAddKnowledge, onOpenSource, onGoToDesign }) {
  return (
    <div className="space-y-4">
      {p.sources.length > 0 && (
        <Panel className="p-4">
          <SectionLabel className="mb-2">Knowledge sources · {p.sources.length}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {p.sources.map(src => {
              const Icon = SOURCE_ICON[src.kind] || FileText;
              return (
                <button key={src.id} type="button" onClick={() => onOpenSource(src)} title={src.name}
                  className="inline-flex items-center gap-1.5 max-w-full rounded-md border bg-muted/40 px-2.5 py-1 text-xs hover:border-primary/60">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[260px]">{src.name}</span>
                  <span className="text-muted-foreground shrink-0">{src.version}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      )}
      {p.analysis
        ? <><OriginalIntake project={p} /><AddKnowledge project={p} canRun={canRun} busy={busy} onRun={onAddKnowledge} /></>
        : <Intake project={p} canRun={canRun} busy={busy} onSave={onSaveIntake} onRun={onBaseline} onGoToDesign={onGoToDesign} />}
    </div>
  );
}

function Intake({ project, canRun, busy, onSave, onRun, onGoToDesign }) {
  const [module, setModule] = useState(project.module || '');
  const [intake, setIntake] = useState(() => ({ pasted: '', pastedSources: [], ...project.intake }));
  const [files, setFiles] = useState([]);
  const [references, setReferences] = useState([]);
  const set = (patch) => setIntake(cur => ({ ...cur, ...patch }));
  const togglePain = (pt) => set({ pains: intake.pains.includes(pt) ? intake.pains.filter(x => x !== pt) : [...intake.pains, pt] });
  const custom = intake.pains.filter(pt => !PAIN_POINTS.includes(pt));
  const draft = { problem: intake.problem, currentState: intake.currentState, pains: intake.pains, otherPains: intake.otherPains, pasted: intake.pasted, pastedSources: intake.pastedSources };

  const run = async () => {
    if (await onRun(analysisForm({ module, ...draft, references: strip(references) }, files))) { setFiles([]); setReferences([]); }
  };

  return (
    <>
      <Panel title="Step 1 · Project intake">
        <p className="text-sm text-muted-foreground -mt-2 mb-4 max-w-3xl">Describe how the process works today and attach what you have. The analysis creates the AS-IS baseline (KB v1.0). After that, new information goes in through Add knowledge, so nothing you edit is overwritten.</p>
        <div className="space-y-4">
          <Field label="OMS module / process" htmlFor="in-module">
            <LimitedInput id="in-module" limit={LIMITS.module} value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. Sentence management, Parole, Intake, Risk assessment" />
          </Field>
          <Field label="Problem statement" hint="(optional)" htmlFor="in-problem">
            <LimitedTextarea id="in-problem" limit={LIMITS.problem} value={intake.problem} onChange={(e) => set({ problem: e.target.value })} rows={3} placeholder="What is going wrong? Who is affected? What is the impact?" />
          </Field>
          <Field label="Current state description" hint="(optional)" htmlFor="in-state">
            <LimitedTextarea id="in-state" limit={LIMITS.currentState} value={intake.currentState} onChange={(e) => set({ currentState: e.target.value })} rows={4} placeholder="How does the process work today? Steps, systems, who is involved…" />
          </Field>
          <div>
            <div className="text-sm font-medium">Known pain points</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5" role="group" aria-label="Known pain points">
              {[...PAIN_POINTS, ...custom].map(pt => (
                <button key={pt} type="button" aria-pressed={intake.pains.includes(pt)} onClick={() => togglePain(pt)}
                  className={cn('px-2.5 h-7 rounded-md border text-xs', intake.pains.includes(pt) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:border-primary/50')}>
                  {pt}
                </button>
              ))}
            </div>
            <div className="mt-2"><LimitedTextarea limit={LIMITS.otherPains} value={intake.otherPains} onChange={(e) => set({ otherPains: e.target.value })} rows={2} placeholder="Other pain points…" aria-label="Other pain points" /></div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" disabled={busy} onClick={() => onSave({ module, intake: draft })}><Save className="w-4 h-4" /> Save draft</Button>
          </div>
        </div>
      </Panel>

      <Panel title="What you have">
        <div className="space-y-5">
          <Field label="Email, Teams, Jira and Confluence content" hint="(optional)" htmlFor="in-paste">
            <PasteBox id="in-paste" value={intake.pasted} onChange={(v) => set({ pasted: v })} sources={intake.pastedSources} onSources={(v) => set({ pastedSources: v })} />
          </Field>
          <Field label="Supporting documents and screenshots" hint="(optional)">
            <FileDrop files={files} onChange={setFiles} />
            <p className="text-xs text-muted-foreground mt-1.5">Looking for the TO-BE Word template? Upload it on the <button type="button" className="text-primary font-semibold hover:underline" onClick={onGoToDesign}>TO-BE design</button> tab.</p>
          </Field>
          <Field label="References from documents, Confluence and Jira" hint="(optional)">
            <ReferencePicker value={references} onChange={setReferences} />
          </Field>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button disabled={!canRun || busy} title={canRun ? undefined : noAi} onClick={run}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Create AS-IS baseline
        </Button>
      </div>
    </>
  );
}

function OriginalIntake({ project: p }) {
  const i = p.intake || {};
  const rows = [
    ['Module / process', i.module], ['Problem statement', i.problem], ['Current state description', i.currentState],
    ['Known pain points', [...(i.pains || []), i.otherPains].filter(Boolean).join(' · ')],
    ['Documents and screenshots', (i.files || []).join(', ')], ['References', (i.references || []).join(', ')],
    ['Pasted content from', (i.pastedSources || []).join(', ')],
  ].filter(([, v]) => v);
  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-5 py-3 font-semibold text-primary">Original intake (baseline v1.0)</summary>
      <div className="px-5 pb-5 space-y-3 text-sm">
        {!i.at && !rows.length ? <p className="text-muted-foreground italic">The intake answers weren&apos;t saved for this project.</p> : rows.map(([label, value]) => (
          <div key={label}><SectionLabel>{label}</SectionLabel><div className="whitespace-pre-wrap break-words">{value}</div></div>
        ))}
        {i.pasted && <div><SectionLabel>Pasted content</SectionLabel><div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs max-h-44 overflow-y-auto">{i.pasted}</div></div>}
        {i.at && <p className="text-xs text-muted-foreground">Captured {fmtDate(i.at)}{i.byName ? ` by ${i.byName}` : ''}</p>}
      </div>
    </details>
  );
}

function AddKnowledge({ project, canRun, busy, onRun }) {
  const [context, setContext] = useState('');
  const [classification, setClassification] = useState('PENDING');
  const [pasted, setPasted] = useState('');
  const [pastedSources, setPastedSources] = useState([]);
  const [files, setFiles] = useState([]);
  const [references, setReferences] = useState([]);
  const empty = !context.trim() && !pasted.trim() && !files.length && !references.length;

  const run = async () => {
    const form = analysisForm({ context, classification, pasted, pastedSources, references: strip(references) }, files);
    if (await onRun(form)) { setContext(''); setPasted(''); setPastedSources([]); setFiles([]); setReferences([]); }
  };

  return (
    <Panel title={<>Add knowledge <span className="text-sm font-normal text-muted-foreground">· next version v{nextVersion(project.version)}</span></>}>
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex gap-2 -mt-1 mb-5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        New information is compared with the knowledge base. Findings and open items are updated, the overview is refreshed, and the details appear in History.
      </p>
      <div className="space-y-5">
        <Field label="What is this new information about?" htmlFor="ak-context">
          <LimitedTextarea id="ak-context" limit={LIMITS.context} value={context} onChange={(e) => setContext(e.target.value)} rows={3}
            placeholder="e.g. Client workshop notes from 20 Aug. Updated integration spec. Resolution of a Jira ticket…" />
        </Field>
        <Field label="Classify this information as" htmlFor="ak-class">
          <select id="ak-class" value={classification} onChange={(e) => setClassification(e.target.value)} className={cn(selectClass, 'w-full')}>
            {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}: {c.hint}</option>)}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Only Confirmed information can confirm findings, answer questions for good, or supersede findings. Anything else that contradicts a finding marks it Conflicting for review.</p>
        </Field>
        <Field label="Email, Teams, Jira and Confluence content" htmlFor="ak-paste">
          <PasteBox id="ak-paste" value={pasted} onChange={setPasted} sources={pastedSources} onSources={setPastedSources} />
        </Field>
        <Field label="New documents and screenshots"><FileDrop files={files} onChange={setFiles} /></Field>
        <Field label="References from documents, Confluence and Jira"><ReferencePicker value={references} onChange={setReferences} /></Field>
        <div className="flex justify-end">
          <Button disabled={!canRun || busy || empty} title={canRun ? undefined : noAi} onClick={run}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Analyse and show what changed
          </Button>
        </div>
      </div>
    </Panel>
  );
}
