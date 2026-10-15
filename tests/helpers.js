// Test helpers: an isolated data folder per suite, signed-in requests, and generated
// PDF/DOCX fixtures (built here so the repo needs no binary test files).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';

import { _resetCache, insertOne } from '@/lib/server/store';
import { SESSION_COOKIE, createSessionToken, hashPassword } from '@/lib/server/auth';

export function useTempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otog-test-'));
  process.env.DATA_DIR = dir;
  process.env.SEED_DEMO_USERS = 'false';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.QUIZ_GENERATOR = 'offline';
  _resetCache();
  return dir;
}

export function createUser(role, name = `${role} user`) {
  return insertOne('users', {
    id: uuidv4(), username: `${role.toLowerCase()}-${uuidv4().slice(0, 6)}`, name, email: '', role,
    passwordHash: hashPassword('pw-123456'), createdAt: new Date().toISOString(),
  });
}

// Builds a Request the way the browser would send it, signed in as `user` (or anonymous).
export function req(url, { method = 'GET', user, body, form } = {}) {
  const headers = new Headers();
  if (user) headers.set('cookie', `${SESSION_COOKIE}=${createSessionToken(user.id)}`);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, { method, headers, body: payload });
}

export const ctx = (params) => ({ params: Promise.resolve(params) });

export async function call(handler, request, params) {
  const res = await handler(request, ctx(params || {}));
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export function uploadForm(file, fields = {}) {
  const form = new FormData();
  if (file) form.set('file', file);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

// ---- fixtures ----

export const SUPPORT_TEXT = `# Ticket Triage Procedure

The support desk triages every new client ticket within 4 hours of it being logged. Tickets are classified by severity before any investigation starts. A Severity 1 ticket means the Offender Management system is unavailable for every user at the site.

# Escalation Rules

Severity 1 tickets are escalated to the Duty Manager immediately after classification. The Duty Manager informs the client account lead within 30 minutes of the escalation. Severity 2 tickets are reviewed by the Product Specialist on the next business morning.

# Release Verification

Every release candidate passes the Sanity Checklist before deployment to production. The Release Coordinator records each failed check in Jira with the label sanity-fail. Deployment is blocked while any check marked Critical remains open.

# Knowledge Articles

Resolved tickets that required more than 2 hours of investigation must be written up as a Confluence knowledge article. Each article names the affected Product Module and lists the verified workaround. Articles are reviewed by the Knowledge Coordinator every quarter.`;

export const textFile = (text = SUPPORT_TEXT, name = 'support-procedure.md') =>
  new File([text], name, { type: 'text/markdown' });

// Minimal valid PDF with one text page per entry in `pages`.
export function makePdf(pages) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const text of pages) {
    const lines = text.match(/.{1,80}(\s|$)/g) || [text];
    const stream = `BT /F1 11 Tf 14 TL 50 760 Td ${lines.map(l => `(${l.trim().replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ')} ET`;
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Minimal .docx: blocks are { heading } or { text }.
export async function makeDocx(blocks) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = blocks.map(b => b.heading
    ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${esc(b.heading)}</w:t></w:r></w:p>`
    : `<w:p><w:r><w:t xml:space="preserve">${esc(b.text)}</w:t></w:r></w:p>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
