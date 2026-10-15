'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, Pill, useApi } from '@/components/otog/ui';
import { categoryLabel, sourceRef } from '@/lib/levelup';
import { fmtBytes, fmtDate } from '@/lib/format';

// Reader for a processed document: its extracted sections with page/heading references,
// a filter box, the quizzes built from it, and the original file to download.
export default function MaterialPage() {
  const { id } = useParams();
  const doc = useApi(`levelup/documents/${id}?content=1`);
  const quizzes = useApi('levelup/quizzes');
  const [filter, setFilter] = useState('');

  const sections = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = doc.data?.document.sections || [];
    return f ? all.filter(s => `${s.heading || ''} ${s.text}`.toLowerCase().includes(f)) : all;
  }, [doc.data, filter]);

  if (doc.isLoading) return <Loading />;
  if (doc.error?.status === 404) return <Panel><EmptyState title="Document not found" body="It may have been removed." /></Panel>;
  if (doc.error) return <ErrorState error={doc.error} onRetry={doc.refetch} />;
  const d = doc.data.document;
  const related = (quizzes.data?.quizzes || []).filter(q => q.documentId === d.id && q.status === 'PUBLISHED');

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/level-up/materials"><ArrowLeft className="w-4 h-4" /> Learning materials</Link></Button>
      <PageTitle title={d.title} subtitle={d.description}
        actions={<Button variant="outline" asChild><a href={`/api/levelup/documents/${d.id}/file`}><Download className="w-4 h-4" /> Download original</a></Button>} />
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center -mt-3">
        <Pill>{categoryLabel(d.category)}</Pill>
        <span>{d.filename} · {fmtBytes(d.size)} · uploaded {fmtDate(d.uploadedAt)} by {d.uploadedByName}</span>
      </div>

      {related.length > 0 && (
        <Panel title="Test yourself">
          <ul className="space-y-2">
            {related.map(q => (
              <li key={q.id}><Link href={`/modules/level-up/quizzes/${q.id}`} className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary"><ListChecks className="w-4 h-4 text-primary" /> {q.title} · {q.questionCount} questions</Link></li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Contents" actions={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sections" aria-label="Filter sections" className="h-8 w-48" />}>
        {sections.length === 0 ? <EmptyState title="No sections match" /> : (
          <div className="space-y-6">
            {sections.map(s => (
              <article key={s.id} id={s.id} className="scroll-mt-20">
                <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">{sourceRef(s)}</div>
                <div className="text-sm leading-relaxed whitespace-pre-line">{s.text}</div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
