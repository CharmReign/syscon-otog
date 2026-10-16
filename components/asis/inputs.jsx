'use client';

// Inputs shared by the intake and Add knowledge forms: a drop zone for documents and
// screenshots, a box for pasted email / Teams / Jira / Confluence content, and a picker
// that pulls references from internal documents, Confluence and Jira.
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, FileUp, Image as ImageIcon, Loader2, Plus, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SOURCES } from '@/components/asis/knowledge-search';
import { LimitedTextarea } from '@/components/asis/shared';
import { loadImage, toJpeg } from '@/components/triage/attachments';
import { api } from '@/lib/api-client';
import { LIMITS, MATERIAL_ACCEPT, MATERIAL_HINT, PASTE_SOURCES } from '@/lib/asis';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const REFERENCE_CHARS = LIMITS.referenceChars;
const isImage = (f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
const extOk = (accept, f) => accept.split(',').some(x => f.name.toLowerCase().endsWith(x.trim().toLowerCase()));

// Screenshots are shrunk to a JPEG in the browser, so only small images are uploaded.
async function asJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const blob = await toJpeg(img, img.naturalWidth, img.naturalHeight);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function FileDrop({ files, onChange, accept = MATERIAL_ACCEPT, multiple = true, label = 'Add documents and screenshots', hint = MATERIAL_HINT }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async (list) => {
    const incoming = Array.from(list || []);
    const rejected = incoming.filter(f => !extOk(accept, f));
    if (rejected.length) toast.error(`Not added, unsupported file type: ${rejected.slice(0, 3).map(f => f.name).join(', ')}${/\.(doc|ppt|xls)$/i.test(rejected[0].name) ? '. Save older Office files in the newer format (.docx, .pptx, .xlsx).' : ''}`);
    const ok = incoming.filter(f => extOk(accept, f));
    if (!ok.length) return;
    if (!multiple) return onChange(ok.slice(0, 1));
    setBusy(true);
    const prepared = [];
    for (const f of ok) {
      try {
        prepared.push(isImage(f) && (f.type !== 'image/jpeg' || f.size > 2 * 1024 * 1024) ? await asJpeg(f) : f);
      } catch (e) {
        toast.error(`${f.name}: ${e.message}`);
      }
    }
    setBusy(false);
    const names = new Set(files.map(f => f.name));
    const next = [...files, ...prepared.filter(f => !names.has(f.name))];
    const docs = next.filter(f => !isImage(f));
    const images = next.filter(isImage);
    if (docs.length > LIMITS.files) toast.error(`Attach at most ${LIMITS.files} documents at a time.`);
    if (images.length > LIMITS.images) toast.error(`At most ${LIMITS.images} screenshots are sent to Claude per analysis.`);
    onChange([...docs.slice(0, LIMITS.files), ...images.slice(0, LIMITS.images)]);
  };

  return (
    <div>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn('w-full rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors', over ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
        {busy ? <Loader2 className="w-5 h-5 mx-auto mb-1 animate-spin text-muted-foreground" /> : <FileUp className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />}
        <div className="font-medium">{busy ? 'Preparing files…' : over ? 'Drop to add these files' : label}</div>
        <div className="text-xs text-muted-foreground">Click or drop files · {hint}</div>
      </button>
      <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={f.name} className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              {isImage(f) && <ImageIcon className="w-4 h-4 text-primary shrink-0" />}
              <span className="flex-1 min-w-0 truncate font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground">{isImage(f) ? 'sent to Claude' : fmtBytes(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Content pasted from email threads, Teams messages, Jira tickets or Confluence pages.
export function PasteBox({ value, onChange, sources, onSources, id }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Where the pasted content came from">
        {PASTE_SOURCES.map(s => (
          <button key={s} type="button" aria-pressed={sources.includes(s)} onClick={() => onSources(sources.includes(s) ? sources.filter(x => x !== s) : [...sources, s])}
            className={cn('px-3 h-8 rounded-md border text-xs', sources.includes(s) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:border-primary/50')}>
            {s}
          </button>
        ))}
      </div>
      <LimitedTextarea id={id} limit={LIMITS.pasted} value={value} onChange={(e) => onChange(e.target.value)} rows={5}
        note="Optional. Tick where it came from." placeholder="Paste the relevant email threads, Teams messages, Jira tickets or Confluence pages, including any replies that matter…" />
    </div>
  );
}

// Fetches the full text behind a search hit, so the analysis sees more than the snippet.
async function referenceFrom(source, hit) {
  try {
    if (source === 'internal') {
      const { document } = await api(`levelup/documents/${hit.documentId}?content=1`);
      const section = document.sections?.find(s => s.id === hit.sectionId);
      return { source, title: hit.documentTitle, ref: hit.ref, url: `/modules/level-up/materials/${hit.documentId}#${hit.sectionId}`, text: section?.text || hit.snippet };
    }
    if (source === 'confluence') {
      const { page } = await api(`confluence/pages/${hit.id}`);
      return { source, title: page.title, ref: page.space?.name || '', url: page.url || hit.url || '', text: page.text || hit.excerpt || '' };
    }
    const { issue } = await api(`jira/issues/${encodeURIComponent(hit.key)}`);
    const meta = [issue.status, issue.priority, issue.issueType].filter(Boolean).join(' · ');
    return { source, title: `${issue.key}: ${issue.summary}`, ref: meta, url: issue.url || hit.url || '', text: [issue.summary, meta, issue.description].filter(Boolean).join('\n\n') };
  } catch {
    // Fall back to what the search returned.
    if (source === 'internal') return { source, title: hit.documentTitle, ref: hit.ref, url: '', text: hit.snippet };
    if (source === 'confluence') return { source, title: hit.title, ref: '', url: hit.url || '', text: hit.excerpt || hit.title };
    return { source, title: `${hit.key}: ${hit.summary}`, ref: '', url: hit.url || '', text: hit.summary };
  }
}

const hitKey = (source, h) => `${source}:${h.documentId ? `${h.documentId}#${h.sectionId}` : h.key || h.id}`;
const hitTitle = (source, h) => (source === 'internal' ? `${h.documentTitle} · ${h.ref}` : source === 'confluence' ? h.title : `${h.key}: ${h.summary}`);
const hitText = (source, h) => (source === 'internal' ? h.snippet : source === 'confluence' ? h.excerpt : [h.status, h.priority].filter(Boolean).join(' · '));

export function ReferencePicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState(['internal', 'confluence', 'jira']);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null);
  const chosen = new Set(value.map(r => r.key));

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 2 || !sources.length) return;
    setSearching(true);
    try {
      const data = await api(`knowledge/search?q=${encodeURIComponent(query.trim())}&sources=${sources.join(',')}`);
      setResults(data.sources);
    } catch (err) {
      toast.error(err.message);
    }
    setSearching(false);
  };

  const add = async (source, hit) => {
    const key = hitKey(source, hit);
    if (value.length >= 20) return toast.error('Include at most 20 references.');
    setAdding(key);
    const ref = await referenceFrom(source, hit);
    onChange([...value, { ...ref, key, text: String(ref.text || '').slice(0, REFERENCE_CHARS) }]);
    setAdding(null);
  };

  return (
    <div className="space-y-3">
      {/* A nested <form> isn't allowed, so Enter is handled on the input. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(e)}
            placeholder="e.g. prisoner account balance integration" aria-label="Search for references" className="pl-9" maxLength={200} />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={query.trim().length < 2 || !sources.length || searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {SOURCES.map(s => (
          <button key={s.key} type="button" aria-pressed={sources.includes(s.key)}
            onClick={() => setSources(cur => (cur.includes(s.key) ? cur.filter(x => x !== s.key) : [...cur, s.key]))}
            className={cn('inline-flex items-center gap-1.5 px-3 h-8 rounded-md border', sources.includes(s.key) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'text-muted-foreground')}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {results && (
        <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
          {SOURCES.filter(s => results[s.key]).map(s => {
            const r = results[s.key];
            if (r.status === 'not_configured') return <p key={s.key} className="px-3 py-2 text-xs text-muted-foreground">{s.label} isn&apos;t connected.</p>;
            if (r.status === 'error') return <p key={s.key} className="px-3 py-2 text-xs text-destructive">{s.label}: {r.error}</p>;
            if (!r.results.length) return <p key={s.key} className="px-3 py-2 text-xs text-muted-foreground">{s.label}: no matches.</p>;
            return r.results.map(h => {
              const key = hitKey(s.key, h);
              return (
                <div key={key} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <s.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{hitTitle(s.key, h)}</div>
                    {hitText(s.key, h) && <p className="text-xs text-muted-foreground line-clamp-2">{hitText(s.key, h)}</p>}
                  </div>
                  <Button type="button" size="sm" variant={chosen.has(key) ? 'ghost' : 'outline'} disabled={chosen.has(key) || adding === key} onClick={() => add(s.key, h)}>
                    {adding === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : chosen.has(key) ? 'Added' : <><Plus className="w-3.5 h-3.5" /> Add</>}
                  </Button>
                </div>
              );
            });
          })}
        </div>
      )}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map(r => {
            const Icon = SOURCES.find(s => s.key === r.source)?.icon;
            return (
              <li key={r.key} className="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-1.5 text-sm">
                {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
                <span className="flex-1 min-w-0 truncate font-medium">{r.title}</span>
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" aria-label={`Open ${r.title}`}><ExternalLink className="w-3.5 h-3.5" /></a>}
                <button type="button" aria-label={`Remove ${r.title}`} className="text-muted-foreground hover:text-destructive" onClick={() => onChange(value.filter(x => x.key !== r.key))}><X className="w-4 h-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Multipart body for the analyse / knowledge endpoints.
export function analysisForm(fields, files = [], template = null) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  for (const f of files) form.append('files', f);
  if (template) form.set('template', template);
  return form;
}
