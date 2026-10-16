'use client';

// The client's screenshots and videos. Before upload, the browser shrinks each screenshot
// to a JPEG and turns each video into a few evenly spaced stills, so only small images
// are stored and sent to Claude.
import { useRef, useState } from 'react';
import { Film, Paperclip, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LIMITS } from '@/lib/triage';
import { cn } from '@/lib/utils';

// ── preparing files ────────────────────────────────────────
function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('Couldn\'t read an image.'));
    img.src = src;
  });
}

async function toJpeg(source, w, h) {
  const scale = Math.min(1, LIMITS.imageMaxWidth / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  for (const quality of [0.82, 0.6, 0.4]) {
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', quality));
    if (blob && blob.size <= LIMITS.attachmentBytes) return blob;
  }
  throw new Error('An image is too large even after shrinking it.');
}

// Evenly spaced stills from a video, e.g. 3 frames at 25%, 50% and 75%.
function videoFrames(url, n) {
  return new Promise((ok, fail) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    const frames = [];
    let i = 0;
    const next = () => {
      if (i >= n) { v.removeAttribute('src'); v.load(); return ok(frames); }
      v.currentTime = (v.duration * (i + 1)) / (n + 1);
    };
    v.onloadedmetadata = () => (Number.isFinite(v.duration) && v.duration > 0 ? next() : fail(new Error('Couldn\'t read the video length.')));
    v.onseeked = async () => {
      try {
        frames.push({ blob: await toJpeg(v, v.videoWidth, v.videoHeight), at: v.currentTime });
        i++;
        next();
      } catch (e) { fail(e); }
    };
    v.onerror = () => fail(new Error('This video format can\'t be read in the browser.'));
  });
}

export const isMedia = (f) => /^(image|video)\//.test(f.type);

/** Appends the prepared JPEGs to `form` as `files`, with a matching `meta` list. */
export async function appendAttachments(form, files) {
  const meta = [];
  for (const f of files) {
    const url = URL.createObjectURL(f);
    try {
      if (f.type.startsWith('video/')) {
        for (const fr of await videoFrames(url, LIMITS.videoFrames)) {
          form.append('files', fr.blob, 'frame.jpg');
          meta.push({ kind: 'frame', name: f.name || 'video', label: `still at ${fr.at.toFixed(1)}s of video "${f.name || 'video'}"` });
        }
      } else {
        const img = await loadImage(url);
        form.append('files', await toJpeg(img, img.naturalWidth || 960, img.naturalHeight || 540), 'image.jpg');
        meta.push({ kind: 'image', name: f.name || 'pasted-screenshot.png' });
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  form.set('meta', JSON.stringify(meta));
  return form;
}

// Images a set of files will become (a video becomes several stills).
export const preparedCount = (files) => files.reduce((n, f) => n + (f.type.startsWith('video/') ? LIMITS.videoFrames : 1), 0);

// ── drop zone ──────────────────────────────────────────────
export function MediaDrop({ onAdd, big, label }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onAdd([...e.dataTransfer.files]); }}
        className={cn('rounded-lg border-2 border-dashed px-3 text-center text-xs text-muted-foreground transition-colors flex flex-col items-center justify-center gap-1',
          big ? 'w-full py-6' : 'w-36 h-[112px]', over ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
        <Paperclip className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm text-foreground">{label || 'Add screenshots or videos'}</span>
        <span>Drop, click{big ? ', or paste a screenshot with Ctrl+V' : ''}</span>
      </button>
      <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { onAdd([...e.target.files]); e.target.value = ''; }} />
    </>
  );
}

// ── thumbnails ─────────────────────────────────────────────
function Thumb({ src, video, name, caption, onOpen, onRemove }) {
  return (
    <div className="relative w-36 rounded-lg border bg-muted/40 overflow-hidden">
      <button type="button" onClick={onOpen} title={`Open ${name}`} className="block w-full h-[84px] bg-black cursor-zoom-in relative">
        {video && !src ? <span className="absolute inset-0 grid place-items-center text-white"><Film className="w-6 h-6" /></span>
          : <img src={src} alt={name} className="w-full h-full object-cover" />}
        {video && src && <span className="absolute bottom-1 left-1 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1"><Film className="w-3 h-3" /> Video</span>}
      </button>
      <div className="px-2 py-1 text-[11px] text-muted-foreground truncate" title={name}>{caption || name}</div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center hover:bg-destructive">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Files chosen in the browser that haven't been uploaded yet.
export function PendingMedia({ files, onRemove }) {
  const [view, setView] = useState(null);
  return (
    <>
      {files.map((f, i) => (
        <Thumb key={f.url} src={f.file.type.startsWith('video/') ? null : f.url} video={f.file.type.startsWith('video/')} name={f.file.name}
          onOpen={() => setView(f)} onRemove={() => onRemove(i)} />
      ))}
      {view && (
        <Dialog open onOpenChange={(o) => !o && setView(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle className="truncate">{view.file.name}</DialogTitle></DialogHeader>
            {view.file.type.startsWith('video/')
              ? <video src={view.url} controls autoPlay className="w-full max-h-[70vh] rounded-md bg-black" />
              : <img src={view.url} alt={view.file.name} className="w-full max-h-[70vh] object-contain rounded-md bg-white" />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// Stored attachments of a query. A video's stills are grouped under one thumbnail.
export function StoredMedia({ queryId, attachments, onRemove }) {
  const [view, setView] = useState(null);
  const src = (a) => `/api/triage/queries/${queryId}/attachments/${a.id}`;
  const groups = [];
  for (const a of attachments) {
    const g = a.kind === 'frame' && groups.find(x => x.video && x.name === a.name);
    if (g) g.items.push(a);
    else groups.push({ key: a.id, name: a.name, video: a.kind === 'frame', items: [a] });
  }
  return (
    <>
      {groups.map(g => (
        <Thumb key={g.key} src={src(g.items[0])} video={g.video} name={g.name}
          caption={g.video ? `${g.items.length} stills · ${g.name}` : g.name}
          onOpen={() => setView(g)} onRemove={onRemove && (() => onRemove(g.items[0].id))} />
      ))}
      {view && (
        <Dialog open onOpenChange={(o) => !o && setView(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle className="truncate">{view.name}{view.video ? ` · ${view.items.length} stills sent to Claude` : ''}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[75vh] overflow-y-auto">
              {view.items.map(a => (
                <figure key={a.id}>
                  <img src={src(a)} alt={a.label || a.name} className="w-full object-contain rounded-md bg-white" />
                  {view.video && a.label && <figcaption className="text-xs text-muted-foreground mt-1">{a.label}</figcaption>}
                </figure>
              ))}
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setView(null)}>Close</Button></div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
