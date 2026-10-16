// Client Defect Triage: constants and helpers shared by the UI and the server.
// Keep this file free of Node-only imports; client components use it.

// What a drafted reply turned out to be. `deflected` replies were resolved without
// developer work; that drives the Results tab.
export const CATEGORIES = {
  'How-to': { tone: 'cyan', deflected: true },
  'Expected behaviour': { tone: 'green', deflected: true },
  'Known issue with workaround': { tone: 'amber', deflected: true },
  'New defect': { tone: 'red', deflected: false },
  'Needs more info': { tone: 'cyan', deflected: false },
  'No approved reference': { tone: 'gray', deflected: false },
};
export const CATEGORY_NAMES = Object.keys(CATEGORIES);
export const HOLDING = 'No approved reference';

export const CONFIDENCE = ['High', 'Medium', 'Low'];
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const MODULES = ['Admissions', 'Accommodation', 'Classification', 'Sentence Management', 'Parole',
  'Movements', 'Programs & Services', 'Reporting', 'Audit', 'Other / Unclear'];
export const CHANNELS = ['Email', 'Chat', 'Teams', 'Phone note'];

// Review status of a draft. Nothing is ever sent by the platform; "Sent" is recorded
// by the agent after they paste the reply into their email or chat.
export const DRAFT_STATUS = ['Draft', 'Approved', 'Sent'];
export const DRAFT_TONE = { Draft: 'gray', Approved: 'cyan', Sent: 'green' };

// Library references uploaded or pasted by the team (exports live search can't reach).
export const SOURCE_TYPES = ['Confluence', 'Jira', 'Email'];
// Every reference type a draft can cite: the library types plus platform documents.
export const REF_TONE = { Confluence: 'cyan', Jira: 'amber', Email: 'gray', Document: 'green' };

export const LIMITS = {
  refsToAi: 6, refCharsToAi: 900, imagesToAi: 4, videoFrames: 3, imageMaxWidth: 1280,
  attachments: 12, attachmentBytes: 2 * 1024 * 1024, body: 20_000, sourceChars: 4000,
};

// ── keyword ranking (no AI cost) ───────────────────────────
const STOP = new Set('the a an and or but to of in on for with at by from is are was were be been it its this that these those i we you they he she my our your their me us them can cant can\'t could would should will just not no yes do does did have has had what which who when where why how there here so if then than too very also all any some get got still since about into out up down over again same other only one two three hi hello thanks thank please regards good morning'.split(' '));

export function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/**
 * Ranks references against a client query, BM25-style. refs: [{ id, title, text }].
 * Returns [{ ref, score, hits }], best first; a reference must match at least two terms.
 */
export function rankRefs(query, refs, k = LIMITS.refsToAi) {
  const qText = `${query.subject || ''} ${query.body || ''}`;
  const qTerms = [...new Set(tokens(qText))];
  if (!qTerms.length || !refs.length) return [];
  const docs = refs.map(r => ({ r, title: tokens(r.title), body: tokens(r.text) }));
  const df = {};
  docs.forEach(d => new Set([...d.title, ...d.body]).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  const N = docs.length;
  return docs.map(d => {
    let score = 0;
    const hits = [];
    qTerms.forEach(t => {
      const tf = d.title.filter(x => x === t).length * 2 + d.body.filter(x => x === t).length;
      if (!tf) return;
      score += Math.log(1 + N / (df[t] || 1)) * (tf / (tf + 1.2));
      hits.push(t);
    });
    if (qText.toUpperCase().includes(String(d.r.id).toUpperCase())) score += 5; // ticket key quoted by the client
    return { ref: d.r, score, hits };
  }).filter(x => x.score > 0 && x.hits.length >= 2)
    .sort((a, b) => b.score - a.score).slice(0, k);
}

const VAGUE = new Set(('system error issue problem help today yesterday tomorrow work working tried trying need needs still please urgent asap new update ' +
  'something anything everything nothing different another people person client staff thing seem seems wrong right shows showing because').split(' '));

// Up to 6 words for Jira and Confluence search: subject words first (they name the
// problem), then the longest body words.
export function searchTerms(q, max = 6) {
  const seen = new Set();
  const pick = text => tokens(text).map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 3 && !VAGUE.has(t) && !seen.has(t) && seen.add(t));
  const subject = pick(q.subject);
  const body = pick(q.body).sort((a, b) => b.length - a.length);
  return [...subject, ...body].slice(0, max);
}

// ── reply and ticket text ──────────────────────────────────
export function composeReply(q, d) {
  if (d.category === HOLDING) {
    return `Hi,\n\nThanks for your question about "${q.subject}". We're checking this with our ${d.escalate || 'product team'} so we can give you an accurate answer, and we'll come back to you by end of day.\n\nKind regards,\nOTOG Support`;
  }
  const steps = d.steps.length ? `\n\nTo unblock this now:\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '';
  const ask = d.jira?.missingInfo?.length ? `\n\nTo help us fix this faster, could you send:\n${d.jira.missingInfo.map(s => `- ${s}`).join('\n')}` : '';
  return `Hi,\n\n${d.answer}${steps}\n\n${d.resolution}${ask}\n\nKind regards,\nOTOG Support`;
}

export function jiraText(q, d) {
  const j = d.jira;
  return `Summary: ${j.summary}
Module: ${d.module}
Severity: ${j.severity}
Reported by: ${q.from} via ${q.channel} (${q.receivedAt ? new Date(q.receivedAt).toLocaleString('en-AU') : ''})
Environment: ${j.environment}

Steps to reproduce:
${j.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Expected: ${j.expected}
Actual: ${j.actual}

Client impact: ${j.impact}
Workaround given to client: ${j.workaround || 'None'}
Still needed from client: ${j.missingInfo.join('; ') || 'Nothing'}
Attachments from client: ${attachmentNames(q.attachments).join(', ') || 'None'}
References checked: ${d.refs.join(', ') || 'None'}

Original message:
${q.body}`;
}

const csvCell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

// One-row CSV for Jira's CSV importer.
export const jiraCsv = (q, d) =>
  ['Summary,Issue Type,Priority,Component,Description', [d.jira.summary, 'Bug', d.jira.severity, d.module, jiraText(q, d)].map(csvCell).join(',')].join('\n');

// Original file names; a video's frames share one name.
export const attachmentNames = (list = []) => [...new Set(list.map(a => a.name))];

export function attachmentSummary(list = []) {
  const img = list.filter(a => a.kind === 'image').length;
  const vid = new Set(list.filter(a => a.kind === 'frame').map(a => a.name)).size;
  return [img && `${img} screenshot${img === 1 ? '' : 's'}`, vid && `${vid} video${vid === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
}

// ── Results tab ────────────────────────────────────────────
// queries: list summaries, each with `draft` ({ category, status, draftSeconds, refs }) or null.
export function triageStats(queries) {
  const done = queries.map(x => x.draft).filter(Boolean);
  const reviewed = done.filter(d => d.status !== 'Draft');
  const deflected = reviewed.filter(d => CATEGORIES[d.category]?.deflected).length;
  const toDev = reviewed.filter(d => d.category === 'New defect').length;
  return {
    drafted: done.length,
    reviewed: reviewed.length,
    deflected,
    toDev,
    pending: reviewed.length - deflected - toDev,
    rate: reviewed.length ? Math.round((100 * deflected) / reviewed.length) : 0,
    avgSeconds: done.length ? Math.round(done.reduce((a, d) => a + (d.draftSeconds || 0), 0) / done.length) : 0,
    byCategory: CATEGORY_NAMES.map(c => [c, done.filter(d => d.category === c).length]).filter(([, n]) => n),
    citations: done.reduce((a, d) => a + (d.refs?.length || 0), 0),
  };
}

// ── importers for exported content (run in the browser) ────
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Jira "Export > CSV (all fields)" or a hand-made sheet with Key/Summary/Status/Description columns.
export function jiraFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const h = rows[0].map(x => x.trim().toLowerCase());
  const col = (...names) => h.findIndex(x => names.some(n => x === n || x.includes(n)));
  const iKey = col('issue key', 'key'), iSum = col('summary'), iStatus = col('status'),
    iDesc = col('description'), iFix = col('fix version'), iRes = col('resolution'), iWork = col('workaround');
  if (iKey < 0 || iSum < 0) throw new Error('The CSV needs at least \'Issue key\' and \'Summary\' columns.');
  return rows.slice(1).map(r => ({
    id: (r[iKey] || '').trim(), type: 'Jira', title: (r[iSum] || '').trim(),
    text: [iStatus >= 0 && r[iStatus] && `Status: ${r[iStatus]}`, iFix >= 0 && r[iFix] && `Fix version: ${r[iFix]}`,
      iRes >= 0 && r[iRes] && `Resolution: ${r[iRes]}`, iWork >= 0 && r[iWork] && `Workaround: ${r[iWork]}`,
      iDesc >= 0 && r[iDesc]].filter(Boolean).join('. ').slice(0, LIMITS.sourceChars),
  })).filter(r => r.id && r.title);
}

// A saved email (.eml or .txt): the Subject header becomes the title, headers are dropped.
export function emailFromText(raw, fallbackTitle) {
  const m = raw.match(/^subject:\s*(.+)$/im);
  const split = raw.search(/\r?\n\r?\n/);
  const body = split > 0 && /^[\w-]+:/m.test(raw.slice(0, split)) ? raw.slice(split).trim() : raw.trim();
  return { title: m ? m[1].trim() : fallbackTitle, text: body.replace(/\s+/g, ' ').slice(0, LIMITS.sourceChars) };
}
