'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, ErrorState, Loading, Panel, Pill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { LIMITS, REF_TONE, SOURCE_TYPES, emailFromText, jiraFromCSV } from '@/lib/triage';
import { cn } from '@/lib/utils';

const TYPE_LABEL = { Confluence: 'Confluence', Jira: 'Jira', Email: 'Past email' };

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,header,footer').forEach(n => n.remove());
  return { title: doc.title || '', text: (doc.body?.textContent || '').replace(/\s+/g, ' ').trim() };
}

// Turns exported files into library references (parsed here, validated by the server).
async function itemsFromFiles(files, type) {
  const items = [];
  for (const file of files) {
    const text = await file.text();
    const name = file.name.replace(/\.[^.]+$/, '');
    if (/\.json$/i.test(file.name)) {
      const data = JSON.parse(text);
      (Array.isArray(data) ? data : data.sources || data.refs || []).forEach(r => r?.title && r?.text && items.push({
        id: r.id, type: SOURCE_TYPES.includes(r.type) ? r.type : type, title: r.title, text: String(r.text).slice(0, LIMITS.sourceChars), url: r.url,
      }));
    } else if (/\.csv$/i.test(file.name)) {
      items.push(...jiraFromCSV(text));
    } else if (/\.html?$/i.test(file.name)) {
      const h = stripHtml(text);
      items.push({ type, title: h.title || name, text: h.text.slice(0, LIMITS.sourceChars) });
    } else {
      const e = type === 'Email' ? emailFromText(text, name) : { title: name, text: text.replace(/\s+/g, ' ').slice(0, LIMITS.sourceChars) };
      items.push({ type, ...e });
    }
  }
  return items.filter(r => r.title && r.text);
}

export function Sources() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useApi('triage/sources');
  const [type, setType] = useState('Confluence');
  const [filter, setFilter] = useState('');
  const [paste, setPaste] = useState({ id: '', title: '', text: '' });
  const [drag, setDrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const save = async (items) => {
    if (!items.length) return toast.error('Nothing found in those files.');
    setSaving(true);
    try {
      const res = await api('triage/sources', { method: 'POST', body: { items } });
      queryClient.setQueryData(['triage/sources'], { sources: res.sources });
      toast.success(`Added ${res.added} and updated ${res.updated} reference${res.added + res.updated === 1 ? '' : 's'}.`);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onFiles = async (files) => {
    try {
      await save(await itemsFromFiles(files, type));
    } catch (e) {
      toast.error(e.message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = async (id) => {
    try {
      await api(`triage/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
      queryClient.setQueryData(['triage/sources'], (old) => ({ sources: old.sources.filter(s => s.id !== id) }));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const all = data?.sources || [];
  const shown = all.filter(r => !filter || `${r.id} ${r.title} ${r.text}`.toLowerCase().includes(filter.toLowerCase()));
  const counts = all.reduce((a, r) => ({ ...a, [r.type]: (a[r.type] || 0) + 1 }), {});

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
      <Panel title="Add references" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every draft already searches live <b>Jira</b>, <b>Confluence</b> and the platform's uploaded documents. Add exports here for what live search can't reach, such as client tickets and pages only BAs can open: a Jira <b>CSV export</b>, Confluence pages saved as <b>HTML</b> or text, past resolved emails as <b>.eml</b> or <b>.txt</b>, or a <b>.json</b> library exported from here. The library is shared with the whole team.
        </p>
        <div>
          <div className="text-sm font-medium mb-1.5">Type for uploaded pages and pasted text</div>
          <div className="inline-flex gap-1 rounded-lg border p-1">
            {SOURCE_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                className={cn('px-3 h-8 rounded-md text-sm', type === t ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground')}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles([...e.dataTransfer.files]); }}
          className={cn('w-full rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors', drag ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
          {saving ? <Loader2 className="w-5 h-5 mx-auto mb-1 animate-spin text-primary" /> : <Upload className="w-5 h-5 mx-auto mb-1 text-primary" />}
          <div className="font-medium">Drop files here, or click to choose</div>
          <div className="text-xs text-muted-foreground">Jira CSV, HTML, text (.txt), Markdown (.md), email (.eml), library (.json)</div>
        </button>
        <input ref={fileRef} type="file" multiple accept=".csv,.html,.htm,.txt,.md,.eml,.json" className="hidden" onChange={(e) => onFiles([...e.target.files])} />

        <div className="border-t pt-4 space-y-2">
          <div className="text-sm font-medium">Or paste one</div>
          <div className="grid grid-cols-[130px_1fr] gap-2">
            <Input value={paste.id} onChange={(e) => setPaste(p => ({ ...p, id: e.target.value }))} placeholder="ID, e.g. DR-123" maxLength={60} aria-label="Reference id" />
            <Input value={paste.title} onChange={(e) => setPaste(p => ({ ...p, title: e.target.value }))} placeholder="Title" maxLength={300} aria-label="Reference title" />
          </div>
          <Textarea value={paste.text} onChange={(e) => setPaste(p => ({ ...p, text: e.target.value }))} rows={5} maxLength={LIMITS.sourceChars} aria-label="Reference text"
            placeholder="Page content, ticket status and workaround, or the resolved email" />
          <Button size="sm" disabled={!paste.title.trim() || !paste.text.trim() || saving}
            onClick={async () => { if (await save([{ id: paste.id.trim() || undefined, type, title: paste.title.trim(), text: paste.text.trim() }])) setPaste({ id: '', title: '', text: '' }); }}>
            Add reference
          </Button>
        </div>

        <div className="border-t pt-4 flex gap-3 flex-wrap items-center">
          <Button variant="outline" size="sm" disabled={!all.length} onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(all.map(({ id, type: t, title, text, url: u }) => ({ id, type: t, title, text, url: u })), null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url; a.download = 'triage-knowledge.json'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}><Download className="w-3.5 h-3.5" /> Export library (.json)</Button>
          <span className="text-xs text-muted-foreground">A backup, or a way to move the library to another server.</span>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          {Object.entries(counts).map(([t, n]) => <Pill key={t} tone={REF_TONE[t]}>{TYPE_LABEL[t]}: {n}</Pill>)}
          {!all.length && <span className="text-sm text-muted-foreground">Library</span>}
        </div>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter references" aria-label="Filter references" />
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !all.length ? (
          <EmptyState title="No uploaded references yet" body="Drafts still search live Jira, Confluence and the platform's documents. Add exports here for anything those can't reach." />
        ) : (
          <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
            {shown.map(r => (
              <div key={r.id} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm flex gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-1.5 items-center flex-wrap"><Pill tone={REF_TONE[r.type]}>{TYPE_LABEL[r.type]}</Pill><b>{r.id}</b><span>{r.title}</span></div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.text}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Added by {r.addedByName}</div>
                </div>
                {(isAdmin(user) || r.addedById === user?.id) && (
                  <button type="button" onClick={() => remove(r.id)} aria-label={`Remove ${r.id}`} className="text-muted-foreground hover:text-destructive self-start"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            {!shown.length && <p className="text-sm text-muted-foreground">No references match that filter.</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}
