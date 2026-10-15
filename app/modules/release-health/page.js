'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Plus, ShieldCheck, Trash2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/auth-provider';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, Pill, ProgressBar, StatusPill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { READINESS_LABELS } from '@/lib/releases';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ReleaseHealthPage() {
  const { user } = useAuth();
  const releases = useApi('releases');
  const templates = useApi('releases/templates');
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageTitle eyebrow="Internal module" title="Release Sanity Health Check"
        subtitle="Run sanity checks for each release from a configurable checklist, record findings and linked Jira issues, and see what is outstanding or at risk."
        actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New release</Button>} />

      <Tabs defaultValue="releases">
        <TabsList className="mb-4">
          <TabsTrigger value="releases"><ShieldCheck className="w-4 h-4 mr-1.5" /> Releases</TabsTrigger>
          <TabsTrigger value="templates"><ClipboardList className="w-4 h-4 mr-1.5" /> Checklist templates</TabsTrigger>
        </TabsList>
        <TabsContent value="releases">
          {releases.isLoading ? <Loading /> : releases.error ? <ErrorState error={releases.error} onRetry={releases.refetch} /> : releases.data.releases.length === 0 ? (
            <Panel><EmptyState icon={ShieldCheck} title="No releases yet" body="Create a release, pick a checklist template, and record each sanity check as it's verified." action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New release</Button>} /></Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {releases.data.releases.map(r => (
                <Link key={r.id} href={`/modules/release-health/${r.id}`} className="rounded-xl border bg-card p-5 hover:border-primary/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.name}{r.version && <span className="text-muted-foreground font-normal"> · {r.version}</span>}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.targetDate ? `Target ${fmtDate(r.targetDate)}` : 'No target date'} · {r.createdByName}</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {r.status === 'CLOSED' && <StatusPill status="CLOSED" />}
                      <StatusPill status={r.summary.readiness} label={READINESS_LABELS[r.summary.readiness]} />
                    </div>
                  </div>
                  <ProgressBar value={r.summary.percentDone} className="mt-4" label="Checks completed" />
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="text-success">{r.summary.counts.PASS} pass</span>
                    <span className="text-destructive">{r.summary.counts.FAIL} fail</span>
                    <span className="text-warning">{r.summary.counts.BLOCKED} blocked</span>
                    <span>{r.summary.outstanding} pending</span>
                    {r.summary.criticalOpen > 0 && <span className="font-semibold text-destructive">{r.summary.criticalOpen} critical open</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab admin={isAdmin(user)} templates={templates} />
        </TabsContent>
      </Tabs>

      {creating && <NewReleaseDialog templates={templates.data?.templates || []} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewReleaseDialog({ templates, onClose }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', version: '', targetDate: '', templateId: templates[0]?.id || '', jiraKeys: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { release } = await api('releases', { method: 'POST', body: { ...form, templateId: form.templateId || undefined } });
      queryClient.invalidateQueries({ queryKey: ['releases'] });
      router.push(`/modules/release-health/${release.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New release</DialogTitle>
          <DialogDescription>Checks are copied from the template, so later template changes won't alter this release.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="text-sm font-medium" htmlFor="r-name">Release name</label><Input id="r-name" value={form.name} onChange={set('name')} maxLength={120} className="mt-1" placeholder="e.g. October client release" /></div>
          <div><label className="text-sm font-medium" htmlFor="r-ver">Version</label><Input id="r-ver" value={form.version} onChange={set('version')} maxLength={50} className="mt-1" placeholder="e.g. 26.10.1" /></div>
          <div><label className="text-sm font-medium" htmlFor="r-date">Target date</label><Input id="r-date" type="date" value={form.targetDate} onChange={set('targetDate')} className="mt-1" /></div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="r-tpl">Checklist template</label>
            <select id="r-tpl" value={form.templateId} onChange={set('templateId')} className={cn(selectClass, 'mt-1 w-full')}>
              <option value="">No template (add checks yourself)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length} checks)</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="text-sm font-medium" htmlFor="r-jira">Related Jira issues <span className="text-muted-foreground font-normal">(optional, comma-separated)</span></label><Input id="r-jira" value={form.jiraKeys} onChange={set('jiraKeys')} className="mt-1" placeholder="REL-42, SUP-118" /></div>
          <div className="sm:col-span-2"><label className="text-sm font-medium" htmlFor="r-notes">Notes</label><Textarea id="r-notes" value={form.notes} onChange={set('notes')} rows={2} maxLength={2000} className="mt-1" /></div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || !form.name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Create release</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab({ admin, templates }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // template or {} for new
  const remove = async (t) => {
    try {
      await api(`releases/templates/${t.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['releases/templates'] });
      toast.success('Template deleted');
    } catch (e) { toast.error(e.message); }
  };

  if (templates.isLoading) return <Loading />;
  if (templates.error) return <ErrorState error={templates.error} onRetry={templates.refetch} />;
  const list = templates.data.templates;
  return (
    <div className="space-y-3">
      {admin && <Button variant="outline" onClick={() => setEditing({})}><Plus className="w-4 h-4" /> New template</Button>}
      {list.length === 0 ? (
        <Panel><EmptyState icon={ClipboardList} title="No checklist templates" body={admin ? 'Define the checks your release process needs. Each release copies them from a template.' : 'An administrator defines the checklist templates releases are created from.'} /></Panel>
      ) : list.map(t => (
        <Panel key={t.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t.name}</div>
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              <div className="text-xs text-muted-foreground mt-1">{t.items.length} checks · updated {fmtDate(t.updatedAt)} by {t.updatedByName}</div>
            </div>
            {admin && (
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="w-4 h-4" /></Button>
                <Confirm title={`Delete “${t.name}”?`} description="Existing releases keep their checks." destructive confirmLabel="Delete" onConfirm={() => remove(t)}>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`}><Trash2 className="w-4 h-4" /></Button>
                </Confirm>
              </div>
            )}
          </div>
          <ol className="mt-3 space-y-1 text-sm list-decimal list-inside">
            {t.items.map(i => <li key={i.id}>{i.title} {i.critical && <Pill tone="red" className="ml-1">Critical</Pill>}</li>)}
          </ol>
        </Panel>
      ))}
      {editing && <TemplateDialog template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateDialog({ template, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name || '');
  const [description, setDescription] = useState(template.description || '');
  const [items, setItems] = useState(template.items?.length ? template.items : [{ title: '', description: '', critical: false }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { name, description, items: items.filter(i => i.title.trim()) };
      await api(template.id ? `releases/templates/${template.id}` : 'releases/templates', { method: template.id ? 'PUT' : 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['releases/templates'] });
      toast.success('Template saved');
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.id ? 'Edit template' : 'New checklist template'}</DialogTitle>
          <DialogDescription>Mark checks as critical if a failure should put the release at risk.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><label className="text-sm font-medium" htmlFor="t-name">Name</label><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1" /></div>
          <div><label className="text-sm font-medium" htmlFor="t-desc">Description</label><Input id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1" /></div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Checks</div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                <Input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="What to verify" aria-label={`Check ${i + 1}`} maxLength={200} />
                <label className="flex items-center gap-1.5 text-xs whitespace-nowrap"><Switch checked={it.critical} onCheckedChange={(v) => setItem(i, { critical: v })} aria-label={`Check ${i + 1} is critical`} /> Critical</label>
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label={`Remove check ${i + 1}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setItems([...items, { title: '', description: '', critical: false }])}><Plus className="w-3.5 h-3.5" /> Add check</Button>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim() || !items.some(i => i.title.trim())}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
