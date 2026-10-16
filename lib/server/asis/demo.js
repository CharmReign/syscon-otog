// Demo script: answers every AI step of the AS-IS Navigator from a fictional sample
// (parole release date calculation), whatever was uploaded. Rehearsals cost no API
// credits and still work offline. Projects record that their content came from the script.

const BASELINE = {
  summary: 'Parole officers calculate release dates by hand in Excel, and a second officer re-checks every calculation before the date is keyed back into OMS. The process is slow, error-prone and leaves no audit trail.',
  currentState: ['Officer pulls sentence details from OMS', 'Officer calculates the release date in an Excel calculator', 'Second officer re-checks the calculation', 'Date is keyed back into OMS', 'Case note records the calculation'],
  stakeholders: [{ role: 'Parole Officer', involvement: 'Calculates release dates' }, { role: 'Second Officer', involvement: 'Verifies each calculation' }, { role: 'Records Supervisor', involvement: 'Signs off disputed dates' }],
  businessRules: ['Every release date needs two-person verification', 'Concurrent sentences are calculated from the latest commencement date'],
  complianceFlags: ['Calculation audit trail required by the Corrections Act'],
  painPoints: [{ point: 'Manual calculation in Excel', impact: 'Errors and up to 2-day delays' }, { point: 'Re-keying dates into OMS', impact: 'Transcription errors' }],
  gaps: [{ priority: 'HIGH', gap: 'OMS sentence calculator not trusted', why: 'Known defect with concurrent sentences' }, { priority: 'MEDIUM', gap: 'No audit trail of calculations', why: 'Excel files on a shared drive' }],
  findings: [
    { status: 'CONFIRMED', text: 'Officers keep Excel calculators on a shared drive', source: 'As-Is Parole Release Date Calculation' },
    { status: 'CONFIRMED', text: 'Every calculated date is re-checked by a second officer', source: 'As-Is Parole Release Date Calculation' },
    { status: 'PENDING', text: 'The OMS calculator defect with concurrent sentences may be fixed in release 24.2', source: 'Workshop notes' },
    { status: 'ASSUMPTION', text: 'Supervisors would accept a system-generated calculation report as the audit record', source: 'BA assumption' },
  ],
  decisions: [{ title: 'Fix the OMS calculator or build a new rules engine?', description: 'The current calculator mis-handles concurrent sentences.', position: 'Leaning towards fixing the OMS calculator', status: 'OPEN', owner: 'IT Lead' }],
  questions: ['Does legislation require a human second check?'],
};

const DESIGN = {
  summary: 'Release dates are calculated in OMS with an automatic calculation trace, and the second officer verifies the trace in OMS instead of re-calculating. Excel and re-keying are removed.',
  principles: ['Single source of truth in OMS', 'Keep the two-person check', 'Audit every calculation'],
  steps: [
    { id: 'T1', name: 'Validate sentence details in OMS', actor: 'Parole Officer', system: 'Syscon OMS', change: 'CHANGED', description: 'The officer confirms the sentence components on the OMS sentence screen.', replaces: ['A1'], basedOn: ['F1'] },
    { id: 'T2', name: 'OMS calculates the release date', actor: 'System', system: 'OMS sentence calculator', change: 'AUTOMATED', description: 'OMS calculates the date and records a calculation trace.', replaces: ['A2'], basedOn: ['F3', 'D1', 'P1', 'G1'] },
    { id: 'T3', name: 'Second officer verifies in OMS', actor: 'Second Officer', system: 'Syscon OMS', change: 'CHANGED', description: 'The second officer reviews the trace and approves the date in OMS.', replaces: ['A3'], basedOn: ['Q1', 'F4'] },
    { id: 'T4', name: 'Re-key date into OMS', actor: '—', system: '—', change: 'REMOVED', description: 'No longer needed: the date is already in OMS.', replaces: ['A4'], basedOn: ['P2'] },
    { id: 'T5', name: 'Calculation report saved as audit record', actor: 'System', system: 'Syscon OMS', change: 'NEW', description: 'The calculation trace is stored against the offender as the audit record.', replaces: ['A5'], basedOn: ['G2', 'F4'] },
  ],
  traceability: [
    { ref: 'P1', resolution: 'The calculation is automated in OMS.', steps: ['T2'], status: 'ADDRESSED' },
    { ref: 'P2', resolution: 'Re-keying is removed.', steps: ['T4'], status: 'ADDRESSED' },
    { ref: 'G1', resolution: 'Depends on the release 24.2 fix being deployed.', steps: ['T2'], status: 'PARTIAL' },
    { ref: 'G2', resolution: 'The calculation trace becomes the audit record.', steps: ['T5'], status: 'ADDRESSED' },
  ],
  assumptions: [{ text: 'Release 24.2 is deployed before go-live', basedOn: ['F3'] }],
  changeNote: 'Applied the latest knowledge base',
};

const wait = () => new Promise(r => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : 900));

export async function demoIntake() {
  await wait();
  return { result: structuredClone(BASELINE), notice: null };
}

export async function demoUpdate({ project }) {
  await wait();
  const pendingDefect = project.findings.find(f => /calculator defect/i.test(f.text) && f.status !== 'CONFIRMED');
  return {
    notice: null,
    result: {
      changes: { new: ['Release 24.2 fixes concurrent-sentence calculation (vendor confirmed)'], changed: ['Records Supervisor now owns sign-off of disputed dates'], conflicts: [], resolved: pendingDefect ? ['Release 24.2 fix confirmed'] : [], superseded: [], pending: ['Training plan for the new calculator'] },
      newFindings: [{ status: 'CONFIRMED', text: 'Vendor confirmed release 24.2 fixes the concurrent-sentence defect', source: 'Workshop notes' }],
      resolvedFindingIds: pendingDefect ? [pendingDefect.id] : [],
      supersededFindingIds: [],
      conflictingFindingIds: [],
      newOpenItems: [{ kind: 'QUESTION', title: 'Who trains officers on the updated calculator?', description: '', position: '', owner: '' }],
      answeredQuestions: [],
      overview: { summary: '', currentState: [], stakeholders: [], businessRules: [], complianceFlags: [], gaps: [], painPoints: [] },
      versionNote: 'Workshop notes: release 24.2 fix confirmed, supervisor sign-off clarified',
    },
  };
}

export async function demoDesign({ direction }) {
  await wait();
  const instructions = (direction || '').split(/(?<=[.;!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 3).slice(0, 8);
  return {
    ...structuredClone(DESIGN),
    directionApplied: instructions.map(s => ({ instruction: s.replace(/[.;]$/, ''), status: 'APPLIED', how: 'Demo script: shown as applied. With live Claude each instruction is checked against the design.' })),
  };
}

// Template content for one batch, chosen from each section's heading.
export async function demoFill({ outline, batch, first, today }) {
  await wait();
  const steps = DESIGN.steps.filter(s => s.change !== 'REMOVED');
  const pad = (row, n) => { const r = row.slice(0, n); while (r.length < n) r.push(''); return r; };
  const rowsFor = (h, n) => {
    if (/process description|business process|activit/.test(h)) return steps.map(s => pad([s.name, 'TBC', s.description, s.actor], n));
    if (/input/.test(h)) return [pad(['Sentence details', 'Syscon OMS', 'Sentence components recorded against the offender'], n)];
    if (/requirement/.test(h)) return [pad(['Calculate Release Date', 'TBC', 'Ability to calculate release dates for concurrent sentences'], n), pad(['Verify Calculation', 'TBC', 'Ability for a second officer to approve a calculated date'], n)];
    if (/rule/.test(h)) return [pad(['Verify Calculation', 'TBC', 'Every release date needs two-person verification'], n)];
    if (/system/.test(h)) return [pad(['Syscon OMS', 'Calculate, verify and record release dates\nStore the calculation trace'], n)];
    if (/output/.test(h)) return [pad(['Release date record', 'Syscon OMS', ''], n), pad(['Calculation audit report', 'Syscon OMS', 'Meets the audit trail requirement'], n)];
    if (/pain/.test(h)) return [pad(['PP1', 'Manual calculation: addressed, the calculation is automated in OMS'], n), pad(['PP2', 'Re-keying into OMS: addressed, re-keying is removed'], n)];
    if (/issue|risk|open/.test(h)) return [pad(['1', 'TBC', 'Fix the OMS calculator or build a new rules engine? (⚑ to be validated)', 'Open'], n)];
    if (/revision|version/.test(h)) return [pad(['0.1', today, 'First draft — generated by AS-IS Navigator', 'TBC'], n)];
    return [];
  };
  const tablesById = Object.fromEntries(outline.tables.map(t => [t.id, t]));
  const sections = batch.map(s => {
    const h = String(s.heading || '').toLowerCase();
    const tables = (s.tables || []).map(id => {
      const cols = tablesById[id]?.columns || [];
      const n = cols.length || 2;
      const rows = rowsFor(h, n);
      return { id, rows: rows.length ? rows : rowsFor(cols.join(' ').toLowerCase(), n) };
    });
    let blocks;
    if (/purpose/.test(h)) blocks = [{ type: 'paragraph', text: 'This document defines the To-Be process and high-level requirements for calculating parole release dates, based on the As-Is analysis in AS-IS Navigator.', items: [] }];
    else if (/scope/.test(h)) blocks = [{ type: 'bullets', text: '', items: ['Calculating, verifying and recording release dates in Syscon OMS', 'Removing the manual Excel calculation and re-keying'] }];
    else if (/assumption/.test(h)) blocks = [{ type: 'bullets', text: '', items: DESIGN.assumptions.map(a => `${a.text} (⚑ to be validated)`) }];
    else if (/map|diagram|flow/.test(h)) blocks = [{ type: 'numbered', text: '', items: steps.map(s => s.name) }, { type: 'paragraph', text: '[Insert updated To-Be process map]', items: [] }];
    else if (/overview|summary/.test(h)) blocks = [{ type: 'paragraph', text: DESIGN.summary, items: [] }];
    else if (tables.length) blocks = [];
    else if (!s.guidance && !s.hasImage) blocks = null; // a heading with only sub-sections under it
    else blocks = [{ type: 'paragraph', text: DESIGN.summary, items: [] }];
    const keep = blocks === null || (/documentation|approval|table of contents/.test(h) && !tables.length);
    return { id: s.id, action: keep ? 'keep' : 'replace', newHeading: /as-is/i.test(s.heading) ? s.heading.replace(/as-is/ig, 'To-Be') : '', blocks: blocks || [], tables };
  });
  const known = [[/\[(module|oms module)\]/i, 'Sentence Management'], [/\[(process|process name|project|project name)\]/i, 'Parole Release Date Calculation'], [/\[(author|author name)\]/i, 'TBC'], [/\[(date|date created)\]/i, today], [/\[(version)\]/i, '0.1']];
  const replacements = [{ find: 'As-Is', replace: 'To-Be' }];
  for (const text of first ? outline.fixedTexts : []) {
    for (const tok of String(text).match(/\[[^\]]{2,40}\]/g) || []) {
      const k = known.find(([re]) => re.test(tok));
      if (k && !replacements.some(r => r.find === tok)) replacements.push({ find: tok, replace: k[1] });
    }
  }
  return { replacements: first ? replacements : [], sections, coverTables: [] };
}
