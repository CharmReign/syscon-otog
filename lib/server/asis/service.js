// AS-IS Navigator projects: a persistent, versioned knowledge base per analysis project,
// and the TO-BE design built from it.
//   Sources    the intake creates the baseline (KB v1.0) once; after that, Add knowledge
//              adds versions (v1.1, v1.2 …) and records what changed in each.
//   Findings   classified by certainty. Open items: decisions and questions.
//   Design     Super-Agent 2's TO-BE process, editable, with the version it replaced.
//   Template   the BA's Word template, filled in the browser with content written here.
// Every AI step can run on the demo script instead of Claude (see demo.js).
//
// Certainty rules (enforced here, whatever the AI returns):
// - Only a person, or new knowledge classified CONFIRMED, can make a finding CONFIRMED
//   or answer a question for good; other knowledge records the answer as PENDING.
// - Knowledge that isn't CONFIRMED can't retire a finding; a contradiction from it marks
//   the finding CONFLICTING for someone to review instead of SUPERSEDED.
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import { isAdmin } from '@/lib/access';
import {
  CLASSIFICATIONS, DECISION_STATUS, FINDING_STATUS, GAP_PRIORITY, ITEM_KINDS, LIMITS, PASTE_SOURCES, SOURCE_KINDS,
  isOpenItem, nextVersion, toBeFileName,
} from '@/lib/asis';
import { DESIGN_CHANGE, TRACE_STATUS, designModel, normalizeDesign } from '@/lib/asis-design';
import { audit } from '@/lib/server/audit';
import { aiConfigured } from '@/lib/server/ai';
import { analyseIntake, analyseUpdate, designProcess, fillTemplate } from '@/lib/server/asis/ai';
import { demoDesign, demoFill, demoIntake, demoUpdate } from '@/lib/server/asis/demo';
import { designDocx } from '@/lib/server/asis/docx';
import { readMaterialFiles } from '@/lib/server/asis/files';
import { cleanFilename, extensionOf, maxUploadBytes } from '@/lib/server/documents/extract';
import { deleteUpload, readUpload, saveUpload } from '@/lib/server/files';
import { HttpError, badRequest, notFound, oneOf, str } from '@/lib/server/http';
import { deleteOne, findAll, findOne, insertOne, updateOne } from '@/lib/server/store';

const COLLECTION = 'asisProjects';
const SCHEMA = 2;
const now = () => new Date().toISOString();
const clean = (s, max = 2000) => String(s ?? '').trim().slice(0, max);
const cleanList = (items, max = 1000, count = 12) => (Array.isArray(items) ? items.map(x => clean(x, max)).filter(Boolean).slice(0, count) : []);
const conflict = (message, code) => new HttpError(409, message, code);

// ---- shape and migration ----

// Projects saved before open items, per-version changes and the TO-BE design are
// upgraded the first time they're read.
export function normalizeProject(p) {
  if (p.schema === SCHEMA) return p;
  const q = { ...p };
  const raisedAt = q.analysis?.analysedAt || q.createdAt;
  q.decisions = (q.decisions || []).map(d => ({ kind: 'DECISION', outcome: '', raisedIn: null, ...d }));
  const questions = q.analysis?.questions || [];
  if (questions.length) {
    q.decisions.push(...questions.map(t => ({
      id: uuidv4(), kind: 'QUESTION', title: clean(t, LIMITS.itemTitle), description: '', position: '', outcome: '', owner: '',
      status: 'OPEN', raisedAt, raisedIn: 'v1.0', updatedAt: raisedAt, updatedByName: 'AI analysis',
    })));
  }
  if (q.analysis) {
    const { questions: _q, ...rest } = q.analysis;
    q.analysis = { refreshedIn: 'v1.0', ...rest };
  }
  q.versionHistory = (q.versionHistory || []).map(v => (q.changes && v.version === q.changes.version && !v.changes ? { ...v, changes: q.changes, classification: q.changes.classification, context: q.changes.context } : v));
  q.changes = null;
  q.deletedItems ||= [];
  q.design ||= null;
  q.designPrev ||= null;
  q.toBeTemplate ||= null;
  q.toBeFileName ||= '';
  q.schema = SCHEMA;
  return q;
}

// What the API returns: no storage keys, and the template outline and cached template
// content (which can be large) reduced to what the page shows.
export function publicProject(p) {
  const { toBeTemplate: t, design: d, designPrev, ...rest } = p;
  const strip = (x) => x && { ...x, templateFill: x.templateFill ? { key: x.templateFill.key, parts: Object.keys(x.templateFill.parts || {}).length } : null };
  return {
    ...rest,
    design: strip(d),
    designPrev: designPrev ? { basedOnKb: designPrev.basedOnKb, generatedAt: designPrev.generatedAt } : null,
    toBeTemplate: t && {
      id: t.id, name: t.name, size: t.size, uploadedAt: t.uploadedAt, uploadedByName: t.uploadedByName,
      sectionCount: t.sectionCount, tableCount: t.tableCount, headings: t.headings, batchCount: t.batches.length,
    },
  };
}

// ---- projects ----

const summary = (p) => ({
  id: p.id, name: p.name, module: p.module, version: p.version,
  sourceCount: (p.sources || []).length,
  findingCounts: Object.fromEntries(FINDING_STATUS.map(s => [s, (p.findings || []).filter(f => f.status === s).length])),
  openItems: (p.decisions || []).filter(isOpenItem).length + (p.schema === SCHEMA ? 0 : (p.analysis?.questions || []).length),
  analysed: Boolean(p.analysis), designed: Boolean(p.design), createdByName: p.createdByName, createdAt: p.createdAt, updatedAt: p.updatedAt,
});

export const listProjects = async () => (await findAll(COLLECTION)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary);

export async function getProject(id) {
  const p = await findOne(COLLECTION, id);
  if (!p) throw notFound('Project not found.');
  if (p.schema === SCHEMA) return p;
  return updateOne(COLLECTION, id, normalizeProject(p));
}

export async function createProject(user, body) {
  const at = now();
  const p = await insertOne(COLLECTION, {
    id: uuidv4(),
    schema: SCHEMA,
    name: str(body.name, { field: 'Project name', required: true, max: LIMITS.name }),
    module: str(body.module, { field: 'Module / process', max: LIMITS.module }),
    notes: str(body.notes, { field: 'Notes', max: LIMITS.notes }),
    version: '1.0',
    versionHistory: [{ version: '1.0', note: 'Project created', at, byName: user.name }],
    intake: { problem: '', currentState: '', pains: [], otherPains: '', pasted: '', pastedSources: [] },
    sources: [], findings: [], decisions: [], deletedItems: [], analysis: null, changes: null,
    design: null, designPrev: null, toBeTemplate: null, toBeFileName: '',
    createdById: user.id, createdByName: user.name, createdAt: at, updatedAt: at,
  });
  await audit(user, 'asis.project_created', 'asisProject', p.id, p.name);
  return p;
}

function intakeFrom(body, current = {}) {
  const pains = body.pains === undefined ? current.pains || [] : body.pains;
  if (!Array.isArray(pains) || pains.length > 30) throw badRequest('pains must be a list of up to 30 items.');
  const sources = body.pastedSources === undefined ? current.pastedSources || [] : body.pastedSources;
  if (!Array.isArray(sources)) throw badRequest('pastedSources must be a list.');
  const field = (key, label) => (body[key] === undefined ? current[key] || '' : str(body[key], { field: label, max: LIMITS[key] }));
  return {
    problem: field('problem', 'Problem statement'),
    currentState: field('currentState', 'Current state'),
    pains: [...new Set(pains.map(x => str(x, { field: 'Pain point', max: 120 })).filter(Boolean))],
    otherPains: field('otherPains', 'Other pain points'),
    pasted: field('pasted', 'Pasted content'),
    pastedSources: sources.filter(s => PASTE_SOURCES.includes(s)),
  };
}

export async function updateProject(user, id, body) {
  const p = await getProject(id);
  const patch = { updatedAt: now() };
  if (body.name !== undefined) patch.name = str(body.name, { field: 'Project name', required: true, max: LIMITS.name });
  if (body.module !== undefined) patch.module = str(body.module, { field: 'Module / process', max: LIMITS.module });
  if (body.notes !== undefined) patch.notes = str(body.notes, { field: 'Notes', max: LIMITS.notes });
  if (body.toBeFileName !== undefined) patch.toBeFileName = str(body.toBeFileName, { field: 'Word file name', max: LIMITS.fileName });
  if (body.intake !== undefined) {
    if (p.analysis) throw conflict('The baseline already exists. Add new information with Add knowledge.', 'BASELINE_EXISTS');
    patch.intake = { ...p.intake, ...intakeFrom(body.intake || {}, p.intake) };
  }
  return updateOne(COLLECTION, id, patch);
}

export async function deleteProject(user, id) {
  const p = await getProject(id);
  if (!isAdmin(user) && p.createdById !== user.id) throw new HttpError(403, 'Only the project creator or an administrator can delete it.', 'FORBIDDEN');
  await deleteOne(COLLECTION, id);
  if (p.toBeTemplate?.storageKey) await deleteUpload(p.toBeTemplate.storageKey).catch(() => {});
  await audit(user, 'asis.project_deleted', 'asisProject', id, p.name);
  return { ok: true };
}

// ---- material for analysis ----

const isFile = (f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0;
const truthy = (v) => v === true || v === '1' || v === 'true';

// Reads the multipart body of an analysis request: text fields and `files`. List fields
// (pains, pastedSources, references) arrive as JSON text.
export async function readAnalysisForm(request) {
  const length = Number(request.headers.get('content-length') || 0);
  const limit = maxUploadBytes() * 5;
  if (length > limit) throw new HttpError(413, `The upload is over ${Math.round(limit / 1048576)} MB in total. Add fewer or smaller documents.`, 'TOO_LARGE');
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Send the analysis as multipart form data.', 'BAD_REQUEST');
  }
  const fields = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && key !== 'files') fields[key] = value;
  }
  for (const key of ['pains', 'pastedSources']) {
    if (fields[key] === undefined) continue;
    try { fields[key] = JSON.parse(fields[key]); } catch { throw badRequest(`${key} must be a JSON list.`); }
  }
  return { fields, files: form.getAll('files').filter(isFile), file: form.get('file') };
}

function parseReferences(raw) {
  if (raw == null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { throw badRequest('references must be a JSON list.'); }
  }
  if (!Array.isArray(list) || list.length > LIMITS.references) throw badRequest(`Include at most ${LIMITS.references} references.`);
  return list.map(r => {
    const source = oneOf(r?.source, [SOURCE_KINDS.INTERNAL, SOURCE_KINDS.CONFLUENCE, SOURCE_KINDS.JIRA], { field: 'Reference source' });
    let url = str(r.url, { field: 'Reference URL', max: 1000 });
    // External links must be http(s); in-app links must be same-origin paths.
    if (url && !/^https?:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) url = '';
    return {
      source,
      title: str(r.title, { field: 'Reference title', required: true, max: 300 }),
      ref: str(r.ref, { field: 'Reference location', max: 300 }),
      url,
      text: str(r.text, { field: 'Reference text', max: LIMITS.referenceChars }),
    };
  });
}

async function collectMaterial({ files, references, pasted = '', pastedSources = [], notes = '' }) {
  const { documents, images } = await readMaterialFiles(files);
  return { documents, images, references: parseReferences(references), pasted, pastedSources, notes };
}

const materialEmpty = (m) => !m.documents.length && !m.images.length && !m.references.length && !m.pasted && !m.notes;

function newSources(user, material, version) {
  const at = now();
  const base = { addedAt: at, version: `v${version}`, addedByName: user.name };
  return [
    ...material.documents.map(d => ({ id: uuidv4(), kind: SOURCE_KINDS.DOCUMENT, name: d.name, detail: d.ext.toUpperCase(), url: '', excerpt: d.text.slice(0, 1200), charCount: d.charCount, ...base })),
    ...material.images.map(im => ({ id: uuidv4(), kind: SOURCE_KINDS.IMAGE, name: im.name, detail: 'Image, sent to Claude', url: '', excerpt: '', charCount: 0, ...base })),
    ...material.references.map(r => ({ id: uuidv4(), kind: r.source, name: r.title, detail: r.ref, url: r.url, excerpt: r.text.slice(0, 1200), charCount: r.text.length, ...base })),
    ...(material.pasted ? [{
      id: uuidv4(), kind: SOURCE_KINDS.PASTED, name: `Pasted content${material.pastedSources.length ? ` (${material.pastedSources.join(', ')})` : ''}`,
      detail: material.pastedSources.join(', ') || 'Pasted', url: '', excerpt: material.pasted.slice(0, 1200), charCount: material.pasted.length, ...base,
    }] : []),
  ];
}

// Runs one AI step on Claude, or on the demo script when the BA chose demo mode.
async function aiStep(demo, live, scripted) {
  if (demo) return scripted();
  if (!aiConfigured()) {
    throw new HttpError(503, 'Live Claude needs a Claude API key (ANTHROPIC_API_KEY) on the server. Switch to Demo script to rehearse, or record findings and decisions by hand.', 'AI_NOT_CONFIGURED');
  }
  try {
    return await live();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[asis] AI step failed:', e?.message);
    throw new HttpError(502, `The AI step didn't complete (${e?.message || 'unknown error'}). Try again.`, 'AI_FAILED');
  }
}

function toFinding(f, user, origin, statusOverride) {
  const at = now();
  return {
    id: uuidv4(),
    status: statusOverride || (FINDING_STATUS.includes(f.status) ? f.status : 'UNKNOWN'),
    text: clean(f.text, LIMITS.findingText), source: clean(f.source, LIMITS.findingSource), note: '', origin,
    createdAt: at, updatedAt: at, updatedByName: origin === 'ai' ? 'AI analysis' : user.name,
    resolvedAt: null, supersededAt: null,
  };
}

function toItem(d, user, version, byName = 'AI analysis') {
  const at = now();
  return {
    id: uuidv4(),
    kind: ITEM_KINDS.includes(d.kind) ? d.kind : 'DECISION',
    title: clean(d.title, LIMITS.itemTitle) || 'Untitled item',
    description: clean(d.description, LIMITS.itemText), position: clean(d.position, LIMITS.itemText), outcome: clean(d.outcome, LIMITS.itemText),
    owner: clean(d.owner, LIMITS.owner),
    status: DECISION_STATUS.includes(d.status) ? d.status : 'OPEN',
    raisedAt: at, raisedIn: version ? `v${version}` : null, resolvedAt: d.status === 'CONFIRMED' ? at : null, answeredIn: null,
    updatedAt: at, updatedByName: byName || user.name,
  };
}

// Adds AI-proposed open items, skipping titles already in the register.
function mergeItems(existing, proposed, user, version) {
  const titles = new Set(existing.map(d => d.title.trim().toLowerCase()));
  const added = (proposed || []).filter(d => d?.title && !titles.has(d.title.trim().toLowerCase()) && titles.add(d.title.trim().toLowerCase())).map(d => toItem(d, user, version));
  return [...existing, ...added].slice(0, LIMITS.items);
}

function overviewFrom(result) {
  return {
    summary: clean(result.summary, 4000),
    currentState: cleanList(result.currentState),
    stakeholders: (result.stakeholders || []).map(s => ({ role: clean(s.role, 200), involvement: clean(s.involvement, 1000) })).filter(s => s.role).slice(0, 12),
    businessRules: cleanList(result.businessRules),
    complianceFlags: cleanList(result.complianceFlags),
    painPoints: (result.painPoints || []).map(x => ({ point: clean(x.point, 500), impact: clean(x.impact, 1000) })).filter(x => x.point).slice(0, 12),
    gaps: (result.gaps || []).map(g => ({ priority: GAP_PRIORITY.includes(g.priority) ? g.priority : 'MEDIUM', gap: clean(g.gap, 500), why: clean(g.why, 1000) })).filter(g => g.gap).slice(0, 12),
  };
}

// ---- baseline (KB v1.0) ----

// fields: { module, problem, currentState, pains, otherPains, pasted, pastedSources, references, demo }
export async function runBaseline(user, id, { fields = {}, files = [] }) {
  const before = await getProject(id);
  if (before.analysis) throw conflict('The baseline already exists. Add new information with Add knowledge.', 'BASELINE_EXISTS');
  const demo = truthy(fields.demo);
  const intake = intakeFrom(fields, before.intake);
  const module = fields.module === undefined ? before.module : str(fields.module, { field: 'Module / process', max: LIMITS.module });
  const material = await collectMaterial({ files, references: fields.references, pasted: intake.pasted, pastedSources: intake.pastedSources });

  const { result, notice } = await aiStep(demo,
    () => analyseIntake({ project: { ...before, module }, intake: { ...intake, module }, material }),
    () => demoIntake());

  const p = await getProject(id);
  if (p.analysis) throw conflict('Someone else created the baseline while this one ran. Review it, then use Add knowledge.', 'BASELINE_EXISTS');
  const at = now();
  const findings = (result.findings || []).filter(f => f?.text).slice(0, 30).map(f => toFinding(f, user, 'ai'));
  const proposed = [
    ...(result.decisions || []).map(d => ({ ...d, kind: 'DECISION' })),
    ...(result.questions || []).map(t => ({ kind: 'QUESTION', title: t, status: 'OPEN' })),
  ];
  const decisions = mergeItems(p.decisions, proposed, user, '1.0');
  const added = decisions.slice(p.decisions.length);
  const sources = newSources(user, material, '1.0');
  const note = `Baseline analysis: ${sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'} processed` : 'from the intake answers'}${demo ? ' (demo script)' : ''}`;

  const updated = await updateOne(COLLECTION, id, {
    module,
    intake: {
      ...intake, module, files: [...material.documents, ...material.images].map(d => d.name),
      references: material.references.map(r => r.title), at, byName: user.name,
    },
    sources: [...p.sources, ...sources],
    findings: [...p.findings.filter(f => f.origin === 'manual'), ...findings],
    decisions,
    analysis: { ...overviewFrom(result), analysedAt: at, refreshedIn: 'v1.0', notice, demo },
    versionHistory: p.versionHistory.map((v, i) => (i === 0 ? {
      ...v, note, at, byName: user.name, demo,
      changes: { new: findings.map(f => f.text), pending: added.map(d => `${d.kind === 'QUESTION' ? 'Question' : 'Decision'}: ${d.title}`) },
    } : v)),
    updatedAt: at,
  });
  await audit(user, 'asis.baseline', 'asisProject', id, note);
  return updated;
}

// ---- add knowledge (KB v1.1, v1.2 …) ----

// fields: { context, classification, pasted, pastedSources, references, demo }
export async function addKnowledge(user, id, { fields = {}, files = [] }) {
  const before = await getProject(id);
  if (!before.analysis) throw conflict('Create the AS-IS baseline before adding knowledge.', 'NOT_ANALYSED');
  const demo = truthy(fields.demo);
  const classification = oneOf(fields.classification, CLASSIFICATIONS.map(c => c.value), { field: 'Classification', fallback: 'PENDING' });
  const context = str(fields.context, { field: 'Description', max: LIMITS.context });
  const pasted = str(fields.pasted, { field: 'Pasted content', max: LIMITS.pasted });
  const pastedSources = (Array.isArray(fields.pastedSources) ? fields.pastedSources : []).filter(s => PASTE_SOURCES.includes(s));
  const material = await collectMaterial({ files, references: fields.references, pasted, pastedSources, notes: context });
  if (materialEmpty(material)) throw badRequest('Add a document, pasted content, a reference, or describe the new information.');

  const { result, notice } = await aiStep(demo,
    () => analyseUpdate({ project: before, context, classification, material }),
    () => demoUpdate({ project: before }));

  const p = await getProject(id);
  const version = nextVersion(p.version);
  const at = now();
  const confirmed = classification === 'CONFIRMED';
  const ids = (list) => new Set(Array.isArray(list) ? list : []);
  const resolved = ids(result.resolvedFindingIds);
  const superseded = ids(result.supersededFindingIds);
  const conflicting = ids(result.conflictingFindingIds);

  const findings = p.findings.map(f => {
    if (f.status === 'SUPERSEDED') return f;
    const touched = { updatedAt: at, updatedByName: 'AI analysis' };
    if (superseded.has(f.id)) {
      return confirmed ? { ...f, ...touched, status: 'SUPERSEDED', supersededAt: at } : { ...f, ...touched, status: 'CONFLICTING' };
    }
    if (conflicting.has(f.id) && f.status !== 'CONFLICTING') return { ...f, ...touched, status: 'CONFLICTING' };
    if (resolved.has(f.id) && confirmed && f.status !== 'CONFIRMED') return { ...f, ...touched, status: 'CONFIRMED', resolvedAt: at };
    return f;
  });
  const seen = new Set(findings.map(f => f.text.toLowerCase()));
  const added = (result.newFindings || [])
    .filter(f => f?.text && !seen.has(f.text.trim().toLowerCase()))
    // New knowledge is never more certain than the classification it was given.
    .map(f => toFinding(f, user, 'ai', f.status === 'CONFLICTING' || f.status === 'UNKNOWN' ? f.status : classification));

  // Answers to open questions: final only when the new information is confirmed.
  const answers = new Map((result.answeredQuestions || []).filter(x => x?.id && x.answer).map(x => [x.id, clean(x.answer, LIMITS.itemText)]));
  const items = p.decisions.map(d => {
    if (d.kind !== 'QUESTION' || !isOpenItem(d) || !answers.has(d.id)) return d;
    const answer = answers.get(d.id);
    const touched = { updatedAt: at, updatedByName: 'AI analysis', answeredIn: `v${version}` };
    return confirmed ? { ...d, ...touched, status: 'CONFIRMED', outcome: answer, resolvedAt: at } : { ...d, ...touched, status: 'PENDING', position: answer };
  });
  const decisions = mergeItems(items, (result.newOpenItems || []).map(d => ({ ...d, status: 'OPEN' })), user, version);

  // The overview keeps whatever the update didn't revise.
  const ov = overviewFrom(result.overview || {});
  const keep = (k) => (ov[k].length ? ov[k] : p.analysis[k] || []);
  const analysis = {
    ...p.analysis,
    summary: ov.summary || p.analysis.summary,
    currentState: keep('currentState'), stakeholders: keep('stakeholders'), businessRules: keep('businessRules'),
    complianceFlags: keep('complianceFlags'), gaps: keep('gaps'), painPoints: keep('painPoints'),
    refreshedIn: `v${version}`,
  };

  const changes = Object.fromEntries(['new', 'changed', 'conflicts', 'resolved', 'superseded', 'pending'].map(k => [k, cleanList(result.changes?.[k], 1000, 30)]));
  const sources = newSources(user, material, version);
  const versionNote = (clean(result.versionNote, 300) || `Added ${sources.length} source${sources.length === 1 ? '' : 's'}`) + (demo ? ' (demo script)' : '');

  const updated = await updateOne(COLLECTION, id, {
    version,
    sources: [...p.sources, ...sources].slice(-LIMITS.sources),
    findings: [...findings, ...added].slice(0, LIMITS.findings),
    decisions,
    analysis,
    versionHistory: [...p.versionHistory, { version, note: versionNote, at, byName: user.name, classification, context: context.slice(0, 300), changes, notice, demo }],
    updatedAt: at,
  });
  await audit(user, 'asis.knowledge_added', 'asisProject', id, `v${version} (${classification})`);
  return updated;
}

// ---- findings ----

export async function addFinding(user, id, body) {
  const p = await getProject(id);
  if (p.findings.length >= LIMITS.findings) throw badRequest(`A project can have at most ${LIMITS.findings} findings.`);
  const f = toFinding({
    text: str(body.text, { field: 'Finding', required: true, max: LIMITS.findingText }),
    source: str(body.source, { field: 'Source', max: LIMITS.findingSource }),
  }, user, 'manual', oneOf(body.status, FINDING_STATUS, { field: 'Status', fallback: 'PENDING' }));
  return updateOne(COLLECTION, id, { findings: [...p.findings, f], updatedAt: now() });
}

export async function updateFinding(user, id, findingId, body) {
  const p = await getProject(id);
  const i = p.findings.findIndex(f => f.id === findingId);
  if (i === -1) throw notFound('Finding not found.');
  const f = { ...p.findings[i] };
  const at = now();
  if (body.status !== undefined && body.status !== f.status) {
    f.status = oneOf(body.status, FINDING_STATUS, { field: 'Status' });
    if (f.status === 'CONFIRMED') f.resolvedAt = at;
    if (f.status === 'SUPERSEDED') f.supersededAt = at;
  }
  if (body.text !== undefined) f.text = str(body.text, { field: 'Finding', required: true, max: LIMITS.findingText });
  if (body.source !== undefined) f.source = str(body.source, { field: 'Source', max: LIMITS.findingSource });
  if (body.note !== undefined) f.note = str(body.note, { field: 'Resolution note', max: LIMITS.findingNote });
  f.updatedAt = at;
  f.updatedByName = user.name;
  const findings = [...p.findings];
  findings[i] = f;
  return updateOne(COLLECTION, id, { findings, updatedAt: at });
}

export async function removeFinding(user, id, findingId) {
  const p = await getProject(id);
  if (!p.findings.some(f => f.id === findingId)) throw notFound('Finding not found.');
  return updateOne(COLLECTION, id, { findings: p.findings.filter(f => f.id !== findingId), updatedAt: now() });
}

// ---- open items: decisions and questions ----

export async function addItem(user, id, body) {
  const p = await getProject(id);
  if (p.decisions.length >= LIMITS.items) throw badRequest(`A project can have at most ${LIMITS.items} open items.`);
  const kind = oneOf(body.kind, ITEM_KINDS, { field: 'Type', fallback: 'DECISION' });
  const d = toItem({
    kind,
    title: str(body.title, { field: 'Title', max: LIMITS.itemTitle }) || (kind === 'QUESTION' ? 'New question' : 'New decision'),
    description: str(body.description, { field: 'Description', max: LIMITS.itemText }),
    position: str(body.position, { field: 'Current position', max: LIMITS.itemText }),
    owner: str(body.owner, { field: 'Owner', max: LIMITS.owner }),
    status: oneOf(body.status, DECISION_STATUS, { field: 'Status', fallback: 'OPEN' }),
  }, user, null, user.name);
  return updateOne(COLLECTION, id, { decisions: [...p.decisions, d], updatedAt: now() });
}

export async function updateItem(user, id, itemId, body) {
  const p = await getProject(id);
  const i = p.decisions.findIndex(d => d.id === itemId);
  if (i === -1) throw notFound('Open item not found.');
  const d = { ...p.decisions[i] };
  const at = now();
  if (body.title !== undefined) d.title = str(body.title, { field: 'Title', required: true, max: LIMITS.itemTitle });
  for (const [key, label] of [['description', 'Description'], ['position', 'Current position'], ['outcome', 'Outcome']]) {
    if (body[key] !== undefined) d[key] = str(body[key], { field: label, max: LIMITS.itemText });
  }
  if (body.owner !== undefined) d.owner = str(body.owner, { field: 'Owner', max: LIMITS.owner });
  if (body.kind !== undefined) d.kind = oneOf(body.kind, ITEM_KINDS, { field: 'Type' });
  if (body.status !== undefined && body.status !== d.status) {
    d.status = oneOf(body.status, DECISION_STATUS, { field: 'Status' });
    d.resolvedAt = d.status === 'CONFIRMED' ? at : null;
  }
  d.updatedAt = at;
  d.updatedByName = user.name;
  const decisions = [...p.decisions];
  decisions[i] = d;
  return updateOne(COLLECTION, id, { decisions, updatedAt: at });
}

// Deleted items go to a "recently deleted" list (the last 25) so they can be restored.
export async function removeItem(user, id, itemId) {
  const p = await getProject(id);
  const i = p.decisions.findIndex(d => d.id === itemId);
  if (i === -1) throw notFound('Open item not found.');
  const removed = { ...p.decisions[i], deletedAt: now(), deletedIndex: i, deletedByName: user.name };
  return updateOne(COLLECTION, id, {
    decisions: p.decisions.filter(d => d.id !== itemId),
    deletedItems: [removed, ...p.deletedItems.filter(x => x.id !== itemId)].slice(0, LIMITS.deletedItems),
    updatedAt: now(),
  });
}

export async function restoreItem(user, id, itemId) {
  const p = await getProject(id);
  const it = p.deletedItems.find(x => x.id === itemId);
  if (!it) throw notFound('That item is no longer in the recently deleted list.');
  const { deletedAt, deletedIndex, deletedByName, ...item } = it;
  const decisions = [...p.decisions];
  decisions.splice(Math.min(deletedIndex ?? decisions.length, decisions.length), 0, item);
  return updateOne(COLLECTION, id, { decisions, deletedItems: p.deletedItems.filter(x => x.id !== itemId), updatedAt: now() });
}

export async function purgeDeleted(user, id) {
  await getProject(id);
  return updateOne(COLLECTION, id, { deletedItems: [], updatedAt: now() });
}

// ---- TO-BE design (Super-Agent 2) ----

const withoutFill = (d) => d && { ...d, templateFill: null };

// body: { direction, demo }
export async function generateDesign(user, id, body) {
  const before = await getProject(id);
  if (!before.analysis) throw conflict('Create the AS-IS baseline before designing the TO-BE.', 'NOT_ANALYSED');
  const demo = truthy(body.demo);
  const direction = str(body.direction, { field: 'Design direction', max: LIMITS.direction });
  const result = await aiStep(demo,
    () => designProcess({ project: before, direction, previous: before.design }),
    () => demoDesign({ direction }));

  const p = await getProject(id);
  const design = normalizeDesign(result, p, direction, { byName: user.name, demo });
  if (!design.steps.length) throw new HttpError(502, 'The design came back without any process steps. Try again, or add a design direction.', 'AI_FAILED');
  const updated = await updateOne(COLLECTION, id, { design, designPrev: withoutFill(p.design), updatedAt: now() });
  await audit(user, p.design ? 'asis.design_updated' : 'asis.design_created', 'asisProject', id, `${design.steps.length} steps on KB v${p.version}`);
  return updated;
}

function sanitizeRefs(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map(r => ({
    ref: clean(r?.ref, 10), kind: clean(r?.kind, 20), text: clean(r?.text, 2000), status: r?.status ? clean(r.status, 20) : null,
  })).filter(r => r.ref && r.kind);
}

// body: { steps } and/or { traceability }: the edited lists, as the page shows them.
export async function editDesign(user, id, body) {
  const p = await getProject(id);
  if (!p.design) throw conflict('There is no TO-BE design yet. Generate one first.', 'NO_DESIGN');
  const design = { ...p.design, templateFill: null, editedAt: now(), editedByName: user.name };
  if (body.steps !== undefined) {
    if (!Array.isArray(body.steps) || body.steps.length > LIMITS.designSteps) throw badRequest(`A design can have at most ${LIMITS.designSteps} steps.`);
    const ids = new Set();
    design.steps = body.steps.map((s, i) => {
      let sid = clean(s?.id, 20) || `U${i + 1}`;
      while (ids.has(sid)) sid = `${sid}_`;
      ids.add(sid);
      return {
        id: sid,
        name: str(s?.name, { field: 'Step name', max: LIMITS.stepName }) || `Step ${i + 1}`,
        actor: str(s?.actor, { field: 'Actor', max: LIMITS.stepActor }),
        system: str(s?.system, { field: 'System', max: LIMITS.stepActor }),
        change: oneOf(s?.change, DESIGN_CHANGE, { field: 'Type of change', fallback: 'CHANGED' }),
        description: str(s?.description, { field: 'Step description', max: LIMITS.stepText }),
        replaces: sanitizeRefs(s?.replaces).filter(r => r.kind === 'asis'),
        basedOn: sanitizeRefs(s?.basedOn).filter(r => r.kind !== 'asis'),
      };
    });
  }
  if (body.traceability !== undefined) {
    if (!Array.isArray(body.traceability)) throw badRequest('traceability must be a list.');
    const byRef = new Map((p.design.traceability || []).map(t => [t.ref, t]));
    design.traceability = body.traceability.filter(t => byRef.has(t?.ref)).map(t => ({
      ...byRef.get(t.ref),
      status: oneOf(t.status, TRACE_STATUS, { field: 'Coverage', fallback: byRef.get(t.ref).status }),
      resolution: str(t.resolution, { field: 'Resolution', max: LIMITS.resolution }),
    }));
  }
  const stepIds = new Set(design.steps.map(s => s.id));
  design.traceability = design.traceability.map(t => ({ ...t, stepIds: (t.stepIds || []).filter(x => stepIds.has(x)) }));
  return updateOne(COLLECTION, id, { design, updatedAt: now() });
}

// Swaps the current design with the one it replaced (and back again).
export async function restorePreviousDesign(user, id) {
  const p = await getProject(id);
  if (!p.designPrev) throw conflict('There is no previous design to restore.', 'NO_PREVIOUS');
  return updateOne(COLLECTION, id, { design: withoutFill(p.designPrev), designPrev: withoutFill(p.design), updatedAt: now() });
}

export async function designWord(user, id) {
  const p = await getProject(id);
  const m = designModel(p);
  if (!m) throw conflict('There is no TO-BE design yet. Generate one first.', 'NO_DESIGN');
  return { buffer: await designDocx(p, m), filename: toBeFileName(p) };
}

// ---- TO-BE Word template ----

const TEMPLATE_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// The outline is described in the browser (it needs a DOM to read Word's XML); it is
// checked and trimmed here because it goes into prompts.
function sanitizeOutline(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.sections) || !Array.isArray(o.tables)) throw badRequest('The template outline is missing.');
  const sections = o.sections.slice(0, 200).map(s => ({
    id: /^S\d{1,4}$/.test(s?.id) ? s.id : null,
    level: Math.min(9, Math.max(1, parseInt(s?.level, 10) || 1)),
    heading: clean(s?.heading, 300),
    guidance: clean(s?.guidance, 420),
    hasImage: Boolean(s?.hasImage),
    tables: (Array.isArray(s?.tables) ? s.tables : []).filter(t => /^T\d{1,4}$/.test(t)).slice(0, 30),
  })).filter(s => s.id && s.heading);
  const tables = o.tables.slice(0, 300).map(t => ({
    id: /^T\d{1,4}$/.test(t?.id) ? t.id : null,
    section: /^S\d{1,4}$/.test(t?.section) ? t.section : 'S0',
    columns: (Array.isArray(t?.columns) ? t.columns : []).slice(0, 20).map(c => clean(c, 60)),
    examples: (Array.isArray(t?.examples) ? t.examples : []).slice(0, 2).map(r => (Array.isArray(r) ? r : []).slice(0, 20).map(c => clean(c, 140))),
  })).filter(t => t.id);
  const fixedTexts = (Array.isArray(o.fixedTexts) ? o.fixedTexts : []).slice(0, 60).map(t => clean(t, 160)).filter(Boolean);
  return { sections, tables, fixedTexts };
}

// Groups of sections per AI call, split at top-level headings where possible.
export function templateBatches(outline, maxPer = 7) {
  const batches = [];
  let cur = [];
  for (const s of outline.sections) {
    if (cur.length >= maxPer || (cur.length >= 3 && s.level === 1)) { batches.push(cur); cur = []; }
    cur.push(s.id);
  }
  if (cur.length) batches.push(cur);
  return batches.length ? batches : [[]];
}

export async function uploadTemplate(user, id, { file, outline: rawOutline }) {
  const p = await getProject(id);
  if (!isFile(file)) throw badRequest('Choose a Word template to upload.');
  const ext = extensionOf(file.name);
  if (!['docx', 'dotx'].includes(ext)) throw new HttpError(415, 'The TO-BE template must be a Word file (.docx or .dotx). Save older .doc files as .docx first.', 'UNSUPPORTED_TYPE');
  if (file.size > LIMITS.templateBytes) throw new HttpError(413, 'The template is over 4 MB. Remove large images from it and upload it again.', 'TOO_LARGE');
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)) throw new HttpError(422, "This file isn't a valid Word document.", 'CORRUPT_FILE');
  let parsed;
  try { parsed = typeof rawOutline === 'string' ? JSON.parse(rawOutline) : rawOutline; } catch { throw badRequest('The template outline must be JSON.'); }
  const outline = sanitizeOutline(parsed);
  if (!outline.sections.length) throw badRequest("No headings were found. Format the section titles with Word's Heading styles (Heading 1, Heading 2…) and upload the template again.");

  const tid = uuidv4();
  const storageKey = await saveUpload(tid, ext, buffer);
  const toBeTemplate = {
    id: tid, name: cleanFilename(file.name), ext, size: buffer.length, storageKey, uploadedAt: now(), uploadedByName: user.name,
    sectionCount: outline.sections.length, tableCount: outline.tables.length,
    headings: outline.sections.slice(0, 60).map(s => ({ level: s.level, text: s.heading.slice(0, 90), tables: s.tables.length })),
    outline, batches: templateBatches(outline),
  };
  const updated = await updateOne(COLLECTION, id, { toBeTemplate, design: withoutFill(p.design), updatedAt: now() });
  if (p.toBeTemplate?.storageKey) await deleteUpload(p.toBeTemplate.storageKey).catch(() => {});
  await audit(user, 'asis.template_uploaded', 'asisProject', id, toBeTemplate.name);
  return updated;
}

export async function removeTemplate(user, id) {
  const p = await getProject(id);
  if (!p.toBeTemplate) throw notFound('There is no TO-BE template.');
  const updated = await updateOne(COLLECTION, id, { toBeTemplate: null, design: withoutFill(p.design), updatedAt: now() });
  await deleteUpload(p.toBeTemplate.storageKey).catch(() => {});
  return updated;
}

export async function templateFile(user, id) {
  const p = await getProject(id);
  if (!p.toBeTemplate) throw notFound('There is no TO-BE template.');
  return { buffer: await readUpload(p.toBeTemplate.storageKey), filename: p.toBeTemplate.name, mime: TEMPLATE_MIME };
}

// Changes whenever the design, the template, or anything the content depends on changes,
// so cached template content is reused only while it is still current.
function fillKey(p, demo) {
  const { templateFill, ...design } = p.design;
  const basis = JSON.stringify([p.toBeTemplate.id, design, p.version, demo,
    p.findings.map(f => f.status + f.text), p.decisions.map(d => d.status + d.title)]);
  return crypto.createHash('sha1').update(basis).digest('hex');
}

// Content for one batch of template sections. body: { batch, demo, today }
export async function fillTemplateBatch(user, id, body) {
  const p = await getProject(id);
  if (!p.design) throw conflict('There is no TO-BE design yet. Generate one first.', 'NO_DESIGN');
  if (!p.toBeTemplate) throw conflict('Upload a TO-BE template first.', 'NO_TEMPLATE');
  const { outline, batches } = p.toBeTemplate;
  const index = Number(body.batch);
  if (!Number.isInteger(index) || index < 0 || index >= batches.length) throw badRequest(`batch must be from 0 to ${batches.length - 1}.`);
  const demo = truthy(body.demo);
  const key = fillKey(p, demo);
  const cached = p.design.templateFill?.key === key ? p.design.templateFill.parts?.[index] : null;
  if (cached) return { result: cached, batchCount: batches.length, cached: true };

  const byId = new Map(outline.sections.map(s => [s.id, s]));
  const batch = batches[index].map(sid => byId.get(sid)).filter(Boolean);
  const today = /^[0-9/.\- ]{6,12}$/.test(body.today || '') ? body.today : new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const raw = await aiStep(demo,
    () => fillTemplate({ project: p, model: designModel(p), outline, batch, first: index === 0, today }),
    () => demoFill({ outline, batch, first: index === 0, today }));
  const result = {
    replacements: (raw.replacements || []).filter(r => r?.find && typeof r.replace === 'string' && r.find !== r.replace).slice(0, 60)
      .map(r => ({ find: clean(r.find, 160), replace: clean(r.replace, 300) })),
    sections: (raw.sections || []).filter(s => byId.has(s?.id)).map(s => ({
      id: s.id, action: s.action === 'replace' ? 'replace' : 'keep', newHeading: clean(s.newHeading, 300),
      blocks: (s.blocks || []).slice(0, 60).map(b => ({ type: ['bullets', 'numbered'].includes(b?.type) ? b.type : 'paragraph', text: clean(b?.text, 6000), items: cleanList(b?.items, 2000, 60) })),
      tables: (s.tables || []).slice(0, 30).map(t => ({ id: clean(t?.id, 10), rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 80).map(r => (Array.isArray(r) ? r : [r]).slice(0, 20).map(c => clean(c, 2000))) })),
    })),
    coverTables: (raw.coverTables || []).slice(0, 10).map(t => ({ id: clean(t?.id, 10), rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 30).map(r => (Array.isArray(r) ? r : [r]).slice(0, 20).map(c => clean(c, 500))) })),
  };

  // Cache the batch on the design; another batch may have been stored meanwhile.
  const latest = await getProject(id);
  if (latest.design && fillKey(latest, demo) === key) {
    const parts = latest.design.templateFill?.key === key ? { ...latest.design.templateFill.parts } : {};
    parts[index] = result;
    if (JSON.stringify(parts).length < 400_000) await updateOne(COLLECTION, id, { design: { ...latest.design, templateFill: { key, parts, at: now() } } });
  }
  return { result, batchCount: batches.length, cached: false };
}
