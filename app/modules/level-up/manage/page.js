'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, FileText, ListChecks, MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Confirm, selectClass } from '@/components/otog/confirm';
import { EmptyState, ErrorState, Loading, PageTitle, Panel, Pill, StatusPill, useApi } from '@/components/otog/ui';
import { GenerateDialog } from '@/components/levelup/generate-dialog';
import { UploadPanel } from '@/components/levelup/upload-panel';
import { api } from '@/lib/api-client';
import { categoryLabel } from '@/lib/levelup';
import { fmtBytes, fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// Admin-only (the nav hides it from employees and every API call here requires ADMIN).
export default function ManagePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useApi('levelup/status');
  const docs = useApi('levelup/documents');
  const quizzes = useApi('levelup/quizzes');
  const [generateFor, setGenerateFor] = useState(null);
  const [tab, setTab] = useState('documents');

  // ?upload=1 (from the dashboard) jumps to the upload form.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('upload')) document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['levelup/documents'] });
    queryClient.invalidateQueries({ queryKey: ['levelup/quizzes'] });
    queryClient.invalidateQueries({ queryKey: ['levelup/stats'] });
  };

  const act = async (fn, success) => {
    try {
      await fn();
      if (success) toast.success(success);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const quizCount = useMemo(() => {
    const m = {};
    (quizzes.data?.quizzes || []).forEach(q => { m[q.documentId] = (m[q.documentId] || 0) + 1; });
    return m;
  }, [quizzes.data]);

  return (
    <div>
      <PageTitle eyebrow="Level Up: Product & Support" title="Manage quizzes"
        subtitle="Upload source documents, generate quizzes from them, review and edit the questions, then publish. Nothing is published without review." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="documents"><FileText className="w-4 h-4 mr-1.5" /> Documents</TabsTrigger>
          <TabsTrigger value="quizzes"><ListChecks className="w-4 h-4 mr-1.5" /> Quizzes</TabsTrigger>
          <TabsTrigger value="results"><Users className="w-4 h-4 mr-1.5" /> Results</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <UploadPanel status={status.data} onUploaded={refresh} />
          <Panel title="Source documents">
            {docs.isLoading ? <Loading /> : docs.error ? <ErrorState error={docs.error} onRetry={docs.refetch} /> : docs.data.documents.length === 0 ? (
              <EmptyState icon={FileText} title="No documents yet" body="Upload a PDF, Word or text document above to get started." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">Document</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Uploaded</th>
                      <th className="py-2 pr-4 font-medium text-right">Quizzes</th>
                      <th className="py-2 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.data.documents.map(d => (
                      <tr key={d.id} className="border-b last:border-0 align-top">
                        <td className="py-3 pr-4 min-w-[14rem]">
                          <Link href={`/modules/level-up/materials/${d.id}`} className="font-medium hover:text-primary">{d.title}</Link>
                          <div className="text-xs text-muted-foreground">{d.filename} · {fmtBytes(d.size)} · {categoryLabel(d.category)}</div>
                        </td>
                        <td className="py-3 pr-4 min-w-[10rem]">
                          <StatusPill status={d.status} />
                          {d.status === 'READY' && <div className="text-xs text-muted-foreground mt-1">{d.pageCount ? `${d.pageCount} pages, ` : ''}{d.sectionCount} sections</div>}
                          {d.error && <div className="text-xs text-destructive mt-1 max-w-xs">{d.error}</div>}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(d.uploadedAt)}<div className="text-xs text-muted-foreground">{d.uploadedByName}</div></td>
                        <td className="py-3 pr-4 text-right tabular-nums">{quizCount[d.id] || 0}</td>
                        <td className="py-3 text-right whitespace-nowrap">
                          {d.status === 'READY' && <Button size="sm" onClick={() => setGenerateFor(d)}><Sparkles className="w-3.5 h-3.5" /> Generate quiz</Button>}
                          {d.status === 'FAILED' && <Button size="sm" variant="outline" onClick={() => act(() => api(`levelup/documents/${d.id}/reprocess`, { method: 'POST' }), 'Reprocessed')}><RefreshCw className="w-3.5 h-3.5" /> Reprocess</Button>}
                          <Confirm title={`Delete “${d.title}”?`} destructive confirmLabel="Delete"
                            description={quizCount[d.id] ? `This also removes the ${quizCount[d.id]} quiz(zes) generated from it. Learners' past results are kept.` : 'The file and its extracted text will be removed.'}
                            onConfirm={() => act(() => api(`levelup/documents/${d.id}?cascade=1`, { method: 'DELETE' }), 'Document deleted')}>
                            <Button size="icon" variant="ghost" className="ml-1" aria-label={`Delete ${d.title}`}><Trash2 className="w-4 h-4" /></Button>
                          </Confirm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="quizzes">
          <Panel>
            {quizzes.isLoading ? <Loading /> : quizzes.error ? <ErrorState error={quizzes.error} onRetry={quizzes.refetch} /> : quizzes.data.quizzes.length === 0 ? (
              <EmptyState icon={ListChecks} title="No quizzes yet" body="Generate one from a processed document on the Documents tab." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">Quiz</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium text-right">Questions</th>
                      <th className="py-2 pr-4 font-medium">Updated</th>
                      <th className="py-2 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.data.quizzes.map(q => (
                      <tr key={q.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 min-w-[14rem]">
                          <Link href={`/modules/level-up/manage/quizzes/${q.id}`} className="font-medium hover:text-primary">{q.title}</Link>
                          <div className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> {q.documentTitle}</div>
                        </td>
                        <td className="py-3 pr-4"><StatusPill status={q.status} /></td>
                        <td className="py-3 pr-4 text-right tabular-nums">{q.questionCount}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{fmtDate(q.updatedAt)}</td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" asChild><Link href={`/modules/level-up/manage/quizzes/${q.id}`}><Pencil className="w-3.5 h-3.5" /> Review</Link></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="ml-1" aria-label={`More actions for ${q.title}`}><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/modules/level-up/quizzes/${q.id}`)}><Eye className="w-4 h-4 mr-2" /> {q.status === 'PUBLISHED' ? 'Take quiz' : 'Preview'}</DropdownMenuItem>
                              {q.status === 'PUBLISHED'
                                ? <DropdownMenuItem onClick={() => act(() => api(`levelup/quizzes/${q.id}/unpublish`, { method: 'POST' }), 'Unpublished')}>Unpublish</DropdownMenuItem>
                                : <DropdownMenuItem onClick={() => act(() => api(`levelup/quizzes/${q.id}/publish`, { method: 'POST' }), 'Published')}>Publish</DropdownMenuItem>}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Delete “${q.title}”? Learners' past results are kept.`)) act(() => api(`levelup/quizzes/${q.id}`, { method: 'DELETE' }), 'Quiz deleted'); }}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="results">
          <ResultsTab quizzes={quizzes.data?.quizzes || []} />
        </TabsContent>
      </Tabs>

      {generateFor && (
        <GenerateDialog open document={generateFor} generator={status.data?.generator}
          onOpenChange={(v) => !v && setGenerateFor(null)}
          onCreated={(quiz) => { setGenerateFor(null); refresh(); toast.success(`Draft created with ${quiz.questions.length} questions`); router.push(`/modules/level-up/manage/quizzes/${quiz.id}`); }} />
      )}
    </div>
  );
}

function ResultsTab({ quizzes }) {
  const [quizId, setQuizId] = useState('');
  const { data, error, isLoading, refetch } = useApi(`levelup/attempts?all=1${quizId ? `&quizId=${quizId}` : ''}`);
  return (
    <Panel title="Quiz results" actions={
      <select value={quizId} onChange={(e) => setQuizId(e.target.value)} className={cn(selectClass, 'w-60')} aria-label="Filter by quiz">
        <option value="">All quizzes</option>
        {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
      </select>
    }>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.attempts.length === 0 ? (
        <EmptyState icon={Users} title="No results yet" body="Attempts on published quizzes appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">Learner</th>
                <th className="py-2 pr-4 font-medium">Quiz</th>
                <th className="py-2 pr-4 font-medium text-right">Score</th>
                <th className="py-2 pr-4 font-medium">Result</th>
                <th className="py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.attempts.map(a => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{a.userName}</td>
                  <td className="py-2.5 pr-4"><Link href={`/modules/level-up/history/${a.id}`} className="hover:text-primary">{a.quizTitle}</Link></td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{a.score}% <span className="text-muted-foreground">({a.correct}/{a.total})</span></td>
                  <td className="py-2.5 pr-4">{a.passed ? <Pill tone="green">Passed</Pill> : <Pill tone="amber">Not passed</Pill>}</td>
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">{fmtDateTime(a.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
