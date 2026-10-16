'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { selectClass } from '@/components/otog/confirm';
import { Panel } from '@/components/otog/ui';
import { MediaDrop, PendingMedia, appendAttachments, isMedia, preparedCount } from '@/components/triage/attachments';
import { api } from '@/lib/api-client';
import { CHANNELS, LIMITS } from '@/lib/triage';

const EMPTY = { channel: 'Email', from: '', subject: '', body: '' };

export function NewQuery({ onAdded }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [media, setMedia] = useState([]); // [{ file, url }]
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Release preview URLs when the form unmounts (removals release their own).
  const mediaRef = useRef(media);
  mediaRef.current = media;
  useEffect(() => () => mediaRef.current.forEach(m => URL.revokeObjectURL(m.url)), []);
  const clearMedia = (keep = () => false) => setMedia(list => list.filter((m, i) => keep(m, i) || (URL.revokeObjectURL(m.url), false)));

  const add = (files) => {
    const list = files.filter(isMedia);
    if (!list.length) return toast.error('Only images and videos can be attached.');
    if (preparedCount([...media.map(m => m.file), ...list]) > LIMITS.attachments) {
      return toast.error(`Attach at most ${LIMITS.attachments} images (each video counts as ${LIMITS.videoFrames}).`);
    }
    setMedia(m => [...m, ...list.map(file => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const ok = form.body.trim().length >= 10 || media.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.set(k, v));
      await appendAttachments(data, media.map(m => m.file));
      const { query } = await api('triage/queries', { method: 'POST', body: data });
      queryClient.invalidateQueries({ queryKey: ['triage/queries'] });
      setForm(EMPTY);
      clearMedia();
      toast.success(`Added Q${query.number} to the inbox`);
      onAdded(query.id);
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  return (
    // Pasting a screenshot anywhere in the form (Ctrl+V) attaches it.
    <form onSubmit={submit} onPaste={(e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); add(files); }
    }}>
      <Panel title="Paste a client email or chat" className="space-y-4">
        <p className="text-sm text-muted-foreground">Remove names, IDs and anything confidential before pasting, until the team confirms client data may go to an AI service. The same goes for screenshots and videos.</p>
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
          <Field label="Channel" id="nq-channel">
            <select id="nq-channel" value={form.channel} onChange={(e) => set('channel', e.target.value)} className={`${selectClass} w-full`}>
              {CHANNELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="From (role, site)" id="nq-from"><Input id="nq-from" value={form.from} onChange={(e) => set('from', e.target.value)} placeholder="e.g. Records supervisor, Yatala Labour Prison" maxLength={200} /></Field>
          <Field label="Subject" id="nq-subject"><Input id="nq-subject" value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Short summary" maxLength={200} /></Field>
        </div>
        <Field label="Message" id="nq-body"><Textarea id="nq-body" value={form.body} onChange={(e) => set('body', e.target.value)} rows={8} placeholder="Paste the client's message here" maxLength={LIMITS.body} /></Field>
        <div>
          <div className="text-sm font-medium mb-1.5">Screenshots and videos from the client</div>
          <div className="flex flex-wrap gap-2.5">
            <PendingMedia files={media} onRemove={(i) => clearMedia((_, j) => j !== i)} />
            <MediaDrop onAdd={add} big={!media.length} label={media.length ? 'Add more' : undefined} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Screenshots are shrunk and each video is sent as {LIMITS.videoFrames} stills, so every draft stays small.</p>
        </div>
        <Button type="submit" disabled={!ok || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add to inbox</Button>
      </Panel>
    </form>
  );
}

const Field = ({ label, id, children }) => (
  <div>
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <div className="mt-1">{children}</div>
  </div>
);
