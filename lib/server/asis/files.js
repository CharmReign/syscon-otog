// Reads the documents a BA attaches to an AS-IS analysis: PDF and Word through the shared
// extractor (with page and heading references), plus plain text, CSV, Excel and
// PowerPoint, and screenshots (JPEGs, shrunk in the browser) that are sent to Claude.
import JSZip from 'jszip';

import { LIMITS } from '@/lib/asis';
import { sourceRef } from '@/lib/levelup';
import { DocumentError, cleanFilename, extensionOf, extractSections, maxUploadBytes, validateUpload } from '@/lib/server/documents/extract';
import { HttpError } from '@/lib/server/http';

const MAX_TEXT = 400_000;
const MAX_PARTS = 200; // sheets or slides
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const numbered = (names, re) => names.filter(n => re.test(n)).sort((a, b) => Number(a.match(re)[1]) - Number(b.match(re)[1])).slice(0, MAX_PARTS);

function utf8(buffer, name) {
  if (buffer.subarray(0, 8192).includes(0)) throw new DocumentError(`${name} looks like a binary file, not text.`, 422, 'CORRUPT_FILE');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    throw new DocumentError(`${name} must be UTF-8 text. Re-save it as UTF-8 and attach it again.`, 422, 'BAD_ENCODING');
  }
}

async function zipOf(buffer, name) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new DocumentError(`${name} isn't a valid Office file. It may be corrupted or an older format.`, 422, 'CORRUPT_FILE');
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentError(`${name} couldn't be opened. Re-save it and attach it again.`, 422, 'UNREADABLE');
  }
}

// Each sheet as rows of comma-separated cell values.
async function xlsxText(buffer, name) {
  const zip = await zipOf(buffer, name);
  const shared = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) {
    for (const si of (await ss.async('string')).match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(decode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const wb = zip.file('xl/workbook.xml');
  const sheetNames = wb ? [...(await wb.async('string')).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => decode(m[1])) : [];
  const out = [];
  let total = 0;
  const sheets = numbered(Object.keys(zip.files), /^xl\/worksheets\/sheet(\d+)\.xml$/);
  for (const [i, file] of sheets.entries()) {
    const xml = await zip.file(file).async('string');
    const rows = [];
    for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
      const cells = (row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).map(c => {
        const type = (c.match(/ t="([^"]+)"/) || [])[1];
        if (type === 'inlineStr') return decode((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v == null) return '';
        return type === 's' ? shared[Number(v)] ?? '' : decode(v);
      });
      if (cells.some(x => x.trim())) rows.push(cells.join(', '));
    }
    const text = `## Sheet: ${sheetNames[i] || i + 1}\n${rows.join('\n')}`;
    out.push(text);
    total += text.length;
    if (total > MAX_TEXT) break;
  }
  return out.join('\n\n');
}

async function pptxText(buffer, name) {
  const zip = await zipOf(buffer, name);
  const out = [];
  for (const [i, file] of numbered(Object.keys(zip.files), /^ppt\/slides\/slide(\d+)\.xml$/).entries()) {
    const xml = await zip.file(file).async('string');
    const paras = xml.split(/<\/a:p>/).map(p => (p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => decode(t.replace(/<\/?a:t>/g, ''))).join('')).filter(Boolean);
    out.push(`## Slide ${i + 1}\n${paras.join('\n')}`);
  }
  return out.join('\n\n');
}

const isFile = (f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0;

// Returns { kind: 'document', name, ext, text, charCount } or { kind: 'image', name, data (base64) }.
export async function readMaterialFile(file) {
  const name = cleanFilename(file.name);
  const ext = extensionOf(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (['jpg', 'jpeg'].includes(ext) || file.type === 'image/jpeg') {
      if (buffer.length > MAX_IMAGE_BYTES) throw new DocumentError(`${name} is over 2 MB.`, 413, 'TOO_LARGE');
      if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw new DocumentError(`${name} isn't a JPEG image.`, 415, 'UNSUPPORTED_TYPE');
      return { kind: 'image', name, data: buffer.toString('base64') };
    }
    if (['doc', 'ppt', 'xls'].includes(ext)) throw new DocumentError(`${name} is an older Office format. Save it as .${ext}x and attach it again.`, 415, 'UNSUPPORTED_TYPE');
    if (buffer.length > maxUploadBytes()) throw new DocumentError(`${name} is over ${Math.round(maxUploadBytes() / 1048576)} MB. Attach a smaller file or split it.`, 413, 'TOO_LARGE');
    let text;
    if (ext === 'txt' || ext === 'md' || ext === 'csv') text = utf8(buffer, name);
    else if (ext === 'xlsx') text = await xlsxText(buffer, name);
    else if (ext === 'pptx') text = await pptxText(buffer, name);
    else if (ext === 'pdf' || ext === 'docx') {
      validateUpload({ filename: file.name, size: buffer.length, buffer });
      const { sections } = await extractSections(buffer, ext).catch((e) => {
        // The shared extractor words this for quizzes; a short Word file just has too little text.
        if (e?.code === 'NO_TEXT' && ext === 'docx') throw new DocumentError('has too little readable text (at least 200 characters are needed).', 422, 'NO_TEXT');
        throw e;
      });
      text = sections.map(s => (s.page || s.heading ? `[${sourceRef(s)}]\n${s.text}` : s.text)).join('\n\n');
    } else {
      throw new DocumentError(`${name}: .${ext || '?'} files aren't supported. Attach PDF, Word, Excel, PowerPoint, CSV, text or images.`, 415, 'UNSUPPORTED_TYPE');
    }
    text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
    if (!text) throw new DocumentError(`${name} has no readable text.`, 422, 'NO_TEXT');
    return { kind: 'document', name, ext, text, charCount: text.length };
  } catch (e) {
    if (e instanceof DocumentError) throw new HttpError(e.status, e.message.startsWith(name) ? e.message : `${name}: ${e.message}`, e.code);
    throw e;
  }
}

export async function readMaterialFiles(files) {
  const list = (files || []).filter(isFile);
  const docs = list.filter(f => !/^image\//.test(f.type) && !/\.(jpe?g)$/i.test(f.name));
  const images = list.filter(f => !docs.includes(f));
  if (docs.length > LIMITS.files) throw new HttpError(400, `Attach at most ${LIMITS.files} documents at a time.`, 'BAD_REQUEST');
  if (images.length > LIMITS.images) throw new HttpError(400, `Attach at most ${LIMITS.images} images at a time.`, 'BAD_REQUEST');
  const out = [];
  for (const f of list) out.push(await readMaterialFile(f));
  return { documents: out.filter(x => x.kind === 'document'), images: out.filter(x => x.kind === 'image') };
}
