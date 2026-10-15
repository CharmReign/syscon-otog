'use client';

// The two tabs that feed the knowledge base: Intake (first analysis) and Add knowledge
// (updates compared against what is already known).
import { useState } from 'react';
import { Info, Loader2, RefreshCw, Save, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, Panel } from '@/components/otog/ui';
import { FileDrop, ReferencePicker, analysisForm } from '@/components/asis/inputs';
import { CLASSIFICATIONS, PAIN_POINTS } from '@/lib/asis';
import { cn } from '@/lib/utils';

const Field = ({ label, hint, htmlFor, children }) => (
  <div>
    <label className="text-sm font-medium" htmlFor={htmlFor}>{label}{hint && <span className="text-xs font-normal text-muted-foreground"> {hint}</span>}</label>
    <div className="mt-1">{children}</div>
  </div>
);

const noAiTitle = 'AI analysis needs a Claude API key on the server.';

export function IntakeTab({ project, ai, busy, onSaveIntake, onRun }) {
  const [module, setModule] = useState(project.module || '');
  const [intake, setIntake] = useState(project.intake);
  const [files, setFiles] = useState([]);
  const [template, setTemplate] = useState([]);
  const [references, setReferences] = useState([]);
  const set = (patch) => setIntake(cur => ({ ...cur, ...patch }));
  const togglePain = (pt) => set({ pains: intake.pains.includes(pt) ? intake.pains.filter(x => x !== pt) : [...intake.pains, pt] });
  const custom = intake.pains.filter(pt => !PAIN_POINTS.includes(pt));

  const run = async () => {
    const form = analysisForm({ module, ...intake, references: references.map(({ key, ...r }) => r) }, files, template[0]);
    if (await onRun(form)) { setFiles([]); setTemplate([]); setReferences([]); }
  };
  const runButton = (
    <Button disabled={!ai || busy} title={ai ? undefined : noAiTitle} onClick={project.analysis ? undefined : run}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : project.analysis ? <RefreshCw className="w-4 h-4" /> : <Search className="w-4 h-4" />}
      {project.analysis ? 'Re-run initial analysis' : 'Run initial AS-IS analysis'}
    </Button>
  );

  return (
    <div className="space-y-4">
      <Panel title="Project intake">
        <div className="space-y-4">
          <Field label="OMS module / process" htmlFor="in-module">
            <Input id="in-module" value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. Sentence management, Parole, Intake, Risk assessment" maxLength={120} />
          </Field>
          <Field label="Problem statement" hint="(optional)" htmlFor="in-problem">
            <Textarea id="in-problem" value={intake.problem} onChange={(e) => set({ problem: e.target.value })} rows={3} maxLength={4000} placeholder="What is going wrong? Who is affected? What is the impact?" />
          </Field>
          <Field label="Current state description" hint="(optional)" htmlFor="in-state">
            <Textarea id="in-state" value={intake.currentState} onChange={(e) => set({ currentState: e.target.value })} rows={4} maxLength={8000} placeholder="How does the process work today? Steps, systems, who is involved…" />
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
            <Textarea value={intake.otherPains} onChange={(e) => set({ otherPains: e.target.value })} rows={2} maxLength={2000} placeholder="Other pain points…" aria-label="Other pain points" className="mt-2" />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" disabled={busy} onClick={() => onSaveIntake({ module, intake })}><Save className="w-4 h-4" /> Save intake</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Sources for this analysis">
        <div className="space-y-5">
          <Field label="Supporting documents" hint="(optional)">
            <FileDrop files={files} onChange={setFiles} />
          </Field>
          <Field label="References from documents, Confluence and Jira" hint="(optional)">
            <ReferencePicker value={references} onChange={setReferences} />
          </Field>
          <Field label="Output template" hint="(optional: guides wording and emphasis)">
            <FileDrop files={template} onChange={setTemplate} multiple={false} label="Add a BA template" />
          </Field>
        </div>
      </Panel>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {project.analysis && <span className="text-xs text-muted-foreground">Re-running replaces the AI findings and summary. Findings you added by hand are kept.</span>}
        {project.analysis
          ? <Confirm title="Re-run the initial analysis?" description="The summary and AI-generated findings are replaced, and the knowledge base version goes up. Findings you added by hand and existing decisions are kept." confirmLabel="Re-run" onConfirm={run}>{runButton}</Confirm>
          : runButton}
      </div>
    </div>
  );
}

export function AddKnowledgeTab({ project, ai, busy, onRun, onGoToIntake }) {
  const [context, setContext] = useState('');
  const [classification, setClassification] = useState('PENDING');
  const [files, setFiles] = useState([]);
  const [references, setReferences] = useState([]);

  if (!project.analysis) {
    return <Panel><EmptyState title="Run the initial analysis first" body="New knowledge is compared with the existing knowledge base, so start with the intake." action={<Button size="sm" onClick={onGoToIntake}>Go to intake</Button>} /></Panel>;
  }

  const empty = !context.trim() && !files.length && !references.length;
  const run = async () => {
    const form = analysisForm({ context, classification, references: references.map(({ key, ...r }) => r) }, files);
    if (await onRun(form)) { setContext(''); setFiles([]); setReferences([]); }
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex gap-2">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        Existing sources and findings are kept. New information is compared with the knowledge base and reported as new, changed, conflicting, resolved or superseded.
      </p>
      <Panel>
        <div className="space-y-5">
          <Field label="What is this new information about?" htmlFor="ak-context">
            <Textarea id="ak-context" value={context} onChange={(e) => setContext(e.target.value)} rows={3} maxLength={8000}
              placeholder="e.g. Client workshop notes from 20 Aug. Updated integration spec. Resolution of a Jira ticket…" />
          </Field>
          <Field label="Classify this information as" htmlFor="ak-class">
            <select id="ak-class" value={classification} onChange={(e) => setClassification(e.target.value)} className={cn(selectClass, 'w-full')}>
              {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}: {c.hint}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Only Confirmed information can confirm or supersede existing findings. Anything else that contradicts a finding marks it Conflicting for review.</p>
          </Field>
          <Field label="New documents">
            <FileDrop files={files} onChange={setFiles} />
          </Field>
          <Field label="References from documents, Confluence and Jira">
            <ReferencePicker value={references} onChange={setReferences} />
          </Field>
        </div>
      </Panel>
      <div className="flex justify-end">
        <Button disabled={!ai || busy || empty} title={ai ? undefined : noAiTitle} onClick={run}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Analyse and show what changed
        </Button>
      </div>
    </div>
  );
}
