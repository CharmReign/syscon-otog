'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, Lock, Plus, Trash2, Unlock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Confirm } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, Pill, ProgressBar, StatCard, StatusPill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { CHECK_STATUS, CHECK_STATUS_LABELS, READINESS_LABELS } from '@/lib/releases';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_STYLE = {
  PASS: 'border-success bg-success/15 text-success',
  FAIL: 'border-destructive bg-destructive/15 text-destructive',
  BLOCKED: 'border-warning bg-warning/15 text-warning',
  PENDING: 'border-primary bg-primary/10 text-primary',
};

export default function ReleasePage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = `releases/${id}`;
  const { data, error, isLoading, refetch } = useApi(key);
  const [newCheck, setNewCheck] = useState({ title: '', critical: false });

  if (isLoading) return <Loading />;
  if (error?.status === 404) return <Panel><EmptyState title="Release not found" /></Panel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const r = data.release;
  const s = r.summary;
  const closed = r.status === 'CLOSED';

  const mutate = async (path, method, body, success) => {
    try {
      const res = await api(path, { method, body });
      if (res.release) queryClient.setQueryData([key], { release: res.release });
      queryClient.invalidateQueries({ queryKey: ['releases'] });
      if (success) toast.success(success);
      return res;
    } catch (e) {
      toast.error(e.message);
      return null;
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/release-health"><ArrowLeft className="w-4 h-4" /> Releases</Link></Button>
      <PageTitle title={`${r.name}${r.version ? ` · ${r.version}` : ''}`}
        subtitle={`${r.targetDate ? `Target ${fmtDate(r.targetDate)} · ` : ''}Created by ${r.createdByName}${r.notes ? ` · ${r.notes}` : ''}`}
        actions={<>
          <StatusPill status={s.readiness} label={READINESS_LABELS[s.readiness]} />
          <Button variant="outline" onClick={() => mutate(key, 'PATCH', { status: closed ? 'OPEN' : 'CLOSED' }, closed ? 'Release reopened' : 'Release closed')}>
            {closed ? <><Unlock className="w-4 h-4" /> Reopen</> : <><Lock className="w-4 h-4" /> Close release</>}
          </Button>
          <Confirm title="Delete this release?" description="Its checks and findings will be removed." destructive confirmLabel="Delete"
            onConfirm={() => mutate(key, 'DELETE').then(res => res && router.push('/modules/release-health'))}>
            <Button variant="ghost" size="icon" aria-label="Delete release"><Trash2 className="w-4 h-4" /></Button>
          </Confirm>
        </>} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard label="Done" value={`${s.percentDone}%`} sub={`${s.total} checks`} />
        <StatCard label="Pass" value={s.counts.PASS} />
        <StatCard label="Fail" value={s.counts.FAIL} />
        <StatCard label="Blocked" value={s.counts.BLOCKED} />
        <StatCard label="Pending" value={s.outstanding} />
      </div>
      <ProgressBar value={s.percentDone} label="Checks completed" />

      {s.risks.length > 0 && (
        <Panel title="Risks" className="border-destructive/40">
          <ul className="space-y-1.5 text-sm">
            {s.risks.map(x => (
              <li key={x.id} className="flex items-center gap-2"><AlertTriangle className={cn('w-4 h-4', x.critical ? 'text-destructive' : 'text-warning')} /> <a href={`#${x.id}`} className="hover:text-primary">{x.title}</a> <StatusPill status={x.status} />{x.critical && <Pill tone="red">Critical</Pill>}</li>
            ))}
          </ul>
        </Panel>
      )}
      {r.jiraKeys.length > 0 && <p className="text-sm text-muted-foreground">Related Jira issues: {r.jiraKeys.join(', ')}</p>}
      {closed && <p className="rounded-lg bg-muted px-3 py-2 text-sm">This release is closed. Reopen it to record more results.</p>}

      <div className="space-y-3">
        {r.checks.length === 0 && <Panel><EmptyState title="No checks yet" body="Add the checks this release needs below." /></Panel>}
        {r.checks.map(c => <CheckRow key={c.id} check={c} disabled={closed} onSave={(body, msg) => mutate(`releases/${id}/checks/${c.id}`, 'PATCH', body, msg)}
          onRemove={() => mutate(`releases/${id}/checks/${c.id}`, 'DELETE', undefined, 'Check removed')} />)}
      </div>

      {!closed && (
        <Panel title="Add a check">
          <form className="flex flex-col sm:flex-row gap-2 sm:items-center" onSubmit={async (e) => {
            e.preventDefault();
            if (await mutate(`releases/${id}/checks`, 'POST', newCheck, 'Check added')) setNewCheck({ title: '', critical: false });
          }}>
            <Input value={newCheck.title} onChange={(e) => setNewCheck({ ...newCheck, title: e.target.value })} placeholder="What needs verifying?" aria-label="New check" maxLength={200} />
            <label className="flex items-center gap-2 text-sm whitespace-nowrap"><Switch checked={newCheck.critical} onCheckedChange={(v) => setNewCheck({ ...newCheck, critical: v })} aria-label="Critical" /> Critical</label>
            <Button type="submit" disabled={!newCheck.title.trim()}><Plus className="w-4 h-4" /> Add</Button>
          </form>
        </Panel>
      )}
    </div>
  );
}

function CheckRow({ check, disabled, onSave, onRemove }) {
  const [comment, setComment] = useState(check.comment);
  const [jira, setJira] = useState(check.jiraKeys.join(', '));
  const [link, setLink] = useState({ title: '', url: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setComment(check.comment); setJira(check.jiraKeys.join(', ')); }, [check.comment, check.jiraKeys]);
  const dirty = comment !== check.comment || jira !== check.jiraKeys.join(', ');

  const save = async (body, msg) => { setSaving(true); await onSave(body, msg); setSaving(false); };

  return (
    <Panel id={check.id} className="scroll-mt-20">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{check.title}</span>
            {check.critical && <Pill tone="red">Critical</Pill>}
          </div>
          {check.description && <p className="text-sm text-muted-foreground">{check.description}</p>}
          {check.updatedAt && <p className="text-xs text-muted-foreground mt-1">Last updated {fmtDateTime(check.updatedAt)} by {check.updatedByName}</p>}
        </div>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label={`Result for ${check.title}`}>
          {CHECK_STATUS.map(st => (
            <button key={st} type="button" disabled={disabled || saving} aria-pressed={check.status === st} onClick={() => check.status !== st && save({ status: st })}
              className={cn('px-3 h-8 rounded-md border text-xs font-semibold transition-colors disabled:opacity-60', check.status === st ? STATUS_STYLE[st] : 'text-muted-foreground hover:border-primary/50')}>
              {CHECK_STATUS_LABELS[st]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_260px] mt-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`c-${check.id}`}>Findings / comments</label>
          <Textarea id={`c-${check.id}`} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={disabled} maxLength={2000} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`j-${check.id}`}>Jira issues</label>
          <Input id={`j-${check.id}`} value={jira} onChange={(e) => setJira(e.target.value)} disabled={disabled} placeholder="SUP-12, REL-4" className="mt-1" />
          {check.jiraLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
              {check.jiraLinks.map(l => l.url
                ? <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 font-mono">{l.key} <ExternalLink className="w-3 h-3" /></a>
                : <span key={l.key} className="font-mono">{l.key}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-muted-foreground mb-1">Supporting documentation</div>
        {check.links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
            {check.links.map((l, i) => (
              <li key={i} className="inline-flex items-center gap-1">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{l.title} <ExternalLink className="w-3 h-3" /></a>
                {!disabled && <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Remove link ${l.title}`} onClick={() => save({ links: check.links.filter((_, j) => j !== i) }, 'Link removed')}>×</button>}
              </li>
            ))}
          </ul>
        )}
        {!disabled && (
          <form className="flex flex-col sm:flex-row gap-2" onSubmit={async (e) => { e.preventDefault(); await save({ links: [...check.links, link] }, 'Link added'); setLink({ title: '', url: '' }); }}>
            <Input value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder="Link title" aria-label="Link title" className="sm:w-48" maxLength={150} />
            <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" aria-label="Link URL" type="url" />
            <Button type="submit" variant="outline" disabled={!link.url.trim() || saving}>Add link</Button>
          </form>
        )}
      </div>

      {!disabled && (
        <div className="flex gap-2 mt-3 justify-end">
          <Confirm title="Remove this check?" destructive confirmLabel="Remove" onConfirm={onRemove}><Button variant="ghost" size="sm">Remove check</Button></Confirm>
          <Button size="sm" disabled={!dirty || saving} onClick={() => save({ comment, jiraKeys: jira }, 'Saved')}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save notes</Button>
        </div>
      )}
    </Panel>
  );
}
