// Storage for uploaded originals and their extracted content. With MONGODB_URI set they
// live in the `uploads` and `contents` collections (content gzipped, to stay well under
// MongoDB's 16 MB document limit); otherwise in DATA_DIR/uploads and DATA_DIR/content.
// Files are named by server-generated ids only, never by the uploader's filename, so a
// crafted name can't escape the folder.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Binary } from 'mongodb';

import { mongoDb, mongoEnabled } from '@/lib/server/mongo';
import { dataDir } from '@/lib/server/store';

const ID = /^[0-9a-f-]{36}$/;
const EXT = /^[a-z0-9]{1,8}$/;

function safe(id, ext) {
  if (!ID.test(id)) throw new Error('Invalid storage id');
  if (ext !== undefined && !EXT.test(ext)) throw new Error('Invalid extension');
}

function parseKey(key) {
  const [id, ext] = String(key).split('.');
  safe(id, ext);
  return `${id}.${ext}`;
}

const uploadsDir = () => path.join(dataDir(), 'uploads');
const contentDir = () => path.join(dataDir(), 'content');
const blobs = async (name) => (await mongoDb()).collection(name);
const bytes = (doc) => (doc ? Buffer.from(doc.data.buffer) : null);

export async function saveUpload(id, ext, buffer) {
  safe(id, ext);
  const key = `${id}.${ext}`;
  if (mongoEnabled()) {
    await (await blobs('uploads')).replaceOne({ _id: key }, { data: new Binary(buffer) }, { upsert: true });
    return key;
  }
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir(), key), buffer);
  return key;
}

export async function readUpload(key) {
  const name = parseKey(key);
  if (mongoEnabled()) {
    const buffer = bytes(await (await blobs('uploads')).findOne({ _id: name }));
    if (!buffer) throw new Error(`Upload ${name} is missing`);
    return buffer;
  }
  return fs.readFileSync(path.join(uploadsDir(), name));
}

export async function deleteUpload(key) {
  if (!key) return;
  const name = parseKey(key);
  if (mongoEnabled()) {
    await (await blobs('uploads')).deleteOne({ _id: name });
    return;
  }
  fs.rmSync(path.join(uploadsDir(), name), { force: true });
}

// content = { sections: [{ id, heading, page, text }], charCount, pageCount }
export async function saveContent(docId, content) {
  safe(docId);
  if (mongoEnabled()) {
    const data = new Binary(zlib.gzipSync(JSON.stringify(content)));
    await (await blobs('contents')).replaceOne({ _id: docId }, { data }, { upsert: true });
    return;
  }
  fs.mkdirSync(contentDir(), { recursive: true });
  fs.writeFileSync(path.join(contentDir(), `${docId}.json`), JSON.stringify(content));
}

export async function readContent(docId) {
  safe(docId);
  if (mongoEnabled()) {
    const buffer = bytes(await (await blobs('contents')).findOne({ _id: docId }));
    return buffer ? JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) : null;
  }
  const file = path.join(contentDir(), `${docId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export async function deleteContent(docId) {
  safe(docId);
  if (mongoEnabled()) {
    await (await blobs('contents')).deleteOne({ _id: docId });
    return;
  }
  fs.rmSync(path.join(contentDir(), `${docId}.json`), { force: true });
}
