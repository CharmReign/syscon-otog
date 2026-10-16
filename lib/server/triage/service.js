// Client Defect Triage: client queries pasted by support agents, with the client's
// screenshots and video stills, and a reviewed reply for each.
//
// Drafting a reply:
//   1. find the closest references: the team's uploaded library (Jira exports, past
//      resolved emails, saved pages), platform documents, and live Jira and Confluence,
//      ranked by keyword (no AI cost);
//   2. send ONLY those few references (and the attachments) to Claude;
//   3. if nothing matched, draft a holding reply with no AI call at all.
// A definite answer must cite a reference; that rule is enforced here, whatever the AI
// returns. Nothing is ever sent to the client and nothing is written to Jira: agents
// approve the reply, copy it, and record that they sent it.
import { v4 as uuidv4 } from 'uuid';

import { isAdmin } from '@/lib/access';
import {
  CATEGORIES, CONFIDENCE, CHANNELS, DRAFT_STATUS, HOLDING, LIMITS, MODULES, SEVERITIES, SOURCE_TYPES,
  composeReply, rankRefs, searchTerms,
} from '@/lib/triage';
import { audit } from '@/lib/server/audit';
import { aiConfigured } from '@/lib/server/ai';
import { draftReply } from '@/lib/server/triage/ai';
import { searchDocuments } from '@/lib/server/documents/search';
import { deleteUpload, readContent, readUpload, saveUpload } from '@/lib/server/files';
import { HttpError, badRequest, notFound, oneOf, str } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';
import { confluenceConfig, jiraConfig } from '@/lib/server/integrations/config';
import { IntegrationError } from '@/lib/server/integrations/http';
import { deleteOne, findAll, findOne, insertOne, updateOne } from '@/lib/server/store';

const QUERIES = 'triageQueries';
const SOURCES = 'triageSources';
const now = () => new Date().toISOString();
const LIVE_RESULTS = 10;      // per live source, re-ranked with the library afterwards
const MAX_LIBRARY = 2000;     // references in the team library
const MAX_SOURCES_PER_CALL = 500;

// ---- queries ----

const draftSummary = (d) => (d ? { category: d.category, status: d.status, draftSeconds: d.draftSeconds, refs: d.refs, confidence: d.confidence } : null);

const summary = (q) => ({
  id: q.id, number: q.number, channel: q.channel, from: q.from, subject: q.subject,
  receivedAt: q.receivedAt, attachments: q.attachments.map(({ id, kind, name }) => ({ id, kind, name })),
  draft: draftSummary(q.draft), createdByName: q.createdByName,
});

export const listQueries = () => findAll(QUERIES).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map(summary);

export function getQuery(id) {
  const q = findOne(QUERIES, id);
  if (!q) throw notFound('Query not found.');
  return q;
}

// Multipart body: channel, from, subject, body, meta (JSON list, one entry per file:
// { kind: 'image' | 'frame', name, label }), files (JPEG, repeatable).
export async function readQueryForm(request) {
  const length = Number(request.headers.get('content-length') || 0);
  const limit = LIMITS.attachmentBytes * LIMITS.attachments + 200_000;
  if (length > limit) throw new HttpError(413, 'The attachments are too large. Remove a few and try again.', 'TOO_LARGE');
  let form;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Send the query as multipart form data.');
  }
  const fields = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') fields[key] = value;
  let meta = [];
  if (fields.meta) {
    try { meta = JSON.parse(fields.meta); } catch { throw badRequest('meta must be a JSON list.'); }
  }
  const files = form.getAll('files').filter(f => f && typeof f === 'object' && typeof f.arrayBuffer === 'function');
  return { fields, files, meta: Array.isArray(meta) ? meta : [] };
}

// Attachments arrive as JPEGs: the browser shrinks screenshots and turns each video
// into a few stills before upload, so only small images are stored and sent to Claude.
async function storeAttachments(files, meta, existing = 0) {
  if (existing + files.length > LIMITS.attachments) throw badRequest(`A query can have at most ${LIMITS.attachments} images (each video counts as ${LIMITS.videoFrames}).`);
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const buffer = Buffer.from(await files[i].arrayBuffer());
    if (buffer.length > LIMITS.attachmentBytes) throw new HttpError(413, 'Each image must be under 2 MB.', 'TOO_LARGE');
    if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw new HttpError(415, 'Attachments must be JPEG images.', 'UNSUPPORTED_TYPE');
    const m = meta[i] || {};
    const id = uuidv4();
    out.push({
      id, key: saveUpload(id, 'jpg', buffer), size: buffer.length,
      kind: m.kind === 'frame' ? 'frame' : 'image',
      name: str(m.name, { field: 'Attachment name', max: 200 }) || 'screenshot.jpg',
      label: str(m.label, { field: 'Attachment label', max: 200 }),
    });
  }
  return out;
}

export async function createQuery(user, { fields = {}, files = [], meta = [] }) {
  const body = str(fields.body, { field: 'Message', max: LIMITS.body });
  if (body.length < 10 && !files.length) throw badRequest('Paste the client\'s message, or attach a screenshot or video.');
  const attachments = await storeAttachments(files, meta);
  const at = now();
  const number = Math.max(0, ...findAll(QUERIES).map(q => q.number || 0)) + 1;
  const q = insertOne(QUERIES, {
    id: uuidv4(), number,
    channel: oneOf(fields.channel, CHANNELS, { field: 'Channel', fallback: 'Email' }),
    from: str(fields.from, { field: 'From', max: 200 }) || 'Client (pasted)',
    subject: str(fields.subject, { field: 'Subject', max: 200 }) || body.slice(0, 60) || 'Client screenshots',
    body, attachments, draft: null, receivedAt: at,
    createdById: user.id, createdByName: user.name, createdAt: at, updatedAt: at,
  });
  audit(user, 'triage.query_created', 'triageQuery', q.id, `Q${number}`);
  return q;
}

const canManage = (user, q) => isAdmin(user) || q.createdById === user.id;

export function deleteQuery(user, id) {
  const q = getQuery(id);
  if (!canManage(user, q)) throw new HttpError(403, 'Only the agent who added this query or an administrator can delete it.', 'FORBIDDEN');
  q.attachments.forEach(a => deleteUpload(a.key));
  deleteOne(QUERIES, id);
  audit(user, 'triage.query_deleted', 'triageQuery', id, `Q${q.number}`);
  return { ok: true };
}

export async function addAttachments(user, id, { files = [], meta = [] }) {
  const q = getQuery(id);
  if (!files.length) throw badRequest('Attach at least one image.');
  const added = await storeAttachments(files, meta, q.attachments.length);
  return updateOne(QUERIES, id, { attachments: [...q.attachments, ...added], updatedAt: now() });
}

// Removes one attachment; for a video, all of its stills go together.
export function removeAttachment(user, id, attachmentId) {
  const q = getQuery(id);
  const a = q.attachments.find(x => x.id === attachmentId);
  if (!a) throw notFound('Attachment not found.');
  const gone = a.kind === 'frame' ? q.attachments.filter(x => x.kind === 'frame' && x.name === a.name) : [a];
  gone.forEach(x => deleteUpload(x.key));
  return updateOne(QUERIES, id, { attachments: q.attachments.filter(x => !gone.includes(x)), updatedAt: now() });
}

export function getAttachment(id, attachmentId) {
  const a = getQuery(id).attachments.find(x => x.id === attachmentId);
  if (!a) throw notFound('Attachment not found.');
  return readUpload(a.key);
}

// ---- references ----

const liveRef = (r) => ({ ...r, live: true });

// Candidates from one live source; a failure is reported, never fatal.
async function liveSearch(name, configured, fn, notes) {
  if (!configured) {
    notes.push(`${name} isn't connected, so it wasn't searched.`);
    return [];
  }
  try {
    return await fn();
  } catch (e) {
    notes.push(`${name} search failed (${e instanceof IntegrationError ? e.message : 'error'}), so it was skipped.`);
    return [];
  }
}

function documentCandidates(terms) {
  return searchDocuments(terms.join(' '), { limit: LIVE_RESULTS }).map((h, i) => {
    const section = readContent(h.documentId)?.sections?.find(s => s.id === h.sectionId);
    return {
      id: `DOC-${i + 1}`, type: 'Document', title: `${h.documentTitle} · ${h.ref}`,
      text: (section?.text || h.snippet).slice(0, LIMITS.sourceChars),
      url: `/modules/level-up/materials/${h.documentId}#${h.sectionId}`, live: true,
    };
  });
}

/**
 * The closest references for a query, best first: { matches: [{ ref, score, hits }], notes }.
 * With `full`, live Jira and Confluence matches are re-read so Claude sees the page or
 * issue description, not just the search snippet.
 */
export async function findReferences(q, { full = false } = {}) {
  const notes = [];
  const terms = searchTerms(q);
  const library = findAll(SOURCES).map(({ id, type, title, text, url }) => ({ id, type, title, text, url }));
  if (!terms.length) return { matches: rankRefs(q, library), notes };

  const [jira, confluence] = await Promise.all([
    liveSearch('Jira', jiraConfig().configured, async () => (await getClient('jira').search({ anyTerms: terms, limit: LIVE_RESULTS })).issues.map(i => liveRef({
      id: i.key, type: 'Jira', title: i.summary, url: i.url,
      text: [i.status && `Status: ${i.status}`, i.priority && `Priority: ${i.priority}`, i.components.length && `Components: ${i.components.join(', ')}`].filter(Boolean).join('. '),
    })), notes),
    liveSearch('Confluence', confluenceConfig().configured, async () => (await getClient('confluence').search({ anyTerms: terms, limit: LIVE_RESULTS })).results.map(p => liveRef({
      id: `CF-${p.id}`, pageId: p.id, type: 'Confluence', title: p.title, text: p.excerpt || '', url: p.url,
    })), notes),
  ]);

  // A live copy wins over an older export with the same id.
  const byId = new Map(library.map(r => [r.id, r]));
  [...documentCandidates(terms), ...jira, ...confluence].forEach(r => byId.set(r.id, r));
  const matches = rankRefs(q, [...byId.values()]);
  if (full) await Promise.all(matches.map(m => enrich(m)));
  return { matches, notes };
}

async function enrich(m) {
  const r = m.ref;
  try {
    if (r.live && r.type === 'Confluence' && r.pageId) {
      const page = await getClient('confluence').getPage(r.pageId);
      m.ref = { ...r, text: page.text.slice(0, LIMITS.sourceChars) || r.text };
    } else if (r.live && r.type === 'Jira') {
      const issue = await getClient('jira').getIssue(r.id);
      m.ref = { ...r, text: [r.text, issue.description].filter(Boolean).join('. ').slice(0, LIMITS.sourceChars) };
    }
  } catch {
    // Keep the search snippet.
  }
}

const matchSummary = ({ ref, hits }) => ({ id: ref.id, type: ref.type, title: ref.title, url: ref.url || '', live: Boolean(ref.live), hits });

export async function previewReferences(id) {
  const { matches, notes } = await findReferences(getQuery(id));
  return { matches: matches.map(matchSummary), notes };
}

// ---- drafting ----

const clean = (s, max = 2000) => String(s ?? '').trim().slice(0, max);
const cleanList = (items, n = 8, max = 600) => (Array.isArray(items) ? items.map(x => clean(x, max)).filter(Boolean).slice(0, n) : []);

const holding = (module, note) => ({
  category: HOLDING, confidence: 'Low', module, answer: '', steps: [], resolution: '', refs: [],
  note, escalate: 'BA team / product owner', jira: null,
});

// Applies the rules whatever the AI returned: known categories and fields only, cited
// ids must be references it was given, and a definite answer must cite something.
export function cleanDraft(v, allowedIds) {
  if (!v || typeof v !== 'object') return null;
  const category = CATEGORIES[v.category] ? v.category : 'Needs more info';
  const module = MODULES.includes(v.module) ? v.module : 'Other / Unclear';
  const refs = [...new Set((Array.isArray(v.refs) ? v.refs : []).filter(id => allowedIds.has(id)))];
  if (['How-to', 'Expected behaviour', 'Known issue with workaround'].includes(category) && !refs.length) {
    return holding(module, 'Claude drafted an answer without citing a reference, so it was replaced with a holding reply.');
  }
  if (category === HOLDING) return { ...holding(module, clean(v.note, 1000)), escalate: clean(v.escalate, 120) || 'BA team / product owner' };
  const j = v.jira && (v.raiseJira || category === 'New defect') && clean(v.jira.summary) ? v.jira : null;
  return {
    category,
    confidence: CONFIDENCE.includes(v.confidence) ? v.confidence : 'Medium',
    module,
    answer: clean(v.answer), steps: cleanList(v.steps), resolution: clean(v.resolution), refs,
    note: clean(v.note, 1000),
    escalate: null,
    jira: j ? {
      summary: clean(j.summary, 255), severity: SEVERITIES.includes(j.severity) ? j.severity : 'Medium',
      environment: clean(j.environment, 500), steps: cleanList(j.steps, 15),
      expected: clean(j.expected), actual: clean(j.actual), impact: clean(j.impact),
      workaround: clean(j.workaround), missingInfo: cleanList(j.missingInfo, 8, 300),
    } : null,
  };
}

// The images Claude sees: up to 4 screenshots plus every video still, with a label each.
function imagesFor(q) {
  const shots = q.attachments.filter(a => a.kind === 'image').slice(0, LIMITS.imagesToAi);
  const frames = q.attachments.filter(a => a.kind === 'frame');
  return [...shots, ...frames].map(a => ({
    label: a.kind === 'frame' ? (a.label || `still from video "${a.name}"`) : `screenshot "${a.name}"`,
    data: readUpload(a.key).toString('base64'),
  }));
}

export async function draftQuery(user, id) {
  const started = Date.now();
  const q = getQuery(id);
  const { matches, notes } = await findReferences(q, { full: true });
  let draft;
  let images = [];
  if (!matches.length) {
    // Nothing matched anywhere: holding reply, no AI call needed.
    draft = holding('Other / Unclear', 'No reference matched this query, so no AI call was made. Ask a BA or the product owner, then add the answer to Confluence or the Knowledge sources tab.');
  } else {
    if (!aiConfigured()) {
      throw new HttpError(503, 'Drafting needs a Claude API key (ANTHROPIC_API_KEY) on the server. The closest references are still listed.', 'AI_NOT_CONFIGURED');
    }
    images = imagesFor(q);
    let raw;
    try {
      raw = await draftReply({ query: q, refs: matches.map(m => m.ref), images });
    } catch (e) {
      console.error('[triage] draft failed:', e?.message);
      throw new HttpError(502, `The draft didn't complete (${e?.message || 'unknown error'}). Try again.`, 'AI_FAILED');
    }
    draft = cleanDraft(raw, new Set(matches.map(m => m.ref.id)));
    if (!draft) throw new HttpError(502, 'Claude\'s answer didn\'t match the expected shape. Try again.', 'AI_FAILED');
  }

  // Keep a copy of each cited source, so live results stay viewable later.
  const cited = draft.refs.map(rid => matches.find(m => m.ref.id === rid)?.ref).filter(Boolean)
    .map(({ id: rid, type, title, text, url }) => ({ id: rid, type, title, text: clean(text, LIMITS.refCharsToAi), url: url || '' }));
  const full = {
    ...draft,
    citedRefs: cited,
    matches: matches.map(matchSummary),
    searchNotes: notes,
    imagesSent: images.length,
    source: matches.length ? 'Claude' : 'No match',
    reply: composeReply(q, draft),
    status: 'Draft',
    draftSeconds: Math.max(1, Math.round((Date.now() - started) / 1000)),
    draftedAt: now(), draftedByName: user.name,
    approvedAt: null, approvedByName: null, sentAt: null, sentByName: null,
  };
  const updated = updateOne(QUERIES, id, { draft: full, updatedAt: now() });
  audit(user, 'triage.drafted', 'triageQuery', id, `Q${q.number}: ${draft.category}`);
  return updated;
}

// Body: { reply?, status? }. Editing the reply of an approved draft returns it to Draft;
// a sent reply stays Sent.
export function reviewQuery(user, id, body) {
  const q = getQuery(id);
  if (!q.draft) throw new HttpError(409, 'Draft a reply first.', 'NOT_DRAFTED');
  const d = { ...q.draft };
  const at = now();
  if (body.reply !== undefined) {
    d.reply = str(body.reply, { field: 'Reply', required: true, max: 20_000 });
    if (d.status === 'Approved' && body.status === undefined) d.status = 'Draft';
  }
  if (body.status !== undefined && body.status !== d.status) {
    d.status = oneOf(body.status, DRAFT_STATUS, { field: 'Status' });
    if (d.status === 'Approved') Object.assign(d, { approvedAt: at, approvedByName: user.name });
    if (d.status === 'Sent') Object.assign(d, { sentAt: at, sentByName: user.name, approvedAt: d.approvedAt || at, approvedByName: d.approvedByName || user.name });
    audit(user, `triage.${d.status.toLowerCase()}`, 'triageQuery', id, `Q${q.number}`);
  }
  return updateOne(QUERIES, id, { draft: d, updatedAt: at });
}

// ---- knowledge library ----

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/;
const PREFIX = { Confluence: 'CF', Jira: 'JIRA', Email: 'EM' };

export const listSources = () => findAll(SOURCES).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

// Body: { items: [{ id?, type, title, text, url? }] }. Adds new references and replaces
// ones with the same id, so re-importing a newer export updates the library.
export function addSources(user, body) {
  const items = body?.items;
  if (!Array.isArray(items) || !items.length) throw badRequest('Add at least one reference.');
  if (items.length > MAX_SOURCES_PER_CALL) throw badRequest(`Add at most ${MAX_SOURCES_PER_CALL} references at a time.`);
  const existing = new Set(findAll(SOURCES).map(s => s.id));
  const taken = new Set(existing);
  const nextId = (type) => {
    let n = 1;
    while (taken.has(`${PREFIX[type]}-${n}`)) n++;
    return `${PREFIX[type]}-${n}`;
  };
  const at = now();
  const rows = items.map(r => {
    const type = oneOf(r?.type, SOURCE_TYPES, { field: 'Reference type' });
    let id = str(r.id, { field: 'Reference id', max: 60 });
    if (id && !SOURCE_ID.test(id)) throw badRequest(`"${id}" isn't a valid reference id. Use letters, digits and dashes, e.g. DR-123.`);
    if (!id) id = nextId(type);
    taken.add(id);
    let url = str(r.url, { field: 'Reference URL', max: 1000 });
    if (url && !/^https?:\/\//i.test(url)) url = '';
    return {
      id, type, url,
      title: str(r.title, { field: 'Reference title', required: true, max: 300 }),
      text: str(r.text, { field: 'Reference text', required: true, max: LIMITS.sourceChars }),
      addedById: user.id, addedByName: user.name, addedAt: at,
    };
  });
  const added = rows.filter(r => !existing.has(r.id)).length;
  if (existing.size + added > MAX_LIBRARY) throw badRequest(`The library can hold at most ${MAX_LIBRARY} references. Remove some first.`);
  for (const r of rows) {
    if (existing.has(r.id)) updateOne(SOURCES, r.id, r);
    else insertOne(SOURCES, r);
  }
  audit(user, 'triage.sources_added', 'triageSource', rows[0].id, `${rows.length} reference(s)`);
  return { added, updated: rows.length - added, sources: listSources() };
}

export function removeSource(user, id) {
  const s = findOne(SOURCES, id);
  if (!s) throw notFound('Reference not found.');
  if (!isAdmin(user) && s.addedById !== user.id) throw new HttpError(403, 'Only the person who added this reference or an administrator can remove it.', 'FORBIDDEN');
  deleteOne(SOURCES, id);
  audit(user, 'triage.source_removed', 'triageSource', id, s.title);
  return { ok: true };
}

// ---- "before" numbers for the Results tab ----

const BASELINE_ID = 'baseline';
const DEFAULT_BASELINE = { hours: 26, devShare: 60 };

export function getBaseline() {
  const b = findOne('triageSettings', BASELINE_ID);
  return b ? { hours: b.hours, devShare: b.devShare, updatedByName: b.updatedByName, updatedAt: b.updatedAt } : { ...DEFAULT_BASELINE };
}

export function setBaseline(user, body) {
  const num = (v, field, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw badRequest(`${field} must be a number from 0 to ${max}.`);
    return Math.round(n * 10) / 10;
  };
  const record = {
    hours: num(body.hours, 'Hours to first response', 10_000),
    devShare: num(body.devShare, 'Share reaching a developer', 100),
    updatedByName: user.name, updatedAt: now(),
  };
  if (findOne('triageSettings', BASELINE_ID)) updateOne('triageSettings', BASELINE_ID, record);
  else insertOne('triageSettings', { id: BASELINE_ID, ...record });
  return getBaseline();
}
