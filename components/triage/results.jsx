'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bug, Clock, ShieldCheck, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, Loading, Panel, Pill, StatCard, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { CATEGORIES, DRAFT_TONE, triageStats } from '@/lib/triage';

export function Results() {
  const queries = useApi('triage/queries');
  const settings = useApi('triage/settings');
  if (queries.isLoading || settings.isLoading) return <Loading />;
  if (queries.error || settings.error) return <ErrorState error={queries.error || settings.error} onRetry={() => { queries.refetch(); settings.refetch(); }} />;
  const list = queries.data.queries;
  const base = settings.data.baseline;
  const s = triageStats(list);
  const drafted = list.filter(q => q.draft);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Target} label="Deflected from developers" value={`${s.rate}%`} sub={`${s.deflected} of ${s.reviewed} approved replies needed no dev work`} className="border-primary" />
        <StatCard icon={ShieldCheck} label="Deflected before (baseline)" value={`${Math.max(0, 100 - base.devShare)}%`} sub="Share support resolved without a developer" />
        <StatCard icon={Clock} label="Time to a drafted answer" value={s.avgSeconds ? `${s.avgSeconds}s` : '–'} sub={`Before: about ${base.hours} hours to first full response`} />
        <StatCard icon={Bug} label="Complete Jira tickets drafted" value={s.toDev} sub={`${s.pending} more waiting on the client or a BA`} />
      </div>

      <Panel title="Outcome of every drafted query">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                {['Query', 'Outcome', 'Sources cited', 'Status'].map(h => <th key={h} className="py-2 px-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {drafted.map(q => (
                <tr key={q.id} className="border-b align-top">
                  <td className="py-2 px-2"><span className="text-muted-foreground">Q{q.number}</span> {q.subject}</td>
                  <td className="py-2 px-2"><Pill tone={CATEGORIES[q.draft.category]?.tone}>{q.draft.category}</Pill></td>
                  <td className="py-2 px-2">{q.draft.refs.join(', ') || '–'}</td>
                  <td className="py-2 px-2"><Pill tone={DRAFT_TONE[q.draft.status]}>{q.draft.status}</Pill></td>
                </tr>
              ))}
              {!drafted.length && <tr><td colSpan={4} className="py-3 px-2 text-muted-foreground">Draft a few replies in the Inbox to see results.</td></tr>}
            </tbody>
          </table>
        </div>
        {drafted.length > 0 && (
          <p className="text-sm text-muted-foreground mt-3">{s.byCategory.map(([c, n]) => `${c}: ${n}`).join(' · ')} · {s.citations} source citations in total</p>
        )}
      </Panel>

      <BaselineForm baseline={base} />
    </div>
  );
}

function BaselineForm({ baseline }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ hours: baseline.hours, devShare: baseline.devShare });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ hours: baseline.hours, devShare: baseline.devShare }); }, [baseline.hours, baseline.devShare]);
  const dirty = Number(form.hours) !== baseline.hours || Number(form.devShare) !== baseline.devShare;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api('triage/settings', { method: 'PUT', body: { hours: Number(form.hours), devShare: Number(form.devShare) } });
      queryClient.setQueryData(['triage/settings'], res);
      toast.success('Baseline saved');
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <Panel title={'"Before" numbers'} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Take these from Jira history, for example the last 3 months of client tickets. They are shared by the whole team.
        {baseline.updatedByName && ` Last set by ${baseline.updatedByName}.`}
      </p>
      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <label htmlFor="bl-hours" className="text-sm font-medium">Average hours to first full response</label>
          <Input id="bl-hours" type="number" min="0" value={form.hours} onChange={(e) => setForm(f => ({ ...f, hours: e.target.value }))} className="mt-1 w-44" />
        </div>
        <div>
          <label htmlFor="bl-dev" className="text-sm font-medium">% of client queries that reached a developer</label>
          <Input id="bl-dev" type="number" min="0" max="100" value={form.devShare} onChange={(e) => setForm(f => ({ ...f, devShare: e.target.value }))} className="mt-1 w-44" />
        </div>
        <Button onClick={save} disabled={!dirty || saving}>Save</Button>
      </div>
    </Panel>
  );
}
