'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BarChart3, ClipboardList, GitCompare, ListChecks, Loader2, Pin, PlusCircle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Confirm } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { AddKnowledgeTab, IntakeTab } from '@/components/asis/workspace-forms';
import { ChangesTab, DashboardTab, DecisionsTab, FindingsTab, ProjectSidebar } from '@/components/asis/workspace-views';
import { api } from '@/lib/api-client';

const TABS = [
  { value: 'intake', label: 'Intake', icon: ClipboardList },
  { value: 'add', label: 'Add knowledge', icon: PlusCircle },
  { value: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { value: 'findings', label: 'Findings', icon: ListChecks },
  { value: 'decisions', label: 'Decisions', icon: Pin },
  { value: 'changes', label: 'What changed?', icon: GitCompare },
];

export default function ProjectPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = `asis/projects/${id}`;
  const { data, error, isLoading, refetch } = useApi(key);
  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState(null); // message while an analysis runs

  if (isLoading) return <Loading />;
  if (error?.status === 404) return <Panel><EmptyState title="Project not found" action={<Button variant="outline" asChild><Link href="/modules/as-is-navigator">All projects</Link></Button>} /></Panel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const p = data.project;
  const active = tab || (p.analysis ? 'dashboard' : 'intake');

  const store = (project) => {
    queryClient.setQueryData([key], { project, ai: data.ai });
    queryClient.invalidateQueries({ queryKey: ['asis/projects'] });
  };

  // JSON edits (findings, decisions, project fields). Returns the response or null.
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

  // Long-running AI requests (multipart). Keeps the overlay up until they finish.
  const analyse = async (path, form, message, nextTab, success) => {
    setBusy(message);
    try {
      const res = await api(path, { method: 'POST', body: form });
      store(res.project);
      setTab(nextTab);
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/as-is-navigator"><ArrowLeft className="w-4 h-4" /> All projects</Link></Button>
      <PageTitle eyebrow={`AS-IS analysis · KB v${p.version}`} title={p.name}
        subtitle={[p.module, `Created by ${p.createdByName}`, p.notes].filter(Boolean).join(' · ')}
        actions={
          <Confirm title="Delete this project?" description="Its sources, findings, decisions and history will be removed." destructive confirmLabel="Delete"
            onConfirm={() => mutate(key, 'DELETE').then(res => res && router.push('/modules/as-is-navigator'))}>
            <Button variant="ghost" size="icon" aria-label="Delete project"><Trash2 className="w-4 h-4" /></Button>
          </Confirm>
        } />

      {!data.ai && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">AI analysis is switched off on this server (no Claude API key). You can record findings and decisions by hand; ask an administrator to set <code className="text-xs">ANTHROPIC_API_KEY</code> to enable analysis.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
        <ProjectSidebar project={p} onAddKnowledge={() => setTab('add')} />

        <div className="relative min-w-0">
          {busy && (
            <div className="absolute inset-0 z-20 rounded-xl bg-background/85 backdrop-blur-sm flex flex-col items-center justify-start pt-24 gap-2 text-center" role="status">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="font-medium">{busy}</div>
              <div className="text-xs text-muted-foreground">This usually takes 30 seconds to two minutes. Keep this page open.</div>
            </div>
          )}
          <Tabs value={active} onValueChange={setTab}>
            <TabsList className="mb-4 h-auto flex-wrap justify-start">
              {TABS.map(t => <TabsTrigger key={t.value} value={t.value}><t.icon className="w-4 h-4 mr-1.5" /> {t.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="intake">
              <IntakeTab project={p} ai={data.ai} busy={Boolean(busy)}
                onSaveIntake={(body) => mutate(key, 'PATCH', body, 'Intake saved')}
                onRun={(form) => analyse(`${key}/analyse`, form, 'Analysing the current state…', 'dashboard', 'AS-IS analysis complete')} />
            </TabsContent>
            <TabsContent value="add">
              <AddKnowledgeTab project={p} ai={data.ai} busy={Boolean(busy)} onGoToIntake={() => setTab('intake')}
                onRun={(form) => analyse(`${key}/knowledge`, form, 'Comparing with the knowledge base…', 'changes', 'Knowledge base updated. Review what changed.')} />
            </TabsContent>
            <TabsContent value="dashboard"><DashboardTab project={p} onGoToIntake={() => setTab('intake')} /></TabsContent>
            <TabsContent value="findings"><FindingsTab project={p} mutate={mutate} base={key} /></TabsContent>
            <TabsContent value="decisions"><DecisionsTab project={p} mutate={mutate} base={key} /></TabsContent>
            <TabsContent value="changes"><ChangesTab project={p} onAddKnowledge={() => setTab('add')} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
