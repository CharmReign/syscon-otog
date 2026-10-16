'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCopy, Download, ExternalLink, Inbox as InboxIcon, Loader2, Paperclip, RotateCcw, Send, Sparkles, Trash2, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/components/auth/auth-provider';
import { Confirm } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, Panel, Pill, useApi } from '@/components/otog/ui';
import { MediaDrop, StoredMedia, appendAttachments, isMedia, preparedCount } from '@/components/triage/attachments';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { CATEGORIES, DRAFT_TONE, HOLDING, LIMITS, REF_TONE, attachmentNames, attachmentSummary, jiraCsv, jiraText } from '@/lib/triage';
import { cn } from '@/lib/utils';

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CategoryPill = ({ category }) => <Pill tone={CATEGORIES[category]?.tone || 'gray'}>{category}</Pill>;
const RefLink = ({ r }) => (r.url ? <a href={r.url} target={r.url.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a> : null);

// List on the left, the selected query on the right.
export function Inbox({ selected, onSelect, onPaste }) {
  const { data, error, isLoading, refetch } = useApi('triage/queries');
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const queries = data.queries;
  if (!queries.length) {
    return (
      <Panel>
        <EmptyState icon={InboxIcon} title="No client queries yet"
          body="Paste a client email or chat, with any screenshots or videos they sent. You'll get a cited reply with steps to unblock them, and a Jira ticket draft if it's a new defect."
          action={<Button size="sm" onClick={onPaste}>Paste a query</Button>} />
      </Panel>
    );
  }
  const current = queries.find(q => q.id === selected) || queries[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] items-start">
      <Panel className="p-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground px-1">Client queries</div>
        {!data.ai && <p className="rounded-md bg-muted px-2 py-1.5 text-xs flex gap-1.5"><Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />AI drafting is off on this server. References are still found for every query.</p>}
        {queries.map(q => {
          const active = q.id === current.id;
          return (
            <button key={q.id} type="button" onClick={() => onSelect(q.id)}
              className={cn('w-full text-left rounded-lg border px-3 py-2.5 flex flex-col gap-1 transition-colors', active ? 'border-primary bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'bg-muted/30 hover:border-primary/50')}>
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>Q{q.number} · {q.channel} · {timeAgo(q.receivedAt)}</span>
                {q.draft ? <Pill tone={DRAFT_TONE[q.draft.status]}>{q.draft.status}</Pill> : <span>New</span>}
              </div>
              <div className="font-semibold text-sm">{q.subject}</div>
              {q.attachments.length > 0 && <div className="text-xs text-primary flex items-center gap-1"><Paperclip className="w-3 h-3" />{attachmentSummary(q.attachments)}</div>}
              <div className="text-xs text-muted-foreground truncate">{q.from}</div>
              {q.draft && <span><CategoryPill category={q.draft.category} /></span>}
            </button>
          );
        })}
      </Panel>
      <QueryDetail key={current.id} id={current.id} onDeleted={() => onSelect(null)} />
    </div>
  );
}

function QueryDetail({ id, onDeleted }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = `triage/queries/${id}`;
  const { data, error, isLoading, refetch } = useApi(key);
  const [busy, setBusy] = useState(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const q = data.query;
  const d = q.draft;

  const store = (query) => {
    queryClient.setQueryData([key], { ...data, query });
    queryClient.invalidateQueries({ queryKey: ['triage/queries'] });
  };

  const run = async (message, fn, success) => {
    setBusy(message);
    try {
      const res = await fn();
      if (res?.query) store(res.query);
      if (success) toast.success(success);
      return res;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const draft = () => run('Searching Jira, Confluence and documents, then drafting the reply…', () => api(`${key}/draft`, { method: 'POST' }), d ? 'Reply redrafted' : 'Reply drafted');

  const addMedia = async (files) => {
    const media = files.filter(isMedia);
    if (!media.length) return toast.error('Only images and videos can be attached.');
    if (q.attachments.length + preparedCount(media) > LIMITS.attachments) return toast.error(`A query can have at most ${LIMITS.attachments} images (each video counts as ${LIMITS.videoFrames}).`);
    await run('Preparing and uploading…', async () => api(`${key}/attachments`, { method: 'POST', body: await appendAttachments(new FormData(), media) }),
      d ? 'Attached. Redraft to include it.' : 'Attached.');
    queryClient.invalidateQueries({ queryKey: [`${key}/references`] });
  };

  return (
    <div className="space-y-5 min-w-0 relative">
      {busy && (
        <div className="absolute inset-0 z-20 rounded-xl bg-background/85 backdrop-blur-sm flex flex-col items-center justify-start pt-24 gap-2 text-center" role="status">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <div className="font-medium">{busy}</div>
        </div>
      )}
      <Panel className="space-y-4">
        <div className="flex justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Q{q.number} · {q.channel} · {q.from} · {fmtDateTime(q.receivedAt)} · added by {q.createdByName}</div>
            <h2 className="text-xl font-semibold text-primary mt-1">{q.subject}</h2>
          </div>
          <div className="flex gap-2 items-start">
            <Button onClick={draft} disabled={Boolean(busy)}><Wand2 className="w-4 h-4" /> {d ? 'Redraft reply' : 'Draft reply'}</Button>
            {(isAdmin(user) || q.createdById === user?.id) && (
              <Confirm title="Delete this query?" description="The message, attachments and drafted reply will be removed." destructive confirmLabel="Delete"
                onConfirm={() => run('Deleting…', () => api(key, { method: 'DELETE' })).then(res => {
                  if (!res) return;
                  queryClient.invalidateQueries({ queryKey: ['triage/queries'] });
                  onDeleted();
                })}>
                <Button variant="ghost" size="icon" aria-label="Delete query"><Trash2 className="w-4 h-4" /></Button>
              </Confirm>
            )}
          </div>
        </div>
        {q.body && <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap">{q.body}</div>}
        <div className="flex flex-wrap gap-2.5">
          <StoredMedia queryId={q.id} attachments={q.attachments}
            onRemove={(aid) => run('Removing…', () => api(`${key}/attachments/${aid}`, { method: 'DELETE' }))} />
          <MediaDrop onAdd={addMedia} label={q.attachments.length ? 'Add more' : undefined} />
        </div>
        {d ? <MatchList matches={d.matches} notes={d.searchNotes} caption="References found when this reply was drafted (Claude saw only these, plus any attachments):" />
          : <ReferencePreview id={q.id} />}
      </Panel>
      {d && <DraftCard q={q} d={d} onPatch={(body, success) => run(null, () => api(key, { method: 'PATCH', body }), success)} />}
    </div>
  );
}

function ReferencePreview({ id }) {
  const { data, error, isLoading, isFetching, refetch } = useApi(`triage/queries/${id}/references`, { staleTime: 5 * 60 * 1000 });
  if (isLoading) return <Loading label="Finding the closest references…" className="py-4" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <div className="space-y-2">
      <MatchList matches={data.matches} notes={data.notes} caption="Closest references (Claude will see only these, plus any attachments):" />
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RotateCcw className="w-3.5 h-3.5" /> {isFetching ? 'Searching…' : 'Search again'}</Button>
    </div>
  );
}

function MatchList({ matches, notes = [], caption }) {
  return (
    <div className="space-y-2">
      {matches.length ? (
        <>
          <div className="text-xs text-muted-foreground">{caption}</div>
          <div className="flex flex-wrap gap-1.5">
            {matches.map(m => (
              <span key={m.id} title={`${m.title}\nMatched: ${m.hits.join(', ')}`} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 pl-1 pr-3 py-0.5 text-xs">
                <Pill tone={REF_TONE[m.type]}>{m.type}</Pill>
                <b>{m.id}</b>{m.live && <span className="text-success font-semibold">live</span>}
                <span className="text-muted-foreground max-w-[220px] truncate">{m.title}</span>
              </span>
            ))}
          </div>
        </>
      ) : <p className="text-sm text-warning">No reference matches this query yet. Drafting will give a holding reply.</p>}
      {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.join(' ')}</p>}
    </div>
  );
}

function DraftCard({ q, d, onPatch }) {
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState(d.reply);
  useEffect(() => { setReply(d.reply); }, [d.reply, d.draftedAt]);
  const dirty = reply !== d.reply;
  const holding = d.category === HOLDING;

  const approve = async () => {
    const res = await onPatch({ ...(dirty ? { reply } : {}), status: 'Approved' });
    if (!res) return;
    toast.success((await copy(reply)) ? 'Approved and copied. Paste it into your email or chat.' : 'Approved. Copy the reply from the box.');
  };

  return (
    <Panel className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <CategoryPill category={d.category} />
        <Pill>Confidence: {d.confidence}</Pill>
        <Pill tone="cyan">{d.module}</Pill>
        <span className="text-xs text-muted-foreground ml-auto">
          {d.source === 'Claude' ? 'Drafted by Claude' : 'No AI call (nothing matched)'}{d.imagesSent ? ` · ${d.imagesSent} image${d.imagesSent === 1 ? '' : 's'} read` : ''} · {d.draftSeconds}s · {d.draftedByName}, {timeAgo(d.draftedAt)}
        </span>
      </div>

      {holding ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <b className="text-warning">No approved source covers this.</b> A holding reply is drafted below. Ask the <b>{d.escalate}</b>, then add the answer to Knowledge sources so next time it's answered straight away.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="text-sm space-y-3">
            <Section label="Answer"><p>{d.answer}</p></Section>
            {d.steps.length > 0 && <Section label="Steps to unblock"><ol className="list-decimal pl-5 space-y-1">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></Section>}
            <Section label="Resolution"><p>{d.resolution}</p></Section>
          </div>
          <Section label="Sources cited">
            <div className="space-y-1.5 mt-1">
              {d.citedRefs.map(r => (
                <div key={r.id} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex gap-1.5 items-center flex-wrap text-left">
                    <Pill tone={REF_TONE[r.type]}>{r.type}</Pill><b>{r.id}</b><span>{r.title}</span>
                  </button>
                  {open === r.id && <p className="mt-1.5 text-muted-foreground text-xs">{r.text} <RefLink r={r} /></p>}
                </div>
              ))}
              {!d.citedRefs.length && <span className="text-sm text-muted-foreground">None</span>}
            </div>
          </Section>
        </div>
      )}

      {d.note && <div className="rounded-lg bg-primary/10 px-4 py-2.5 text-sm"><b className="text-primary">Note for the agent:</b> {d.note}</div>}

      {d.jira && <JiraDraft q={q} d={d} />}

      <div>
        <label htmlFor="reply" className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Reply to client (edit before sending)</label>
        <Textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={12} className="mt-1.5" maxLength={20000} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Button onClick={approve} disabled={!reply.trim()}><ClipboardCopy className="w-4 h-4" /> Approve and copy reply</Button>
        {dirty && <Button variant="outline" onClick={() => onPatch({ reply }, 'Edits saved')}>Save edits</Button>}
        <Button variant="outline" disabled={d.status === 'Sent' || dirty} onClick={() => onPatch({ status: 'Sent' }, 'Marked as sent')}><Send className="w-4 h-4" /> Mark as sent</Button>
        <span className="text-sm text-muted-foreground">
          Status: <b className="text-foreground">{d.status}</b>
          {d.status === 'Approved' && d.approvedByName && ` by ${d.approvedByName}`}
          {d.status === 'Sent' && d.sentByName && ` by ${d.sentByName}, ${timeAgo(d.sentAt)}`}
        </span>
      </div>
    </Panel>
  );
}

const Section = ({ label, children }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</div>
    {children}
  </div>
);

function JiraDraft({ q, d }) {
  const j = d.jira;
  const rows = [
    ['Severity', j.severity], ['Environment', j.environment],
    ['Steps to reproduce', <ol key="s" className="list-decimal pl-4">{j.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>],
    ['Expected', j.expected], ['Actual', j.actual], ['Client impact', j.impact], ['Workaround', j.workaround || 'None'],
    ['Ask the client for', j.missingInfo.join('; ') || 'Nothing'],
    ['Attach in Jira', attachmentNames(q.attachments).join(', ') || 'No attachments from the client'],
  ];
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <div className="flex justify-between flex-wrap gap-2 items-center">
        <b className="text-destructive">Jira ticket draft for the Bug Intake Reviewer</b>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={async () => {
            if (await copy(jiraText(q, d))) toast.success('Ticket copied. Paste it into Jira.');
            else toast.error('Couldn\'t copy; download the CSV instead.');
          }}>
            <ClipboardCopy className="w-3.5 h-3.5" /> Copy ticket
          </Button>
          <Button size="sm" variant="outline" onClick={() => download(`Q${q.number}-jira.csv`, jiraCsv(q, d), 'text/csv')}><Download className="w-3.5 h-3.5" /> CSV for Jira import</Button>
        </div>
      </div>
      <div className="font-semibold text-sm">{j.summary}</div>
      <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">The platform never writes to Jira. Copy the ticket, or import the CSV, after review.</p>
    </div>
  );
}
