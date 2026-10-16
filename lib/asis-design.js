// AS-IS Navigator, Super-Agent 2 (DESIGN): the TO-BE process built from a project's
// AS-IS knowledge base. Shared by the server (prompt, normalising, Word document) and
// the UI (flags, coverage). Keep this file free of Node-only imports.
//
// A design step points at knowledge base items by reference: A# AS-IS steps, P# pain
// points, G# gaps, F# findings, D# decisions, Q# questions. Each reference keeps the
// item's text, so its current status can be looked up live: a step that relies on
// anything not confirmed (or no longer valid) is flagged for validation.

export const DESIGN_CHANGE = ['NEW', 'CHANGED', 'AUTOMATED', 'UNCHANGED', 'REMOVED'];
export const CHANGE_LABEL = { NEW: 'New', CHANGED: 'Changed', AUTOMATED: 'Automated', UNCHANGED: 'Unchanged', REMOVED: 'Removed' };
export const CHANGE_TONE = { NEW: 'green', CHANGED: 'cyan', AUTOMATED: 'cyan', UNCHANGED: 'gray', REMOVED: 'red' };
export const TRACE_STATUS = ['ADDRESSED', 'PARTIAL', 'NOT_ADDRESSED'];
export const TRACE_LABEL = { ADDRESSED: 'Addressed', PARTIAL: 'Partly addressed', NOT_ADDRESSED: 'Not addressed' };
export const TRACE_TONE = { ADDRESSED: 'green', PARTIAL: 'amber', NOT_ADDRESSED: 'red' };
export const DIRECTION_STATUS = ['APPLIED', 'PARTIAL', 'NOT_APPLIED'];
export const DIRECTION_LABEL = { APPLIED: 'Applied', PARTIAL: 'Partly applied', NOT_APPLIED: 'Not applied' };
export const KIND_LABEL = { finding: 'Finding', decision: 'Decision', question: 'Question', pain: 'Pain point', gap: 'Gap', asis: 'AS-IS step' };

// Reference ids for everything the design may point at, in prompt order.
export function designRefTables(p) {
  const a = p?.analysis || {};
  const map = {};
  const order = [];
  const put = (r) => { map[r.ref] = r; order.push(r); };
  (a.currentState || []).forEach((t, i) => put({ ref: `A${i + 1}`, kind: 'asis', text: String(t) }));
  (a.painPoints || []).forEach((x, i) => put({ ref: `P${i + 1}`, kind: 'pain', text: String(x.point || ''), detail: x.impact ? `Impact: ${x.impact}` : '' }));
  (a.gaps || []).forEach((x, i) => put({ ref: `G${i + 1}`, kind: 'gap', text: String(x.gap || ''), detail: x.why || '', priority: x.priority || '' }));
  let fi = 0;
  for (const f of p?.findings || []) {
    if (f.status === 'SUPERSEDED') continue;
    put({ ref: `F${++fi}`, kind: 'finding', text: String(f.text || ''), status: f.status || 'UNKNOWN' });
  }
  let di = 0;
  let qi = 0;
  for (const d of p?.decisions || []) {
    if (d.status === 'SUPERSEDED') continue;
    const q = d.kind === 'QUESTION';
    const detail = d.outcome ? `${q ? 'confirmed answer' : 'outcome'}: ${d.outcome}` : d.position ? `${q ? 'answer so far' : 'position'}: ${d.position}` : '';
    put({ ref: q ? `Q${++qi}` : `D${++di}`, kind: q ? 'question' : 'decision', text: String(d.title || ''), status: d.status || 'OPEN', detail });
  }
  return { map, order };
}

function refsFrom(ids, map) {
  const seen = new Set();
  return (Array.isArray(ids) ? ids : []).map(String).filter(id => map[id] && !seen.has(id) && seen.add(id))
    .map(id => ({ ref: id, kind: map[id].kind, text: map[id].text, status: map[id].status || null }));
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// Turns the AI's answer into a stored design: unknown references are dropped, every pain
// point and gap gets a traceability row (marked "not addressed" if the AI skipped it).
export function normalizeDesign(result, p, direction, { byName = '', demo = false, now = new Date() } = {}) {
  const t = designRefTables(p);
  const steps = (Array.isArray(result?.steps) ? result.steps : []).filter(s => s && (s.name || s.description)).slice(0, 30).map((s, i) => ({
    id: clip(s.id || `T${i + 1}`, 20),
    name: clip(s.name || `Step ${i + 1}`, 150),
    actor: clip(s.actor, 100),
    system: clip(s.system, 100),
    change: DESIGN_CHANGE.includes(String(s.change).toUpperCase()) ? String(s.change).toUpperCase() : 'CHANGED',
    description: clip(s.description, 2000),
    replaces: refsFrom(s.replaces, t.map).filter(r => r.kind === 'asis'),
    basedOn: refsFrom(s.basedOn, t.map).filter(r => r.kind !== 'asis'),
  }));
  const stepIds = new Set(steps.map(s => s.id));
  const traced = new Set();
  const traceability = (Array.isArray(result?.traceability) ? result.traceability : []).filter(x => {
    const r = x && t.map[String(x.ref)];
    if (!r || (r.kind !== 'pain' && r.kind !== 'gap') || traced.has(r.ref)) return false;
    traced.add(r.ref);
    return true;
  }).map(x => {
    const r = t.map[String(x.ref)];
    return {
      ref: r.ref, kind: r.kind, text: r.text, detail: r.detail || '', priority: r.priority || '',
      resolution: clip(x.resolution, 2000),
      stepIds: (Array.isArray(x.steps) ? x.steps : []).map(String).filter(id => stepIds.has(id)),
      status: TRACE_STATUS.includes(String(x.status).toUpperCase()) ? String(x.status).toUpperCase() : 'PARTIAL',
    };
  });
  for (const r of t.order) {
    if ((r.kind === 'pain' || r.kind === 'gap') && !traced.has(r.ref)) {
      traceability.push({ ref: r.ref, kind: r.kind, text: r.text, detail: r.detail || '', priority: r.priority || '', resolution: 'Not covered by this design.', stepIds: [], status: 'NOT_ADDRESSED' });
    }
  }
  const assumptions = (Array.isArray(result?.assumptions) ? result.assumptions : []).filter(x => x && (x.text || typeof x === 'string')).slice(0, 20)
    .map(x => (typeof x === 'string' ? { text: clip(x, 1000), basedOn: [] } : { text: clip(x.text, 1000), basedOn: refsFrom(x.basedOn, t.map).filter(r => r.kind !== 'asis') }));
  const dir = clip(direction, 4000);
  return {
    summary: clip(result?.summary, 3000),
    principles: (Array.isArray(result?.principles) ? result.principles : []).map(x => clip(x, 300)).filter(Boolean).slice(0, 8),
    steps, traceability, assumptions,
    changeNote: clip(result?.changeNote, 300),
    direction: dir,
    directionApplied: (dir && Array.isArray(result?.directionApplied) ? result.directionApplied : []).filter(x => x && x.instruction).slice(0, 20).map(x => ({
      instruction: clip(x.instruction, 500),
      status: DIRECTION_STATUS.includes(String(x.status).toUpperCase()) ? String(x.status).toUpperCase() : 'PARTIAL',
      how: clip(x.how || x.reason, 1000),
    })),
    basedOnKb: `v${p.version}`,
    generatedAt: now.toISOString(),
    generatedByName: byName,
    demo: Boolean(demo),
    templateFill: null,
  };
}

const norm = (s) => String(s || '').toLowerCase().trim();
function same(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length > 24 && y.startsWith(x.slice(0, 40))) || (y.length > 24 && x.startsWith(y.slice(0, 40)));
}

// The referenced item's status in the knowledge base today.
export function liveRef(p, r) {
  if (r.kind === 'finding') {
    const f = (p.findings || []).find(x => x.text === r.text) || (p.findings || []).find(x => same(x.text, r.text));
    const status = f ? f.status || 'UNKNOWN' : 'MISSING';
    return { status, level: status === 'CONFIRMED' ? 'ok' : status === 'SUPERSEDED' || status === 'MISSING' ? 'invalid' : 'unconfirmed' };
  }
  if (r.kind === 'decision' || r.kind === 'question') {
    const d = (p.decisions || []).find(x => x.title === r.text) || (p.decisions || []).find(x => same(x.title, r.text));
    const status = d ? d.status || 'OPEN' : 'MISSING';
    return { status, level: status === 'CONFIRMED' ? 'ok' : status === 'SUPERSEDED' || status === 'MISSING' ? 'invalid' : 'unconfirmed' };
  }
  return { status: null, level: 'context' };
}

const flagged = (r) => r.live.level === 'unconfirmed' || r.live.level === 'invalid';

// Everything the UI and the Word document show: steps with live flags, traceability with
// step numbers, what to validate with the customer, coverage, and whether the design is
// older than the knowledge base.
export function designModel(p) {
  const d = p?.design;
  if (!d) return null;
  const withLive = (refs) => (refs || []).map(r => ({ ...r, live: liveRef(p, r) }));
  const steps = (d.steps || []).map((s, i) => {
    const refs = withLive(s.basedOn);
    return { ...s, n: i + 1, refs, flags: refs.filter(flagged) };
  });
  const numOf = (id) => steps.findIndex(s => s.id === id) + 1;
  const trace = (d.traceability || []).map(t => ({ ...t, stepNums: (t.stepIds || []).map(numOf).filter(Boolean) }));
  const assumptions = (d.assumptions || []).map(a => {
    const refs = withLive(a.basedOn);
    return { ...a, refs, flags: refs.filter(flagged) };
  });
  const byItem = new Map();
  const note = (r, where) => {
    const k = `${r.kind}|${r.text}`;
    if (!byItem.has(k)) byItem.set(k, { ref: r.ref, kind: r.kind, text: r.text, live: r.live, steps: [], assumptions: 0 });
    const v = byItem.get(k);
    if (where === 'a') v.assumptions += 1;
    else if (!v.steps.includes(where)) v.steps.push(where);
  };
  steps.forEach(s => s.flags.forEach(r => note(r, s.n)));
  assumptions.forEach(a => a.flags.forEach(r => note(r, 'a')));
  const validation = [...byItem.values()].sort((a, b) => (a.live.level === 'invalid' ? 0 : 1) - (b.live.level === 'invalid' ? 0 : 1) || b.steps.length - a.steps.length);
  const count = (st) => trace.filter(t => t.status === st).length;
  return {
    d, steps, trace, assumptions, validation,
    flaggedSteps: steps.filter(s => s.flags.length).length,
    coverage: { total: trace.length, addressed: count('ADDRESSED'), partial: count('PARTIAL'), none: count('NOT_ADDRESSED') },
    stale: d.basedOnKb !== `v${p.version}`,
  };
}

// Short label for a flagged reference: "Pending finding", "No longer valid decision".
export const flagLabel = (r) => `${r.live.level === 'invalid' ? (r.live.status === 'MISSING' ? 'Removed' : 'Superseded') : r.live.status} ${(KIND_LABEL[r.kind] || '').toLowerCase()}`;
