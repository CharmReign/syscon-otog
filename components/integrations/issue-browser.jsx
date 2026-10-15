'use client';

// Searchable Jira issue list with a detail panel. Used by Client Defect Triage (defects
// only, plus related knowledge) and the Jira Tickets section (any issue). Data always
// comes through our API; the browser never talks to Jira directly.
import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Loader2, Search, X, BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Loading, Panel, Pill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONE = { new: 'gray', indeterminate: 'cyan', done: 'green' };

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  return p.toString();
}

export function IssueBrowser({ listPath, detailPath, requireQuery, emptyHint, showClient, relatedKnowledge }) {
  const [form, setForm] = useState({ q: '', project: '', status: '' });
  const [params, setParams] = useState(requireQuery ? null : { q: '', project: '', status: '' });
  const [selected, setSelected] = useState(null);

  const list = useInfiniteQuery({
    queryKey: [listPath, params],
    enabled: !!params,
    initialPageParam: {},
    queryFn: ({ pageParam }) => api(`${listPath}?${qs({ ...params, limit: 25, ...pageParam })}`),
    getNextPageParam: (last) => (!last.hasMore ? undefined : last.nextPageToken ? { next: last.nextPageToken } : { startAt: (last.startAt || 0) + last.issues.length }),
    retry: false,
  });

  const search = (e) => {
    e.preventDefault();
    const next = { q: form.q.trim(), project: form.project.trim().toUpperCase(), status: form.status.trim() };
    if (requireQuery && !next.q && !next.project) return;
    setSelected(null);
    setParams(next);
  };

  const issues = list.data?.pages.flatMap(p => p.issues) || [];

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="grid gap-2 sm:grid-cols-[1fr_140px_160px_auto]" role="search">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} placeholder="Keywords or issue key (e.g. SUP-123)" aria-label="Keywords or issue key" className="pl-9" />
        </div>
        <Input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Project key" aria-label="Project key" maxLength={20} />
        <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} placeholder="Status" aria-label="Status" maxLength={60} />
        <Button type="submit">Search</Button>
      </form>

      <div className={cn('grid gap-4', selected && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
        <Panel className="p-0 overflow-hidden h-fit">
          {!params ? (
            <EmptyState icon={Search} title="Search Jira" body={emptyHint} />
          ) : list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.refetch} className="m-4" /> : issues.length === 0 ? (
            <EmptyState icon={Search} title="No issues found" body="Try other keywords, or clear the project and status filters." />
          ) : (
            <>
              <ul className="divide-y">
                {issues.map(i => (
                  <li key={i.key}>
                    <button type="button" onClick={() => setSelected(i.key)} aria-current={selected === i.key}
                      className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', selected === i.key && 'bg-accent')}>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-mono font-semibold text-primary">{i.key}</span>
                        {i.status && <Pill tone={STATUS_TONE[i.statusCategory] || 'gray'}>{i.status}</Pill>}
                        {i.priority && <span className="text-muted-foreground">{i.priority}</span>}
                        {showClient && i.client && <span className="text-muted-foreground">· {i.client}</span>}
                        <span className="ml-auto text-muted-foreground">{fmtDate(i.updated)}</span>
                      </div>
                      <div className="text-sm font-medium mt-1 line-clamp-2">{i.summary}</div>
                    </button>
                  </li>
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="p-3 border-t">
                  <Button variant="outline" className="w-full" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                    {list.isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />} Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </Panel>
        {selected && <IssueDetail key={selected} path={`${detailPath}/${encodeURIComponent(selected)}`} onClose={() => setSelected(null)} relatedKnowledge={relatedKnowledge} />}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  if (!value || (Array.isArray(value) && !value.length)) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</dt>
      <dd className="text-sm mt-0.5">{Array.isArray(value) ? value.join(', ') : value}</dd>
    </div>
  );
}

function IssueDetail({ path, onClose, relatedKnowledge }) {
  const { data, error, isLoading, refetch } = useApi(path);
  const issue = data?.defect || data?.issue;
  return (
    <Panel className="h-fit lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        {issue ? <span className="font-mono font-semibold text-primary">{issue.key}</span> : <span />}
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close details"><X className="w-4 h-4" /></Button>
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold leading-snug">{issue.summary}</h2>
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1">Open in Jira <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Status" value={issue.status} />
            <Field label="Priority" value={issue.priority} />
            <Field label="Severity" value={issue.severity} />
            <Field label="Type" value={issue.issueType} />
            <Field label="Client" value={issue.client} />
            <Field label="Project" value={issue.project && `${issue.project.name} (${issue.project.key})`} />
            <Field label="Components" value={issue.components} />
            <Field label="Labels" value={issue.labels} />
            <Field label="Assignee" value={issue.assignee} />
            <Field label="Reporter" value={issue.reporter} />
            <Field label="Created" value={fmtDateTime(issue.created)} />
            <Field label="Updated" value={fmtDateTime(issue.updated)} />
          </dl>
          {issue.description && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Description</div>
              <div className="text-sm whitespace-pre-line max-h-72 overflow-y-auto scrollbar-thin rounded-lg bg-muted/40 p-3">{issue.description}</div>
            </div>
          )}
          {relatedKnowledge && data.related && <RelatedKnowledge related={data.related} query={data.relatedQuery} />}
        </div>
      )}
    </Panel>
  );
}

function RelatedKnowledge({ related, query }) {
  const internal = related.internal?.results || [];
  const confluence = related.confluence;
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold text-primary">Related knowledge</h3>
      <p className="text-xs text-muted-foreground mb-3">Matched on: {query}</p>
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Internal documents</div>
          {internal.length === 0 ? <p className="text-sm text-muted-foreground">No matching documents.</p> : (
            <ul className="space-y-2">
              {internal.map((h, i) => (
                <li key={i} className="text-sm">
                  <Link href={`/modules/level-up/materials/${h.documentId}#${h.sectionId}`} className="font-medium hover:text-primary">{h.documentTitle}</Link>
                  <span className="text-xs text-primary ml-1.5">{h.ref}</span>
                  <p className="text-xs text-muted-foreground line-clamp-2">{h.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Confluence</div>
          {confluence?.status === 'not_configured' ? <p className="text-sm text-muted-foreground">Confluence isn't connected.</p>
            : confluence?.status === 'error' ? <p className="text-sm text-destructive">{confluence.error}</p>
            : !confluence?.results.length ? <p className="text-sm text-muted-foreground">No matching pages.</p> : (
              <ul className="space-y-2">
                {confluence.results.map(p => (
                  <li key={p.id} className="text-sm">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary inline-flex items-center gap-1">{p.title} <ExternalLink className="w-3 h-3" /></a>
                    {p.space && <span className="text-xs text-muted-foreground ml-1.5">{p.space}</span>}
                    {p.excerpt && <p className="text-xs text-muted-foreground line-clamp-2">{p.excerpt}</p>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}
