// Validates an uploaded document and extracts its readable text as sections that keep
// page numbers (PDF) or headings (DOCX, Markdown), so every quiz question can point
// back to where its answer came from. Adapted from steep's lib/quiz/extract.ts.
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const SUPPORTED_TYPES = {
  pdf: { label: 'PDF', mime: 'application/pdf' },
  docx: { label: 'Word (.docx)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  txt: { label: 'Text (.txt)', mime: 'text/plain' },
  md: { label: 'Markdown (.md)', mime: 'text/markdown' },
};
export const ACCEPT = Object.keys(SUPPORTED_TYPES).map(e => `.${e}`).join(',');

export const maxUploadBytes = () => (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;
export const MIN_TEXT_CHARS = 200;
const MAX_TEXT_CHARS = 2_000_000;

export class DocumentError extends Error {
  constructor(message, status = 422, code = 'DOCUMENT_INVALID') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function extensionOf(filename) {
  const name = String(filename || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return ext === 'markdown' ? 'md' : ext;
}

// Keep the display name harmless: no path parts or control characters.
export function cleanFilename(filename) {
  return String(filename || 'document')
    .split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .slice(0, 200) || 'document';
}

// Checks type, size and content signature before anything parses the file.
export function validateUpload({ filename, size, buffer }) {
  const ext = extensionOf(filename);
  if (!SUPPORTED_TYPES[ext]) {
    const allowed = Object.values(SUPPORTED_TYPES).map(t => t.label).join(', ');
    throw new DocumentError(`${ext ? `.${ext} files aren't` : "Files without an extension aren't"} supported. Upload ${allowed}.`, 415, 'UNSUPPORTED_TYPE');
  }
  if (!size || !buffer?.length) throw new DocumentError('The file is empty.', 422, 'EMPTY_FILE');
  const limit = maxUploadBytes();
  if (size > limit) throw new DocumentError(`The file is over ${Math.round(limit / 1048576)} MB. Upload a smaller file or split it.`, 413, 'TOO_LARGE');

  const head = buffer.subarray(0, 8);
  if (ext === 'pdf' && head.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new DocumentError("This file isn't a valid PDF. It may be corrupted or renamed from another format.", 422, 'CORRUPT_FILE');
  }
  if (ext === 'docx' && !(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
    throw new DocumentError("This file isn't a valid Word document. Older .doc files must be saved as .docx first.", 422, 'CORRUPT_FILE');
  }
  if (ext === 'txt' || ext === 'md') {
    if (buffer.subarray(0, 8192).includes(0)) throw new DocumentError('This looks like a binary file, not plain text.', 422, 'CORRUPT_FILE');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new DocumentError('The text file must be UTF-8 encoded. Re-save it as UTF-8 and upload again.', 422, 'BAD_ENCODING');
    }
  }
  return ext;
}

export function normalise(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2') // words hyphenated across a line break
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const htmlToText = (html) => decodeEntities(html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(p|li|tr|div|h[1-6])>/gi, '\n\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' '));

async function pdfSections(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return {
    pageCount: totalPages,
    sections: pages.map((t, i) => ({ heading: null, page: i + 1, text: normalise(t) })),
  };
}

async function docxSections(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const sections = [];
  let current = { heading: null, page: null, parts: [] };
  // Each heading starts a new section; everything until the next heading belongs to it.
  for (const piece of html.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/i)) {
    const heading = piece.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/i);
    if (heading) {
      sections.push(current);
      current = { heading: normalise(htmlToText(heading[1])).slice(0, 200) || null, page: null, parts: [] };
    } else {
      current.parts.push(htmlToText(piece));
    }
  }
  sections.push(current);
  return { pageCount: null, sections: sections.map(s => ({ heading: s.heading, page: null, text: normalise(s.parts.join('\n')) })) };
}

function markdownSections(text) {
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (h) {
      sections.push(current);
      current = { heading: h[1].trim().slice(0, 200), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return {
    pageCount: null,
    sections: sections.map(s => ({ heading: s.heading, page: null, text: normalise(s.lines.join('\n').replace(/[*_`>]+/g, '')) })),
  };
}

// Returns { sections: [{ id, heading, page, text }], charCount, pageCount }.
export async function extractSections(buffer, ext) {
  let result;
  try {
    if (ext === 'pdf') result = await pdfSections(buffer);
    else if (ext === 'docx') result = await docxSections(buffer);
    else result = markdownSections(buffer.toString('utf8'));
  } catch {
    throw new DocumentError(
      ext === 'pdf'
        ? "We couldn't read this PDF. It may be corrupted or password-protected. Re-export it and upload again."
        : "We couldn't read this file. It may be corrupted. Re-save it and upload again.",
      422, 'UNREADABLE',
    );
  }

  let budget = MAX_TEXT_CHARS;
  const sections = result.sections
    .filter(s => s.text)
    .map((s, i) => {
      const text = s.text.slice(0, Math.max(budget, 0));
      budget -= text.length;
      return { id: `s${i + 1}`, heading: s.heading, page: s.page, text };
    })
    .filter(s => s.text);

  const charCount = sections.reduce((n, s) => n + s.text.length, 0);
  if (charCount < MIN_TEXT_CHARS) {
    throw new DocumentError(
      ext === 'pdf'
        ? 'No readable text was found. This looks like a scanned PDF, which needs OCR (not available yet). Upload a text-based PDF, DOCX or TXT instead.'
        : `The document has too little text to build a quiz from (at least ${MIN_TEXT_CHARS} characters are needed).`,
      422, 'NO_TEXT',
    );
  }
  return { sections, charCount, pageCount: result.pageCount };
}

