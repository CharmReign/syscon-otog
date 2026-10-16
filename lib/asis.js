// AS-IS Navigator: constants and helpers shared by the UI and the server.
// Keep this file free of Node-only imports; client components use it.

// How certain a finding is. PENDING, PROPOSED and ASSUMPTION are never treated as
// confirmed requirements; only a person or a CONFIRMED source can confirm them.
export const FINDING_STATUS = ['CONFIRMED', 'PENDING', 'PROPOSED', 'ASSUMPTION', 'CONFLICTING', 'UNKNOWN', 'SUPERSEDED'];
export const FINDING_LABELS = {
  CONFIRMED: 'Confirmed', PENDING: 'Pending', PROPOSED: 'Proposed', ASSUMPTION: 'Assumption',
  CONFLICTING: 'Conflicting', UNKNOWN: 'Unknown', SUPERSEDED: 'Superseded',
};
export const FINDING_TONE = {
  CONFIRMED: 'green', PENDING: 'amber', PROPOSED: 'cyan', ASSUMPTION: 'cyan',
  CONFLICTING: 'red', UNKNOWN: 'gray', SUPERSEDED: 'gray',
};

// What new knowledge may be classified as when it is added.
export const CLASSIFICATIONS = [
  { value: 'CONFIRMED', label: 'Confirmed', hint: 'Supported by an approved or current source' },
  { value: 'PENDING', label: 'Pending decision', hint: 'Discussed but not formally approved' },
  { value: 'PROPOSED', label: 'Proposed', hint: 'A proposed approach that is not agreed yet' },
  { value: 'ASSUMPTION', label: 'Assumption', hint: 'Used for now while awaiting confirmation' },
];

// Open items: decisions someone must make, and questions nobody has answered yet.
export const ITEM_KINDS = ['DECISION', 'QUESTION'];
export const DECISION_STATUS = ['OPEN', 'PENDING', 'PROPOSED', 'CONFIRMED', 'SUPERSEDED'];
export const DECISION_TONE = { OPEN: 'amber', PENDING: 'amber', PROPOSED: 'cyan', CONFIRMED: 'green', SUPERSEDED: 'gray' };
export const CLOSED_STATUS = ['CONFIRMED', 'SUPERSEDED'];
export const isOpenItem = (d) => !CLOSED_STATUS.includes(d.status);

export const GAP_PRIORITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const GAP_TONE = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'cyan', LOW: 'gray' };

export const PAIN_POINTS = [
  'Manual sentence calculation', 'Duplicate offender records', 'No real-time data sharing',
  'Audit trail gaps', 'Inefficient parole processing', 'Missing risk assessment steps',
  'Inter-agency data delays', 'Compliance reporting gaps', 'Manual data entry',
  'System integration failures', 'Inadequate reporting', 'Poor data visibility',
];

// Where pasted content came from (email threads, Teams messages, tickets, pages).
export const PASTE_SOURCES = ['Email', 'Teams', 'Jira', 'Confluence'];

// Groups of "What changed?" in each knowledge base version.
export const CHANGE_GROUPS = [
  { key: 'new', label: 'New', tone: 'green' },
  { key: 'changed', label: 'Changed', tone: 'amber' },
  { key: 'pending', label: 'Pending / raised', tone: 'amber' },
  { key: 'conflicts', label: 'Conflicts', tone: 'red' },
  { key: 'resolved', label: 'Resolved', tone: 'green' },
  { key: 'superseded', label: 'Superseded', tone: 'gray' },
];

export const SOURCE_KINDS = {
  DOCUMENT: 'document', IMAGE: 'image', PASTED: 'pasted', NOTE: 'note',
  INTERNAL: 'internal', CONFLUENCE: 'confluence', JIRA: 'jira',
};

// Character limits for every text field. The UI shows "used / limit"; the server enforces them.
export const LIMITS = {
  name: 120, module: 120, notes: 2000,
  problem: 3000, currentState: 5000, otherPains: 1000, pasted: 10000, context: 2000,
  findingText: 2000, findingSource: 300, findingNote: 500,
  itemTitle: 300, itemText: 3000, owner: 100,
  direction: 4000, stepName: 150, stepActor: 100, stepText: 2000, resolution: 2000, fileName: 150,
  files: 10, images: 4, references: 20, referenceChars: 6000,
  findings: 500, items: 300, deletedItems: 25, sources: 500, designSteps: 30,
  templateBytes: 4 * 1024 * 1024,
};

// Documents a BA can attach. Images are shrunk to JPEG in the browser before upload.
export const MATERIAL_ACCEPT = '.pdf,.docx,.txt,.md,.csv,.xlsx,.pptx,.png,.jpg,.jpeg,.webp';
export const MATERIAL_HINT = 'PDF, Word (.docx), Excel (.xlsx, .csv), PowerPoint (.pptx), text or images';

// Counts computed from the project itself, so the overview always matches the other tabs.
export function projectStats(p) {
  const counts = Object.fromEntries(FINDING_STATUS.map(s => [s, 0]));
  for (const f of p?.findings || []) counts[f.status] = (counts[f.status] || 0) + 1;
  const items = p?.decisions || [];
  return {
    counts,
    findings: (p?.findings || []).length,
    gaps: (p?.analysis?.gaps || []).length,
    sources: (p?.sources || []).length,
    openItems: items.filter(isOpenItem).length,
    openQuestions: items.filter(d => d.kind === 'QUESTION' && isOpenItem(d)).length,
  };
}

// Plain-text Discovery Summary for the design stage.
export function discoverySummary(p, date = new Date()) {
  const a = p.analysis || {};
  const list = (items, fmt) => (items?.length ? items.map(fmt).join('\n') : '—');
  const items = p.decisions || [];
  const decisions = items.filter(d => d.kind !== 'QUESTION');
  const questions = items.filter(d => d.kind === 'QUESTION');
  return [
    `DISCOVERY SUMMARY — ${p.name}`,
    '',
    `Module / process: ${p.module || '—'}`,
    `Knowledge base: v${p.version}`,
    `Date: ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    '',
    'SUMMARY', a.summary || '—', '',
    'CURRENT STATE', list(a.currentState, (s, i) => `${i + 1}. ${s}`), '',
    'STAKEHOLDERS', list(a.stakeholders, s => `${s.role}: ${s.involvement}`), '',
    'BUSINESS RULES', list(a.businessRules, (r, i) => `${i + 1}. ${r}`), '',
    'FINDINGS', list((p.findings || []).filter(f => f.status !== 'SUPERSEDED'), f => `[${f.status}] ${f.text}${f.source ? ` (source: ${f.source})` : ''}`), '',
    'PAIN POINTS', list(a.painPoints, x => `• ${x.point} — Impact: ${x.impact}`), '',
    'GAP ANALYSIS', list(a.gaps, g => `[${g.priority}] ${g.gap} — ${g.why}`), '',
    'COMPLIANCE FLAGS', list(a.complianceFlags, f => `• ${f}`), '',
    'DECISIONS', list(decisions, d => `[${d.status}] ${d.title}${d.outcome ? ` — Outcome: ${d.outcome}` : d.position ? ` — Position: ${d.position}` : ''}${d.owner ? ` (owner: ${d.owner})` : ''}`), '',
    'QUESTIONS', list(questions, d => `[${d.status}] ${d.title}${d.outcome ? ` — Answer: ${d.outcome}` : d.position ? ` — So far: ${d.position}` : ''}`),
  ].join('\n');
}

// Next minor version: "1.0" -> "1.1", "1.9" -> "1.10".
export function nextVersion(v) {
  const [major, minor] = String(v || '1.0').split('.').map(n => parseInt(n, 10) || 0);
  return `${major || 1}.${minor + 1}`;
}

// ---- download file names ----
// Every download carries the KB version and a date-time stamp, so it never collides
// with an earlier copy that may still be open in Word.

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
const AS_IS = /(?<![a-z0-9])(as)([\s_-]?)(is)(?![a-z0-9])/gi;

export const cleanFileName = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.fileName);

// The project's AS-IS document, if one was uploaded ("As-Is Parole Release Dates.docx").
export function asIsSource(p) {
  const docs = (p?.sources || []).filter(s => /\.(docx?|pdf)$/i.test(s.name || '') && new RegExp(AS_IS.source, 'i').test(s.name || ''));
  docs.sort((a, b) => (/\.docx?$/i.test(b.name) - /\.docx?$/i.test(a.name)) || String(a.addedAt).localeCompare(String(b.addedAt)));
  return docs[0] || null;
}

// "As-Is Parole Release Dates.docx" -> "To-Be Parole Release Dates" (keeping the case style).
export function defaultToBeName(p) {
  const src = asIsSource(p);
  if (!src) return `To-Be ${p?.name || 'Design'}`;
  return src.name.replace(/\.(docx?|pdf)$/i, '').replace(AS_IS, (m, a, sep, b) => {
    const upper = a === a.toUpperCase() && b === b.toUpperCase();
    const lower = a === a.toLowerCase() && b === b.toLowerCase();
    return `${upper ? 'TO' : lower ? 'to' : 'To'}${sep}${upper ? 'BE' : lower ? 'be' : 'Be'}`;
  }).trim();
}

export function toBeFileName(p, date = new Date()) {
  const base = cleanFileName(p?.toBeFileName) || cleanFileName(defaultToBeName(p)) || 'To-Be Design';
  return `${base} - KB v${String(p?.version || '1.0').replace(/[^0-9.]/g, '')} - ${stamp(date)}.docx`;
}

export function registerFileName(p, date = new Date()) {
  const safe = String(p?.name || 'Project').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Project';
  return `${safe}_Open_Items_Register_KBv${String(p?.version || '1.0').replace(/[^0-9.]/g, '')}_${stamp(date).replace(' ', '_')}.html`;
}
