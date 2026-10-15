// Storage for uploaded originals (DATA_DIR/uploads) and their extracted content
// (DATA_DIR/content). Files are named by server-generated ids only, never by the
// uploader's filename, so a crafted name can't escape the folder.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '@/lib/server/store';

const ID = /^[0-9a-f-]{36}$/;
const EXT = /^[a-z0-9]{1,8}$/;

function safe(id, ext) {
  if (!ID.test(id)) throw new Error('Invalid storage id');
  if (ext !== undefined && !EXT.test(ext)) throw new Error('Invalid extension');
}

const uploadsDir = () => path.join(dataDir(), 'uploads');
const contentDir = () => path.join(dataDir(), 'content');

export function saveUpload(id, ext, buffer) {
  safe(id, ext);
  fs.mkdirSync(uploadsDir(), { recursive: true });
  const key = `${id}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir(), key), buffer);
  return key;
}

export function readUpload(key) {
  const [id, ext] = String(key).split('.');
  safe(id, ext);
  return fs.readFileSync(path.join(uploadsDir(), `${id}.${ext}`));
}

export function deleteUpload(key) {
  if (!key) return;
  const [id, ext] = String(key).split('.');
  safe(id, ext);
  fs.rmSync(path.join(uploadsDir(), `${id}.${ext}`), { force: true });
}

// content = { sections: [{ id, heading, page, text }], charCount, pageCount }
export function saveContent(docId, content) {
  safe(docId);
  fs.mkdirSync(contentDir(), { recursive: true });
  fs.writeFileSync(path.join(contentDir(), `${docId}.json`), JSON.stringify(content));
}

export function readContent(docId) {
  safe(docId);
  const file = path.join(contentDir(), `${docId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function deleteContent(docId) {
  safe(docId);
  fs.rmSync(path.join(contentDir(), `${docId}.json`), { force: true });
}
