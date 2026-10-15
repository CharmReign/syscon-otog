'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, Pill, useApi } from '@/components/otog/ui';
import { DOC_CATEGORIES, categoryLabel } from '@/lib/levelup';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Processed documents everyone can read, with full-text search across their sections.
export default function MaterialsPage() {
  const [category, setCategory] = useState('');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const docs = useApi(`levelup/documents${category ? `?category=${category}` : ''}`);
  const search = useApi(query ? `knowledge/search?q=${encodeURIComponent(query)}&sources=internal${category ? `&categories=${category}` : ''}` : null);

  const list = (docs.data?.documents || []).filter(d => d.status === 'READY');

  return (
    <div>
      <PageTitle eyebrow="Level Up: Product & Support" title="Learning materials" subtitle="Product and support documents uploaded by administrators. Search finds the exact page or section." />

      <form className="flex flex-col sm:flex-row gap-3 mb-4" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim().length >= 2 ? input.trim() : ''); }} role="search">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={input} onChange={(e) => { setInput(e.target.value); if (!e.target.value) setQuery(''); }} placeholder="Search inside documents" aria-label="Search inside documents" className="pl-9" />
        </div>
        <Button type="submit" disabled={input.trim().length < 2}>Search</Button>
      </form>
      <div className="flex gap-1.5 flex-wrap mb-5" role="group" aria-label="Filter by category">
        {[{ value: '', label: 'All' }, ...DOC_CATEGORIES].map(c => (
          <button key={c.value || 'all'} type="button" onClick={() => setCategory(c.value)} aria-pressed={category === c.value}
            className={cn('px-3 h-8 rounded-md border text-sm', category === c.value ? 'border-primary bg-primary/10 text-primary font-semibold' : 'hover:border-primary/50')}>{c.label}</button>
        ))}
      </div>

      {query && (
        <Panel title={`Results for “${query}”`} className="mb-6">
          {search.isLoading ? <Loading /> : search.error ? <ErrorState error={search.error} /> : search.data.sources.internal.results.length === 0 ? (
            <EmptyState icon={Search} title="No matches" body="Try different or fewer words." />
          ) : (
            <ul className="divide-y">
              {search.data.sources.internal.results.map((h, i) => (
                <li key={i} className="py-3">
                  <Link href={`/modules/level-up/materials/${h.documentId}#${h.sectionId}`} className="font-medium hover:text-primary">{h.documentTitle}</Link>
                  <span className="text-xs text-primary ml-2">{h.ref}</span>
                  <p className="text-sm text-muted-foreground mt-1">{h.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel>
        {docs.isLoading ? <Loading /> : docs.error ? <ErrorState error={docs.error} onRetry={docs.refetch} /> : list.length === 0 ? (
          <EmptyState icon={FileText} title="No materials yet" body="Documents appear here after an administrator uploads and processes them." />
        ) : (
          <ul className="divide-y">
            {list.map(d => (
              <li key={d.id}>
                <Link href={`/modules/level-up/materials/${d.id}`} className="flex items-start gap-3 py-3 group">
                  <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium group-hover:text-primary">{d.title}</div>
                    {d.description && <p className="text-sm text-muted-foreground line-clamp-2">{d.description}</p>}
                    <div className="text-xs text-muted-foreground mt-1">{d.ext.toUpperCase()} · {d.pageCount ? `${d.pageCount} pages` : `${d.sectionCount} sections`} · added {fmtDate(d.uploadedAt)}</div>
                  </div>
                  <Pill>{categoryLabel(d.category)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
