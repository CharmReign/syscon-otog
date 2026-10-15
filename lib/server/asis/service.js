// AS-IS Navigator projects: a persistent, versioned knowledge base per analysis project.
// Each project collects sources (uploaded documents, notes, Confluence/Jira/document
// references), findings classified by certainty, decisions and open items, and the
// latest analysis. Adding knowledge bumps the version and records what changed.
//
// Certainty rules (enforced here, whatever the AI returns):
// - Only a person, or new knowledge classified CONFIRMED, can make a finding CONFIRMED.
// - Knowledge that isn't CONFIRMED can't retire a finding; a contradiction from it marks
//   the finding CONFLICTING for someone to review instead of SUPERSEDED.
import { v4 as uuidv4 } from 'uuid';

import { isAdmin } from '@/lib/access';
import { CLASSIFICATIONS, DECISION_STATUS, FINDING_STATUS, GAP_PRIORITY, SOURCE_KINDS, nextVersion } from '@/lib/asis';
import { audit } from '@/lib/server/audit';
import { aiConfigured } from '@/lib/server/ai';
import { analyseIntake, analyseUpdate } from '@/lib/server/asis/ai';
import { DocumentError, cleanFilename, extractSections, maxUploadBytes, validateUpload } from '@/lib/server/documents/extract';
import { HttpError, badRequest, notFound, oneOf, str } from '@/lib/server/http';
import { deleteOne, findAll, findOne, insertOne, updateOne } from '@/lib/server/store';
import { sourceRef } from '@/lib/levelup';

const COLLECTION = 'asisProjects';
const now = () => new Date().toISOString();

export const LIMITS = { files: 10, references: 20, referenceChars: 6000, findings: 500, decisions: 200, sources: 500 };

// ---- projects ----

const summary = (p) => ({
  id: p.id, name: p.name, module: p.module, version: p.version,
  sourceCount: p.sources.length, findingCounts: Object.fromEntries(FINDING_STATUS.map(s => [s, p.findings.filter(f => f.status === s).length])),
  decisionsOpen: p.decisions.filter(d => d.status !== 'CONFIRMED' && d.status !== 'SUPERSEDED').length,
  analysed: Boolean(p.analysis), createdByName: p.createdByName, createdAt: p.createdAt, updatedAt: p.updatedAt,
});

export const listProjects = () => findAll(COLLECTION).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary);

export function getProject(id) {
  const p = findOne(COLLECTION, id);
  if (!p) throw notFound('Project not found.');
  return p;
}

export function createProject(user, body) {
  const at = now();
  const p = insertOne(COLLECTION, {
    id: uuidv4(),
    name: str(body.name, { field: 'Project name', required: true, max: 120 }),
    module: str(body.module, { field: 'Module / process', max: 120 }),
    notes: str(body.notes, { field: 'Notes', max: 2000 }),
    version: '1.0',
    versionHistory: [{ version: '1.0', note: 'Project created', at, byName: user.name }],
    intake: { problem: '', currentState: '', pains: [], otherPains: '' },
    sources: [], findings: [], decisions: [], analysis: null, changes: null,
    createdById: user.id, createdByName: user.name, createdAt: at, updatedAt: at,
  });
  audit(user, 'asis.project_created', 'asisProject', p.id, p.name);
  return p;
}

function intakeFrom(body, current = {}) {
  const pains = body.pains === undefined ? current.pains || [] : body.pains;
  if (!Array.isArray(pains) || pains.length > 30) throw badRequest('pains must be a list of up to 30 items.');
  return {
    problem: body.problem === undefined ? current.problem || '' : str(body.problem, { field: 'Problem statement', max: 4000 }),
    currentState: body.currentState === undefined ? current.currentState || '' : str(body.currentState, { field: 'Current state', max: 8000 }),
    pains: [...new Set(pains.map(x => str(x, { field: 'Pain point', max: 120 })).filter(Boolean))],
    otherPains: body.otherPains === undefined ? current.otherPains || '' : str(body.otherPains, { field: 'Other pain points', max: 2000 }),
  };
}

export function updateProject(user, id, body) {
  const p = getProject(id);
  const patch = { updatedAt: now() };
  if (body.name !== undefined) patch.name = str(body.name, { field: 'Project name', required: true, max: 120 });
  if (body.module !== undefined) patch.module = str(body.module, { field: 'Module / process', max: 120 });
  if (body.notes !== undefined) patch.notes = str(body.notes, { field: 'Notes', max: 2000 });
  if (body.intake !== undefined) patch.intake = intakeFrom(body.intake || {}, p.intake);
  return updateOne(COLLECTION, id, patch);
}

export function deleteProject(user, id) {
  const p = getProject(id);
  if (!isAdmin(user) && p.createdById !== user.id) throw new HttpError(403, 'Only the project creator or an administrator can delete it.', 'FORBIDDEN');
  deleteOne(COLLECTION, id);
  audit(user, 'asis.project_deleted', 'asisProject', id, p.name);
  return { ok: true };
}

// ---- material for analysis ----

// Reads the multipart body of an analysis request: text fields, `files`, and an optional
// `template`. List fields (pains, references) arrive as JSON text.
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
  if (fields.pains !== undefined) {
    try { fields.pains = JSON.parse(fields.pains); } catch { throw badRequest('pains must be a JSON list.'); }
  }
  return { fields, files: form.getAll('files').filter(isFile), template: form.get('template') };
}

const isFile = (f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0;

async function readFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = cleanFilename(file.name);
  try {
    const ext = validateUpload({ filename: file.name, size: buffer.length, buffer });
    const { sections, charCount } = await extractSections(buffer, ext);
    const text = sections.map(s => (s.page || s.heading ? `[${sourceRef(s)}]\n${s.text}` : s.text)).join('\n\n');
    return { name, ext, text, charCount };
  } catch (e) {
    if (e instanceof DocumentError) throw new HttpError(e.status, `${name}: ${e.message}`, e.code);
    throw e;
  }
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

async function collectMaterial({ files = [], references, notes }) {
  const list = files.filter(isFile);
  if (list.length > LIMITS.files) throw badRequest(`Add at most ${LIMITS.files} documents at a time.`);
  const documents = [];
  for (const f of list) documents.push(await readFile(f));
  return { documents, references: parseReferences(references), notes: notes || '' };
}

function newSources(user, material, version, extra = []) {
  const at = now();
  return [
    ...material.documents.map(d => ({ id: uuidv4(), kind: SOURCE_KINDS.DOCUMENT, name: d.name, detail: d.ext.toUpperCase(), url: '', excerpt: d.text.slice(0, 1200), charCount: d.charCount, addedAt: at, version, addedByName: user.name })),
    ...material.references.map(r => ({ id: uuidv4(), kind: r.source, name: r.title, detail: r.ref, url: r.url, excerpt: r.text.slice(0, 1200), charCount: r.text.length, addedAt: at, version, addedByName: user.name })),
    ...extra,
  ];
}

function requireAi() {
  if (!aiConfigured()) {
    throw new HttpError(503, 'AI analysis needs a Claude API key (ANTHROPIC_API_KEY) on the server. You can still record findings and decisions by hand.', 'AI_NOT_CONFIGURED');
  }
}

async function runAi(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('[asis] analysis failed:', e?.message);
    throw new HttpError(502, `The analysis didn't complete (${e?.message || 'unknown error'}). Try again.`, 'AI_FAILED');
  }
}

const clean = (s, max = 2000) => String(s || '').trim().slice(0, max);
const cleanList = (items, max = 1000) => (Array.isArray(items) ? items.map(x => clean(x, max)).filter(Boolean) : []);

function toFinding(f, user, origin, statusOverride) {
  const at = now();
  return {
    id: uuidv4(),
    status: statusOverride || (FINDING_STATUS.includes(f.status) ? f.status : 'UNKNOWN'),
    text: clean(f.text), source: clean(f.source, 300), note: '', origin,
    createdAt: at, updatedAt: at, updatedByName: origin === 'ai' ? 'AI analysis' : user.name,
    resolvedAt: null, supersededAt: null,
  };
}

function toDecision(d, user) {
  return {
    id: uuidv4(),
    title: clean(d.title, 200) || 'Untitled item',
    description: clean(d.description), position: clean(d.position), owner: clean(d.owner, 120),
    status: DECISION_STATUS.includes(d.status) ? d.status : 'OPEN',
    raisedAt: now(), updatedAt: now(), updatedByName: user.name,
  };
}

// Appends AI-proposed decisions, skipping titles already in the register.
function mergeDecisions(existing, proposed, user) {
  const titles = new Set(existing.map(d => d.title.trim().toLowerCase()));
  const added = (proposed || []).filter(d => d?.title && !titles.has(d.title.trim().toLowerCase())).map(d => toDecision(d, user));
  return [...existing, ...added].slice(0, LIMITS.decisions);
}

// ---- initial analysis ----

// fields: { module, problem, currentState, pains, otherPains, references }, files: File[], template: File|null
export async function runInitialAnalysis(user, id, { fields = {}, files = [], template = null }) {
  requireAi();
  const before = getProject(id);
  const intake = intakeFrom(fields, before.intake);
  const module = fields.module === undefined ? before.module : str(fields.module, { field: 'Module / process', max: 120 });
  const material = await collectMaterial({ files, references: fields.references });
  const tmpl = isFile(template) ? await readFile(template) : null;

  const { result, notice } = await runAi(() => analyseIntake({ project: { ...before, module }, intake: { ...intake, module }, material, template: tmpl }));

  // Re-read: the project may have been edited while the analysis ran.
  const p = getProject(id);
  const first = !p.analysis;
  const version = first ? p.version : nextVersion(p.version);
  const docCount = material.documents.length;
  const note = `${first ? 'Initial' : 'Re-ran initial'} analysis: ${docCount} document${docCount === 1 ? '' : 's'}, ${material.references.length} reference${material.references.length === 1 ? '' : 's'}`;
  const findings = (result.findings || []).filter(f => f?.text).map(f => toFinding(f, user, 'ai'));
  const manual = p.findings.filter(f => f.origin === 'manual');

  const updated = updateOne(COLLECTION, id, {
    module, intake, version,
    sources: [...p.sources, ...newSources(user, material, version)],
    // A re-run replaces the AI's findings but keeps the ones people added by hand.
    findings: [...manual, ...findings],
    decisions: mergeDecisions(p.decisions, result.decisions, user),
    analysis: {
      summary: clean(result.summary, 4000),
      currentState: cleanList(result.currentState),
      stakeholders: (result.stakeholders || []).map(s => ({ role: clean(s.role, 200), involvement: clean(s.involvement, 1000) })).filter(s => s.role),
      businessRules: cleanList(result.businessRules),
      painPoints: (result.painPoints || []).map(x => ({ point: clean(x.point, 500), impact: clean(x.impact, 1000) })).filter(x => x.point),
      gaps: (result.gaps || []).map(g => ({ priority: GAP_PRIORITY.includes(g.priority) ? g.priority : 'MEDIUM', gap: clean(g.gap, 500), why: clean(g.why, 1000) })).filter(g => g.gap),
      complianceFlags: cleanList(result.complianceFlags),
      questions: cleanList(result.questions),
      analysedAt: now(), notice,
      templateName: tmpl?.name || null,
    },
    versionHistory: first
      ? p.versionHistory.map((v, i) => (i === 0 ? { ...v, note: `${v.note}. ${note}` } : v))
      : [...p.versionHistory, { version, note, at: now(), byName: user.name }],
    updatedAt: now(),
  });
  audit(user, 'asis.analysed', 'asisProject', id, note);
  return updated;
}

// ---- add knowledge ----

// fields: { context, classification, references }, files: File[]
export async function addKnowledge(user, id, { fields = {}, files = [] }) {
  requireAi();
  const before = getProject(id);
  if (!before.analysis) throw new HttpError(409, 'Run the initial analysis before adding knowledge.', 'NOT_ANALYSED');
  const classification = oneOf(fields.classification, CLASSIFICATIONS.map(c => c.value), { field: 'Classification', fallback: 'PENDING' });
  const context = str(fields.context, { field: 'Description', max: 8000 });
  const material = await collectMaterial({ files, references: fields.references, notes: context });
  if (!material.documents.length && !material.references.length && !context) {
    throw badRequest('Add a document, a reference, or describe the new information.');
  }

  const { result, notice } = await runAi(() => analyseUpdate({ project: before, context, classification, material }));

  const p = getProject(id);
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

  const changes = Object.fromEntries(['new', 'changed', 'conflicts', 'resolved', 'superseded', 'pending'].map(k => [k, cleanList(result.changes?.[k])]));
  const versionNote = clean(result.versionNote, 300) || `Added ${material.documents.length + material.references.length} source(s)`;
  const noteSource = context && !material.documents.length && !material.references.length
    ? [{ id: uuidv4(), kind: SOURCE_KINDS.NOTE, name: context.slice(0, 80), detail: 'Note', url: '', excerpt: context.slice(0, 1200), charCount: context.length, addedAt: at, version, addedByName: user.name }]
    : [];

  const updated = updateOne(COLLECTION, id, {
    version,
    sources: [...p.sources, ...newSources(user, material, version, noteSource)].slice(-LIMITS.sources),
    findings: [...findings, ...added].slice(0, LIMITS.findings),
    decisions: mergeDecisions(p.decisions, result.newDecisions, user),
    changes: { ...changes, version, classification, context, at, notice },
    versionHistory: [...p.versionHistory, { version, note: versionNote, at, byName: user.name }],
    updatedAt: at,
  });
  audit(user, 'asis.knowledge_added', 'asisProject', id, `v${version} (${classification})`);
  return updated;
}

// ---- findings ----

export function addFinding(user, id, body) {
  const p = getProject(id);
  if (p.findings.length >= LIMITS.findings) throw badRequest(`A project can have at most ${LIMITS.findings} findings.`);
  const f = toFinding({
    text: str(body.text, { field: 'Finding', required: true, max: 2000 }),
    source: str(body.source, { field: 'Source', max: 300 }),
  }, user, 'manual', oneOf(body.status, FINDING_STATUS, { field: 'Status', fallback: 'PENDING' }));
  return updateOne(COLLECTION, id, { findings: [...p.findings, f], updatedAt: now() });
}

export function updateFinding(user, id, findingId, body) {
  const p = getProject(id);
  const i = p.findings.findIndex(f => f.id === findingId);
  if (i === -1) throw notFound('Finding not found.');
  const f = { ...p.findings[i] };
  const at = now();
  if (body.status !== undefined && body.status !== f.status) {
    f.status = oneOf(body.status, FINDING_STATUS, { field: 'Status' });
    if (f.status === 'CONFIRMED') f.resolvedAt = at;
    if (f.status === 'SUPERSEDED') f.supersededAt = at;
  }
  if (body.text !== undefined) f.text = str(body.text, { field: 'Finding', required: true, max: 2000 });
  if (body.source !== undefined) f.source = str(body.source, { field: 'Source', max: 300 });
  if (body.note !== undefined) f.note = str(body.note, { field: 'Resolution note', max: 1000 });
  f.updatedAt = at;
  f.updatedByName = user.name;
  const findings = [...p.findings];
  findings[i] = f;
  return updateOne(COLLECTION, id, { findings, updatedAt: at });
}

export function removeFinding(user, id, findingId) {
  const p = getProject(id);
  if (!p.findings.some(f => f.id === findingId)) throw notFound('Finding not found.');
  return updateOne(COLLECTION, id, { findings: p.findings.filter(f => f.id !== findingId), updatedAt: now() });
}

// ---- decisions ----

export function addDecision(user, id, body) {
  const p = getProject(id);
  if (p.decisions.length >= LIMITS.decisions) throw badRequest(`A project can have at most ${LIMITS.decisions} decisions.`);
  const d = toDecision({
    title: str(body.title, { field: 'Title', max: 200 }) || 'New open item',
    description: str(body.description, { field: 'Description', max: 2000 }),
    position: str(body.position, { field: 'Current position', max: 2000 }),
    owner: str(body.owner, { field: 'Owner', max: 120 }),
    status: oneOf(body.status, DECISION_STATUS, { field: 'Status', fallback: 'OPEN' }),
  }, user);
  return updateOne(COLLECTION, id, { decisions: [...p.decisions, d], updatedAt: now() });
}

export function updateDecision(user, id, decisionId, body) {
  const p = getProject(id);
  const i = p.decisions.findIndex(d => d.id === decisionId);
  if (i === -1) throw notFound('Decision not found.');
  const d = { ...p.decisions[i] };
  if (body.title !== undefined) d.title = str(body.title, { field: 'Title', required: true, max: 200 });
  if (body.description !== undefined) d.description = str(body.description, { field: 'Description', max: 2000 });
  if (body.position !== undefined) d.position = str(body.position, { field: 'Current position', max: 2000 });
  if (body.owner !== undefined) d.owner = str(body.owner, { field: 'Owner', max: 120 });
  if (body.status !== undefined) d.status = oneOf(body.status, DECISION_STATUS, { field: 'Status' });
  d.updatedAt = now();
  d.updatedByName = user.name;
  const decisions = [...p.decisions];
  decisions[i] = d;
  return updateOne(COLLECTION, id, { decisions, updatedAt: now() });
}

export function removeDecision(user, id, decisionId) {
  const p = getProject(id);
  if (!p.decisions.some(d => d.id === decisionId)) throw notFound('Decision not found.');
  return updateOne(COLLECTION, id, { decisions: p.decisions.filter(d => d.id !== decisionId), updatedAt: now() });
}
