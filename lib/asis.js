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

export const DECISION_STATUS = ['OPEN', 'PENDING', 'PROPOSED', 'CONFIRMED', 'SUPERSEDED'];
export const DECISION_TONE = { OPEN: 'amber', PENDING: 'amber', PROPOSED: 'cyan', CONFIRMED: 'green', SUPERSEDED: 'gray' };

export const GAP_PRIORITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const GAP_TONE = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'cyan', LOW: 'gray' };

export const PAIN_POINTS = [
  'Manual sentence calculation', 'Duplicate offender records', 'No real-time data sharing',
  'Audit trail gaps', 'Inefficient parole processing', 'Missing risk assessment steps',
  'Inter-agency data delays', 'Compliance reporting gaps', 'Manual data entry',
  'System integration failures', 'Inadequate reporting', 'Poor data visibility',
];

// Groups of "What changed?" after knowledge is added.
export const CHANGE_GROUPS = [
  { key: 'new', label: 'New', tone: 'green' },
  { key: 'changed', label: 'Changed', tone: 'amber' },
  { key: 'pending', label: 'Pending', tone: 'amber' },
  { key: 'conflicts', label: 'Conflicts', tone: 'red' },
  { key: 'resolved', label: 'Resolved', tone: 'green' },
  { key: 'superseded', label: 'Superseded', tone: 'gray' },
];

export const SOURCE_KINDS = { DOCUMENT: 'document', NOTE: 'note', INTERNAL: 'internal', CONFLUENCE: 'confluence', JIRA: 'jira' };

// Counts computed from the findings themselves, so the dashboard always matches the Findings tab.
export function projectStats(p) {
  const counts = Object.fromEntries(FINDING_STATUS.map(s => [s, 0]));
  for (const f of p?.findings || []) counts[f.status] = (counts[f.status] || 0) + 1;
  return {
    counts,
    findings: (p?.findings || []).length,
    gaps: (p?.analysis?.gaps || []).length,
    questions: (p?.analysis?.questions || []).length,
    sources: (p?.sources || []).length,
    decisionsOpen: (p?.decisions || []).filter(d => d.status !== 'CONFIRMED' && d.status !== 'SUPERSEDED').length,
  };
}

// Plain-text Discovery Summary handed to the next stage (future-state design).
export function discoverySummary(p, date = new Date()) {
  const a = p.analysis || {};
  const list = (items, fmt) => (items?.length ? items.map(fmt).join('\n') : '—');
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
    'FINDINGS', list(p.findings, f => `[${f.status}] ${f.text}${f.source ? ` (source: ${f.source})` : ''}`), '',
    'PAIN POINTS', list(a.painPoints, x => `• ${x.point} — Impact: ${x.impact}`), '',
    'GAP ANALYSIS', list(a.gaps, g => `[${g.priority}] ${g.gap} — ${g.why}`), '',
    'COMPLIANCE FLAGS', list(a.complianceFlags, f => `• ${f}`), '',
    'DECISIONS', list(p.decisions, d => `${d.title}: ${d.status}${d.position ? ` — ${d.position}` : ''}${d.owner ? ` (owner: ${d.owner})` : ''}`), '',
    'OUTSTANDING QUESTIONS', list(a.questions, (q, i) => `${i + 1}. ${q}`),
  ].join('\n');
}

// Next minor version: "1.0" -> "1.1", "1.9" -> "1.10".
export function nextVersion(v) {
  const [major, minor] = String(v || '1.0').split('.').map(n => parseInt(n, 10) || 0);
  return `${major || 1}.${minor + 1}`;
}
