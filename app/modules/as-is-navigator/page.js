'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Compass, FolderKanban, Loader2, PenLine, Plus, Search, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { KnowledgeSearch } from '@/components/asis/knowledge-search';
import { DemoBanner, LimitedInput, LimitedTextarea, ModeToggle, useAiMode } from '@/components/asis/shared';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { LIMITS } from '@/lib/asis';
import { fmtDate } from '@/lib/format';

export default function NavigatorPage() {
  return <Suspense fallback={<Loading />}><Navigator /></Suspense>;
}

// AS-IS Navigator: how systems work today, and how they should work. Each project builds a
// versioned AS-IS knowledge base and its TO-BE design; Search looks across documents,
// Confluence and Jira in one go.
function Navigator() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') || '';
  const tab = params.get('tab') || (q ? 'search' : 'projects');
  const [creating, setCreating] = useState(false);
  const projects = useApi('asis/projects');
  const [demo, setDemo] = useAiMode(projects.data?.ai);

  return (
    <div>
      <PageTitle eyebrow="Internal module" title="AS-IS Navigator"
        subtitle="Build a versioned AS-IS knowledge base for each analysis project, then turn it into a TO-BE process design and a Word document. Nothing is treated as confirmed without review."
        actions={<>
          {projects.data && <ModeToggle demo={demo} setDemo={setDemo} ai={projects.data.ai} />}
          {isAdmin(user) && <Button variant="outline" asChild><Link href="/modules/level-up/manage?upload=1"><Upload className="w-4 h-4" /> Add documentation</Link></Button>}
          <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New project</Button>
        </>} />

      <Tabs value={tab} onValueChange={(v) => router.replace(`/modules/as-is-navigator?tab=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`)}>
        <TabsList className="mb-4">
          <TabsTrigger value="projects"><FolderKanban className="w-4 h-4 mr-1.5" /> Analysis projects</TabsTrigger>
          <TabsTrigger value="search"><Search className="w-4 h-4 mr-1.5" /> Search knowledge</TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          {demo && projects.data && <div className="mb-4"><DemoBanner /></div>}
          <ProjectList query={projects} onCreate={() => setCreating(true)} />
        </TabsContent>
        <TabsContent value="search"><KnowledgeSearch q={q} /></TabsContent>
      </Tabs>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectList({ query: { data, error, isLoading, refetch }, onCreate }) {
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (data.projects.length === 0) {
    return (
      <Panel>
        <EmptyState icon={Compass} title="No analysis projects yet"
          body="Create a project for each process or module you're analysing. It keeps a versioned knowledge base (sources, findings, decisions, questions and what changed with each update) and the TO-BE design built from it."
          action={<Button size="sm" onClick={onCreate}><Plus className="w-4 h-4" /> New project</Button>} />
      </Panel>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.projects.map(p => (
        <Link key={p.id} href={`/modules/as-is-navigator/${p.id}`} className="rounded-xl border bg-card p-5 hover:border-primary/60 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.module || 'No module set'} · {p.createdByName}</div>
            </div>
            <span className="text-[11px] font-semibold rounded-md bg-primary/10 text-primary px-2 py-0.5 shrink-0">KB v{p.version}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4 text-center">
            {[['Sources', p.sourceCount, 'text-primary'], ['Confirmed', p.findingCounts.CONFIRMED, 'text-success'], ['Pending', p.findingCounts.PENDING, 'text-warning'], ['Open items', p.openItems, 'text-primary']].map(([label, n, color]) => (
              <div key={label} className="rounded-lg bg-muted/60 py-2">
                <div className={`text-lg font-bold tabular-nums ${color}`}>{n}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2 text-xs text-muted-foreground mt-3">
            <span className="inline-flex items-center gap-1">{!p.analysed ? 'No baseline yet' : p.designed ? <><PenLine className="w-3 h-3" /> TO-BE design drafted</> : 'AS-IS baseline ready'}</span>
            <span>Updated {fmtDate(p.updatedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function NewProjectDialog({ onClose }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', module: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { project } = await api('asis/projects', { method: 'POST', body: form });
      queryClient.invalidateQueries({ queryKey: ['asis/projects'] });
      router.push(`/modules/as-is-navigator/${project.id}`);
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New AS-IS analysis project</DialogTitle>
            <DialogDescription>Each project keeps its own knowledge base that grows as you add sources.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium" htmlFor="np-name">Project name</label>
            <LimitedInput id="np-name" limit={LIMITS.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Warrant integration, Parole processing improvement" autoFocus wrapClassName="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="np-module">OMS module / process</label>
            <LimitedInput id="np-module" limit={LIMITS.module} value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} placeholder="e.g. Sentence management, Parole, Risk assessment" wrapClassName="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="np-notes">Notes</label>
            <div className="mt-1"><LimitedTextarea id="np-notes" limit={LIMITS.notes} compact value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim() || saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
