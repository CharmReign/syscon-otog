'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Compass, ExternalLink, FileText, Search, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, ErrorState, Loading, Panel, Pill, useApi } from '@/components/otog/ui';
import { isAdmin } from '@/lib/access';
import { DOC_CATEGORIES, categoryLabel } from '@/lib/levelup';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const SOURCES = [
  { key: 'internal', label: 'Documents', icon: FileText },
  { key: 'confluence', label: 'Confluence', icon: BookOpen },
  { key: 'jira', label: 'Jira', icon: Ticket },
];

// One search across processed documents (shared with Level Up), Confluence and Jira,
// with page/section references. `q` comes from the page URL.
export function KnowledgeSearch({ q }) {
  const { user } = useAuth();
  const router = useRouter();
  const [input, setInput] = useState(q);
  const [sources, setSources] = useState(['internal', 'confluence', 'jira']);
  const [category, setCategory] = useState('');

  useEffect(() => { setInput(q); }, [q]);

  const path = q.length >= 2 && sources.length
    ? `knowledge/search?q=${encodeURIComponent(q)}&sources=${sources.join(',')}${category ? `&categories=${category}` : ''}`
    : null;
  const results = useApi(path);
  const systemDocs = useApi('levelup/documents?category=SYSTEM');

  const toggle = (k) => setSources(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));

  return (
    <div>
      <form role="search" className="flex flex-col sm:flex-row gap-2 mb-3"
        onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (v.length >= 2) router.push(`/modules/as-is-navigator?tab=search&q=${encodeURIComponent(v)}`); }}>
        <div className="relative flex-1 max-w-2xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. how are bookings synchronised to the court system?" aria-label="Search system knowledge" className="pl-9" maxLength={200} />
        </div>
        <Button type="submit" disabled={input.trim().length < 2}>Search</Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
        <span className="text-muted-foreground">Sources:</span>
        {SOURCES.map(s => (
          <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={sources.includes(s.key)}
            className={cn('inline-flex items-center gap-1.5 px-3 h-8 rounded-md border', sources.includes(s.key) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'text-muted-foreground')}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
        <span className="text-muted-foreground ml-2">Documents:</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Document category" className="h-8 rounded-md border bg-background px-2">
          <option value="">All categories</option>
          {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {path ? (
        results.isLoading ? <Loading label="Searching…" /> : results.error ? <ErrorState error={results.error} onRetry={results.refetch} /> : (
          <div className="grid gap-4 xl:grid-cols-3">
            {SOURCES.filter(s => sources.includes(s.key)).map(s => <SourceResults key={s.key} source={s} result={results.data.sources[s.key]} />)}
          </div>
        )
      ) : (
        <Panel title="System documentation">
          {systemDocs.isLoading ? <Loading /> : systemDocs.error ? <ErrorState error={systemDocs.error} /> : systemDocs.data.documents.filter(d => d.status === 'READY').length === 0 ? (
            <EmptyState icon={Compass} title="No system documentation yet"
              body={isAdmin(user) ? 'Upload documents with the category "System / AS-IS" and they will be listed here and searchable.' : 'Documents describing how systems work today will be listed here. You can already search everything above.'} />
          ) : (
            <ul className="divide-y">
              {systemDocs.data.documents.filter(d => d.status === 'READY').map(d => (
                <li key={d.id}>
                  <Link href={`/modules/level-up/materials/${d.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="flex-1 min-w-0 truncate font-medium text-sm">{d.title}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(d.uploadedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

function SourceResults({ source, result }) {
  const Icon = source.icon;
  return (
    <Panel className="h-fit">
      <h2 className="font-semibold text-primary flex items-center gap-2 mb-3"><Icon className="w-4 h-4" /> {source.label}
        {result?.status === 'ok' && <span className="text-xs text-muted-foreground font-normal">{result.results.length} found</span>}
      </h2>
      {!result || result.status === 'not_configured' ? (
        <p className="text-sm text-muted-foreground">{source.label} isn't connected. <Link href="/modules/system/settings" className="text-primary hover:underline">Integration status</Link></p>
      ) : result.status === 'error' ? (
        <p className="text-sm text-destructive">{result.error}</p>
      ) : result.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches.</p>
      ) : (
        <ul className="space-y-3">
          {result.results.map((r, i) => <li key={i} className="text-sm">{source.key === 'internal' ? <DocHit h={r} /> : source.key === 'confluence' ? <PageHit p={r} /> : <IssueHit i={r} />}</li>)}
        </ul>
      )}
    </Panel>
  );
}

const DocHit = ({ h }) => (
  <>
    <Link href={`/modules/level-up/materials/${h.documentId}#${h.sectionId}`} className="font-medium hover:text-primary">{h.documentTitle}</Link>
    <div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-primary">{h.ref}</span><Pill>{categoryLabel(h.category)}</Pill></div>
    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{h.snippet}</p>
  </>
);

const PageHit = ({ p }) => (
  <>
    <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary inline-flex items-center gap-1">{p.title} <ExternalLink className="w-3 h-3" /></a>
    {p.space && <div className="text-xs text-muted-foreground">{p.space}</div>}
    {p.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.excerpt}</p>}
  </>
);

const IssueHit = ({ i }) => (
  <>
    <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary inline-flex items-center gap-1"><span className="font-mono text-primary">{i.key}</span> <ExternalLink className="w-3 h-3" /></a>
    <p className="text-sm">{i.summary}</p>
    <div className="text-xs text-muted-foreground">{[i.status, i.priority, i.issueType].filter(Boolean).join(' · ')}</div>
  </>
);
