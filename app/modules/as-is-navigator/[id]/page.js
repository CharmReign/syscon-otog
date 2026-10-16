'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BarChart3, Clock, ListChecks, Loader2, PenLine, Pin, Plus, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Confirm } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { SourcesTab } from '@/components/asis/sources-tab';
import { DesignTab } from '@/components/asis/design-tab';
import { FindingsTab, HistoryTab, OpenItemsTab, OverviewTab, SourceDialog } from '@/components/asis/workspace-views';
import { DemoBanner, ModeToggle, useAiMode } from '@/components/asis/shared';
import { api } from '@/lib/api-client';
import { projectStats } from '@/lib/asis';
import { designModel } from '@/lib/asis-design';
import { fmtDateTime } from '@/lib/format';

const TABS = [
  { value: 'sources', label: 'Sources', icon: Upload },
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'findings', label: 'Findings', icon: ListChecks },
  { value: 'open', label: 'Open items', icon: Pin },
  { value: 'design', label: 'TO-BE design', icon: PenLine },
  { value: 'history', label: 'History', icon: Clock },
];

export default function ProjectPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = `asis/projects/${id}`;
  const { data, error, isLoading, refetch } = useApi(key);
  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState(null); // message while a long step runs
  const [source, setSource] = useState(null);
  const [demo, setDemo] = useAiMode(data?.ai);

  if (isLoading) return <Loading />;
  if (error?.status === 404) return <Panel><EmptyState title="Project not found" action={<Button variant="outline" asChild><Link href="/modules/as-is-navigator">All projects</Link></Button>} /></Panel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const p = data.project;
  const active = tab || (p.analysis ? 'overview' : 'sources');
  const canRun = demo || data.ai;
  const stats = projectStats(p);
  const m = designModel(p);

  const store = (project) => {
    queryClient.setQueryData([key], { project, ai: data.ai });
    queryClient.invalidateQueries({ queryKey: ['asis/projects'] });
  };

  // JSON edits. Returns the response, or null after showing the error.
  const mutate = async (path, method, body, success) => {
    try {
      const res = await api(path, { method, body });
      if (res.project) store(res.project);
      if (success) toast.success(success);
      return res;
    } catch (e) {
      toast.error(e.message);
      return null;
    }
  };

  // Long steps (AI calls, documents) keep an overlay up until they finish.
  // fn receives a setter for progress messages. Returns true on success.
  const withBusy = async (message, fn) => {
    setBusy(message);
    try {
      await fn(setBusy);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const analyse = (path, form, message, nextTab, success) => withBusy(message, async () => {
    form.set('demo', demo ? '1' : '0');
    const res = await api(path, { method: 'POST', body: form });
    store(res.project);
    setTab(nextTab);
    toast.success(success);
  });

  const badge = (value) => {
    if (value === 'open' && stats.openItems) return <span className="ml-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 tabular-nums">{stats.openItems}</span>;
    if (value === 'design' && m?.flaggedSteps) return <span className="ml-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-bold px-1.5 tabular-nums">⚑ {m.flaggedSteps}</span>;
    return null;
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/as-is-navigator"><ArrowLeft className="w-4 h-4" /> All projects</Link></Button>
      <PageTitle eyebrow={`AS-IS Navigator · ${p.module || 'Syscon Justice'}`} title={p.name}
        subtitle={`KB v${p.version} · ${stats.sources} source${stats.sources === 1 ? '' : 's'} · updated ${fmtDateTime(p.updatedAt)}${p.notes ? ` · ${p.notes}` : ''}`}
        actions={<>
          <ModeToggle demo={demo} setDemo={setDemo} ai={data.ai} />
          <Button onClick={() => setTab('sources')}><Plus className="w-4 h-4" /> {p.analysis ? 'Add knowledge' : 'Start intake'}</Button>
          <Confirm title={`Delete “${p.name}”?`} description={`This permanently removes the project for everyone, including its ${p.findings.length} findings, ${p.decisions.length} open items, ${p.sources.length} sources, TO-BE design and version history.`} destructive confirmLabel="Delete project"
            onConfirm={() => mutate(key, 'DELETE', undefined, `Deleted “${p.name}”`).then(res => res && router.push('/modules/as-is-navigator'))}>
            <Button variant="ghost" size="icon" aria-label="Delete project"><Trash2 className="w-4 h-4" /></Button>
          </Confirm>
        </>} />

      {demo && <DemoBanner />}

      <div className="relative min-w-0">
        {busy && (
          <div className="absolute inset-0 z-20 rounded-xl bg-background/85 backdrop-blur-sm flex flex-col items-center justify-start pt-24 gap-2 text-center" role="status">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <div className="font-medium">{busy}</div>
            <div className="text-xs text-muted-foreground">This usually takes 15 seconds to two minutes. Keep this page open.</div>
          </div>
        )}
        <Tabs value={active} onValueChange={setTab}>
          <TabsList className="mb-4 h-auto flex-wrap justify-start">
            {TABS.map(t => <TabsTrigger key={t.value} value={t.value}><t.icon className="w-4 h-4 mr-1.5" /> {t.label}{badge(t.value)}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="sources">
            <SourcesTab project={p} canRun={canRun} busy={Boolean(busy)} onOpenSource={setSource} onGoToDesign={() => setTab('design')}
              onSaveIntake={(body) => mutate(key, 'PATCH', body, 'Intake saved')}
              onBaseline={(form) => analyse(`${key}/analyse`, form, 'Building the AS-IS baseline…', 'overview', 'AS-IS baseline created')}
              onAddKnowledge={(form) => analyse(`${key}/knowledge`, form, 'Comparing with the knowledge base…', 'history', 'Knowledge base updated. Review what changed.')} />
          </TabsContent>
          <TabsContent value="overview"><OverviewTab project={p} onTab={setTab} /></TabsContent>
          <TabsContent value="findings"><FindingsTab project={p} mutate={mutate} base={key} /></TabsContent>
          <TabsContent value="open"><OpenItemsTab project={p} mutate={mutate} base={key} onTab={setTab} /></TabsContent>
          <TabsContent value="design">
            <DesignTab project={p} base={key} demo={demo} canRun={canRun} busy={Boolean(busy)} withBusy={withBusy} mutate={mutate} store={store} onTab={setTab} />
          </TabsContent>
          <TabsContent value="history"><HistoryTab key={p.version} project={p} /></TabsContent>
        </Tabs>
      </div>
      {source && <SourceDialog project={p} source={source} onClose={() => setSource(null)} />}
    </div>
  );
}
