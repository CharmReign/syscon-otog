'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, Eye, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, ErrorState, IntegrationNotice, Loading, PageTitle, Panel, Pill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { fmtDate, fmtDateTime } from '@/lib/format';

// Confluence Hub: search pages through the server's Confluence integration, read them
// here, or open the original.
export default function ConfluencePage() {
  const { user } = useAuth();
  const status = useApi('integrations/status');
  const cfg = status.data?.integrations.confluence;
  const [input, setInput] = useState({ q: '', space: '' });
  const [params, setParams] = useState(null);
  const [preview, setPreview] = useState(null);

  const results = useInfiniteQuery({
    queryKey: ['confluence/search', params],
    enabled: !!params,
    initialPageParam: {},
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ q: params.q, limit: '20' });
      if (params.space) p.set('space', params.space);
      if (pageParam.cursor) p.set('cursor', pageParam.cursor);
      if (pageParam.start) p.set('start', pageParam.start);
      return api(`confluence/search?${p}`);
    },
    getNextPageParam: (last) => (!last.hasMore ? undefined : last.nextCursor ? { cursor: last.nextCursor } : { start: last.start + last.results.length }),
    retry: false,
  });
  const pages = results.data?.pages.flatMap(p => p.results) || [];
  const total = results.data?.pages[0]?.total;

  return (
    <div>
      <PageTitle eyebrow="External integration" title="Confluence Hub"
        subtitle="Search Confluence pages and read them here. You'll only see content the integration account is allowed to see."
        actions={cfg?.configured && <Pill tone={cfg.lastCheck?.ok ? 'green' : 'gray'}>{cfg.lastCheck?.ok ? 'Connection verified' : 'Configured · not verified'}</Pill>} />

      {status.isLoading ? <Loading /> : status.error ? <ErrorState error={status.error} onRetry={status.refetch} /> : !cfg.configured ? (
        <IntegrationNotice name="Confluence" isAdmin={isAdmin(user)} />
      ) : (
        <div className="space-y-4">
          <form role="search" className="grid gap-2 sm:grid-cols-[1fr_160px_auto]"
            onSubmit={(e) => { e.preventDefault(); if (input.q.trim()) setParams({ q: input.q.trim(), space: input.space.trim().toUpperCase() }); }}>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={input.q} onChange={(e) => setInput({ ...input, q: e.target.value })} placeholder="Search pages" aria-label="Search Confluence pages" className="pl-9" maxLength={200} />
            </div>
            <Input value={input.space} onChange={(e) => setInput({ ...input, space: e.target.value })} placeholder="Space key (optional)" aria-label="Space key" maxLength={50} />
            <Button type="submit" disabled={!input.q.trim()}>Search</Button>
          </form>

          <Panel>
            {!params ? <EmptyState icon={BookOpen} title="Search Confluence" body="Find runbooks, product notes and process pages without leaving OneTeamOneGoal." />
              : results.isLoading ? <Loading /> : results.error ? <ErrorState error={results.error} onRetry={results.refetch} />
              : pages.length === 0 ? <EmptyState icon={Search} title="No pages found" body="Try other keywords or remove the space filter." /> : (
                <>
                  {total != null && <p className="text-xs text-muted-foreground mb-2">{total} result{total === 1 ? '' : 's'}</p>}
                  <ul className="divide-y">
                    {pages.map(p => (
                      <li key={p.id} className="py-3 flex items-start gap-3">
                        <BookOpen className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <button type="button" onClick={() => setPreview(p)} className="font-medium text-left hover:text-primary">{p.title}</button>
                          <div className="text-xs text-muted-foreground">{[p.space, p.type, p.lastModified && `updated ${fmtDate(p.lastModified)}`].filter(Boolean).join(' · ')}</div>
                          {p.excerpt && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.excerpt}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => setPreview(p)} aria-label={`Preview ${p.title}`}><Eye className="w-4 h-4" /></Button>
                          {p.url && <Button size="icon" variant="ghost" asChild><a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.title} in Confluence`}><ExternalLink className="w-4 h-4" /></a></Button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {results.hasNextPage && (
                    <Button variant="outline" className="w-full mt-3" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
                      {results.isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />} Load more
                    </Button>
                  )}
                </>
              )}
          </Panel>
        </div>
      )}
      {preview && <PagePreview page={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PagePreview({ page, onClose }) {
  const { data, error, isLoading } = useApi(`confluence/pages/${page.id}`);
  const p = data?.page;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{page.title}</DialogTitle>
          <DialogDescription>
            {p ? [p.space?.name, p.version && `version ${p.version}`, p.updatedAt && `updated ${fmtDateTime(p.updatedAt)}`, p.updatedBy].filter(Boolean).join(' · ') : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? <Loading /> : error ? <ErrorState error={error} /> : (
            <>
              <div className="text-sm whitespace-pre-line leading-relaxed">{p.text || 'This page has no text content.'}</div>
              {p.truncated && <p className="text-xs text-muted-foreground mt-3">The page is long; open it in Confluence to read the rest.</p>}
            </>
          )}
        </div>
        {(p?.url || page.url) && (
          <a href={p?.url || page.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Open in Confluence <ExternalLink className="w-3.5 h-3.5" /></a>
        )}
      </DialogContent>
    </Dialog>
  );
}
