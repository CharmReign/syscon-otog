'use client';

// Admin document upload: drag-and-drop (from steep's quiz setup), metadata, client-side
// type/size checks for fast feedback, and upload progress. The server re-validates everything.
import { useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Panel, ProgressBar } from '@/components/otog/ui';
import { selectClass } from '@/components/otog/confirm';
import { uploadWithProgress } from '@/lib/api-client';
import { DOC_CATEGORIES } from '@/lib/levelup';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

export function UploadPanel({ status, onUploaded }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('SUPPORT');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const accept = status?.upload.accept || '.pdf,.docx,.txt,.md';
  const maxBytes = status?.upload.maxBytes || 10 * 1024 * 1024;

  const pick = (f) => {
    setError('');
    setSuccess('');
    if (!f) return setFile(null);
    const ext = `.${f.name.split('.').pop().toLowerCase()}`;
    if (!accept.split(',').includes(ext === '.markdown' ? '.md' : ext)) return setError(`${ext} files aren't supported. Upload ${status?.upload.types.join(', ') || 'PDF, DOCX, TXT or Markdown'}.`);
    if (f.size > maxBytes) return setError(`That file is ${fmtBytes(f.size)}; the limit is ${fmtBytes(maxBytes)}.`);
    if (f.size === 0) return setError('That file is empty.');
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setSuccess('');
    setPhase('uploading');
    setProgress(0);
    const form = new FormData();
    form.set('file', file);
    form.set('title', title.trim());
    form.set('description', description.trim());
    form.set('category', category);
    try {
      const { document } = await uploadWithProgress('levelup/documents', form, (p) => { setProgress(p); if (p === 100) setPhase('processing'); });
      setSuccess(`“${document.title}” is processed: ${document.sectionCount} sections${document.pageCount ? ` across ${document.pageCount} pages` : ''}. You can generate a quiz from it now.`);
      setFile(null);
      setTitle('');
      setDescription('');
      onUploaded?.(document);
    } catch (err) {
      // A processing failure still creates a FAILED record, so refresh the list too.
      setError(err.message);
      if (err.data?.document) onUploaded?.(err.data.document);
    } finally {
      setPhase('idle');
      setProgress(null);
    }
  };

  const busy = phase !== 'idle';

  return (
    <Panel title="Upload a source document" id="upload">
      <form onSubmit={submit} className="space-y-4">
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4">
            <FileText className="w-5 h-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
            </div>
            {!busy && <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="rounded p-1 hover:bg-background"><X className="w-4 h-4" /></button>}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
              className={cn('flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary/60', dragging && 'border-primary bg-primary/10')}>
              <Upload className="w-6 h-6 text-primary" />
              <span className="text-sm font-medium">Drop a file here, or click to choose</span>
              <span className="text-xs text-muted-foreground">{status?.upload.types.join(', ') || 'PDF, DOCX, TXT, Markdown'} · up to {fmtBytes(maxBytes)} · scanned PDFs need a text layer</span>
            </button>
            <input ref={inputRef} type="file" accept={accept} className="sr-only" aria-label="Choose a document" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div>
            <label htmlFor="doc-title" className="text-sm font-medium">Title</label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Ticket escalation procedure" className="mt-1" />
          </div>
          <div>
            <label htmlFor="doc-category" className="text-sm font-medium">Category</label>
            <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)} className={cn(selectClass, 'mt-1 w-full')}>
              {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="doc-description" className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Textarea id="doc-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} className="mt-1" placeholder="What does this document cover, and who is it for?" />
        </div>

        {busy && (
          <div className="space-y-1.5" aria-live="polite">
            <ProgressBar value={phase === 'processing' ? 100 : progress || 0} label="Upload progress" />
            <p className="text-xs text-muted-foreground">{phase === 'uploading' ? `Uploading… ${progress}%` : 'Reading and processing the document…'}</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />{success}</p>}

        <Button type="submit" disabled={!file || busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload and process
        </Button>
      </form>
    </Panel>
  );
}
