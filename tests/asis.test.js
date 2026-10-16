import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES } from '@/lib/access';
import { defaultToBeName, discoverySummary, nextVersion, projectStats, toBeFileName } from '@/lib/asis';
import { designModel, normalizeDesign } from '@/lib/asis-design';
import { analyseIntake, analyseUpdate, designProcess, fillTemplate } from '@/lib/server/asis/ai';
import { insertOne } from '@/lib/server/store';
import { GET as listProjects, POST as createProject } from '@/app/api/asis/projects/route';
import { DELETE as deleteProject, GET as getProject, PATCH as patchProject } from '@/app/api/asis/projects/[id]/route';
import { POST as analyse } from '@/app/api/asis/projects/[id]/analyse/route';
import { POST as addKnowledge } from '@/app/api/asis/projects/[id]/knowledge/route';
import { POST as addFinding } from '@/app/api/asis/projects/[id]/findings/route';
import { PATCH as updateFinding } from '@/app/api/asis/projects/[id]/findings/[findingId]/route';
import { POST as addItem } from '@/app/api/asis/projects/[id]/decisions/route';
import { DELETE as deleteItem, PATCH as updateItem } from '@/app/api/asis/projects/[id]/decisions/[decisionId]/route';
import { DELETE as purgeDeleted } from '@/app/api/asis/projects/[id]/deleted-items/route';
import { POST as restoreItem } from '@/app/api/asis/projects/[id]/deleted-items/[itemId]/route';
import { PATCH as editDesign, POST as design } from '@/app/api/asis/projects/[id]/design/route';
import { POST as restoreDesign } from '@/app/api/asis/projects/[id]/design/restore/route';
import { GET as designDocx } from '@/app/api/asis/projects/[id]/design/docx/route';
import { POST as fill } from '@/app/api/asis/projects/[id]/design/fill/route';
import { DELETE as removeTemplate, GET as templateFile, POST as uploadTemplate } from '@/app/api/asis/projects/[id]/template/route';
import { SUPPORT_TEXT, call, createUser, ctx, makeDocx, req, textFile, useTempDataDir } from './helpers';

vi.mock('@/lib/server/asis/ai', () => ({ analyseIntake: vi.fn(), analyseUpdate: vi.fn(), designProcess: vi.fn(), fillTemplate: vi.fn() }));

// Multipart body as the workspace sends it: repeatable `files` plus text fields.
function form(files = [], fields = {}) {
  const f = new FormData();
  for (const file of [].concat(files)) f.append('files', file);
  for (const [k, v] of Object.entries(fields)) f.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return f;
}

const BASELINE = {
  summary: 'Tickets are triaged within 4 hours and escalated by severity.',
  currentState: ['Support desk logs the ticket', 'Severity is classified'],
  stakeholders: [{ role: 'Duty Manager', involvement: 'Receives Severity 1 escalations' }],
  businessRules: ['Severity 1 is escalated immediately'],
  complianceFlags: [],
  painPoints: [{ point: 'Manual data entry', impact: 'Delays triage' }],
  gaps: [{ priority: 'HIGH', gap: 'No SLA for Severity 3', why: 'Not documented' }],
  findings: [
    { status: 'CONFIRMED', text: 'Tickets are triaged within 4 hours.', source: 'support-procedure.md' },
    { status: 'PENDING', text: 'Severity 2 review may move to the same day.', source: 'Intake' },
  ],
  decisions: [{ title: 'Severity 2 review timing', description: '', position: 'Next morning', status: 'PENDING', owner: 'Support lead' }],
  questions: ['Who approves Severity 3 timings?'],
};

const EMPTY_OVERVIEW = { summary: '', currentState: [], stakeholders: [], businessRules: [], complianceFlags: [], gaps: [], painPoints: [] };

describe('AS-IS Navigator', () => {
  let admin, analyst, other;
  beforeEach(async () => {
    useTempDataDir();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.mocked(analyseIntake).mockReset().mockResolvedValue({ result: structuredClone(BASELINE), notice: null });
    vi.mocked(analyseUpdate).mockReset();
    vi.mocked(designProcess).mockReset();
    vi.mocked(fillTemplate).mockReset();
    admin = await createUser(ROLES.ADMIN);
    analyst = await createUser(ROLES.EMPLOYEE, 'Ana Lyst');
    other = await createUser(ROLES.EMPLOYEE, 'Otto Other');
  });

  const create = async (body = { name: 'Ticket triage', module: 'Support' }) =>
    (await call(createProject, req('/x', { method: 'POST', user: analyst, body }))).data.project;
  const baseline = (p, files = [textFile(SUPPORT_TEXT)], fields = { problem: 'Slow triage', pains: ['Manual data entry'] }) =>
    call(analyse, req('/x', { method: 'POST', user: analyst, form: form(files, fields) }), { id: p.id });
  const knowledge = (p, fields, files = []) => call(addKnowledge, req('/x', { method: 'POST', user: analyst, form: form(files, fields) }), { id: p.id });
  const ready = async () => (await baseline(await create())).data.project;

  describe('baseline', () => {
    it('requires sign-in and a project name', async () => {
      expect((await call(listProjects, req('/x'))).status).toBe(401);
      expect((await call(createProject, req('/x', { method: 'POST', user: analyst, body: { name: ' ' } }))).status).toBe(400);
    });

    it('builds the baseline once, with questions as open items', async () => {
      const p = await create();
      const res = await baseline(p, [textFile(SUPPORT_TEXT)], { problem: 'Slow triage', pains: ['Manual data entry'], pasted: 'From: duty manager\nWe escalate Sev 1 by phone.', pastedSources: ['Email', 'Bogus'] });
      expect(res.status).toBe(200);
      const done = res.data.project;
      expect(done.version).toBe('1.0');
      expect(done.findings).toHaveLength(2);
      expect(done.decisions.map(d => [d.kind, d.title])).toEqual([['DECISION', 'Severity 2 review timing'], ['QUESTION', 'Who approves Severity 3 timings?']]);
      expect(done.analysis).toMatchObject({ refreshedIn: 'v1.0', gaps: [{ priority: 'HIGH' }] });
      expect(done.analysis.questions).toBeUndefined();
      expect(done.sources.map(s => s.kind)).toEqual(['document', 'pasted']);
      expect(done.intake).toMatchObject({ problem: 'Slow triage', pastedSources: ['Email'], files: ['support-procedure.md'] });
      expect(done.versionHistory[0].changes.pending).toEqual(['Decision: Severity 2 review timing', 'Question: Who approves Severity 3 timings?']);
      expect(projectStats(done)).toMatchObject({ findings: 2, gaps: 1, openItems: 2, openQuestions: 1, sources: 2 });

      const { material } = vi.mocked(analyseIntake).mock.calls[0][0];
      expect(material.documents[0].text).toContain('Escalation Rules');
      expect(material.pasted).toContain('escalate Sev 1');

      const again = await baseline(done);
      expect(again.status).toBe(409);
      expect((await call(patchProject, req('/x', { method: 'PATCH', user: analyst, body: { intake: { problem: 'x' } } }), { id: p.id })).status).toBe(409);
    });

    it('runs on the demo script without an API key, and explains when live Claude is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const p = await create();
      expect((await baseline(p)).data.error.code).toBe('AI_NOT_CONFIGURED');
      const res = await baseline(p, [], { demo: '1' });
      expect(res.status).toBe(200);
      expect(res.data.project.analysis.demo).toBe(true);
      expect(res.data.project.versionHistory[0].note).toContain('demo script');
      expect(analyseIntake).not.toHaveBeenCalled();
    });

    it('reads Excel, PowerPoint, CSV and JPEG attachments, and names the file it rejects', async () => {
      const xlsx = new JSZip();
      xlsx.file('xl/workbook.xml', '<workbook><sheets><sheet name="Calc" sheetId="1"/></sheets></workbook>');
      xlsx.file('xl/sharedStrings.xml', '<sst><si><t>Release date</t></si><si><t>Officer &amp; checker</t></si></sst>');
      xlsx.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>45200</v></c><c r="B2" t="inlineStr"><is><t>Second check</t></is></c></row></sheetData></worksheet>');
      const pptx = new JSZip();
      pptx.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Current process</a:t></a:r></a:p><a:p><a:r><a:t>Excel calculator</a:t></a:r></a:p></p:sld>');
      const files = [
        new File([await xlsx.generateAsync({ type: 'nodebuffer' })], 'calc.xlsx'),
        new File([await pptx.generateAsync({ type: 'nodebuffer' })], 'workshop.pptx'),
        new File(['step,owner\nCalculate,Officer'], 'steps.csv', { type: 'text/csv' }),
        new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'screen.jpg', { type: 'image/jpeg' }),
      ];
      const done = (await baseline(await create(), files)).data.project;
      const { material } = vi.mocked(analyseIntake).mock.calls[0][0];
      expect(material.documents.map(d => d.name)).toEqual(['calc.xlsx', 'workshop.pptx', 'steps.csv']);
      expect(material.documents[0].text).toContain('## Sheet: Calc\nRelease date, Officer & checker\n45200, Second check');
      expect(material.documents[1].text).toContain('## Slide 1\nCurrent process\nExcel calculator');
      expect(material.images).toEqual([{ kind: 'image', name: 'screen.jpg', data: expect.any(String) }]);
      expect(done.sources.find(s => s.kind === 'image')).toMatchObject({ name: 'screen.jpg' });

      const old = await baseline(await create(), [new File(['x'], 'legacy.doc')]);
      expect(old.status).toBe(415);
      expect(old.data.error.message).toContain('legacy.doc');
      expect((await baseline(await create(), [new File(['png'], 'fake.jpg', { type: 'image/jpeg' })])).status).toBe(415);
    });
  });

  describe('add knowledge', () => {
    it('never lets unconfirmed knowledge confirm or retire anything', async () => {
      const p = await ready();
      const [confirmedF, pendingF] = p.findings;
      const question = p.decisions.find(d => d.kind === 'QUESTION');
      vi.mocked(analyseUpdate).mockResolvedValue({
        notice: null,
        result: {
          changes: { new: ['Severity 3 SLA is 2 days'], changed: [], conflicts: [], resolved: [], superseded: [], pending: [] },
          newFindings: [{ status: 'CONFIRMED', text: 'Severity 3 tickets are answered within 2 days.', source: 'Workshop' }],
          resolvedFindingIds: [pendingF.id], supersededFindingIds: [confirmedF.id], conflictingFindingIds: [],
          newOpenItems: [{ kind: 'QUESTION', title: 'Who trains the desk?', description: '', position: '', owner: '' }],
          answeredQuestions: [{ id: question.id, answer: 'The support lead, for now.' }],
          overview: { ...EMPTY_OVERVIEW, summary: 'Updated summary.', businessRules: ['Severity 3 within 2 days'] },
          versionNote: 'Workshop notes added',
        },
      });
      const res = await knowledge(p, { context: 'Workshop notes from 20 Aug', classification: 'PENDING' });
      expect(res.status).toBe(200);
      const u = res.data.project;
      expect(u.version).toBe('1.1');
      expect(u.findings.find(f => f.id === pendingF.id).status).toBe('PENDING');
      expect(u.findings.find(f => f.id === confirmedF.id).status).toBe('CONFLICTING');
      expect(u.findings.at(-1)).toMatchObject({ status: 'PENDING', text: 'Severity 3 tickets are answered within 2 days.' });
      expect(u.decisions.find(d => d.id === question.id)).toMatchObject({ status: 'PENDING', position: 'The support lead, for now.', outcome: '', answeredIn: 'v1.1' });
      expect(u.decisions.at(-1)).toMatchObject({ kind: 'QUESTION', title: 'Who trains the desk?', raisedIn: 'v1.1' });
      // The overview keeps what the update didn't revise.
      expect(u.analysis).toMatchObject({ summary: 'Updated summary.', businessRules: ['Severity 3 within 2 days'], currentState: BASELINE.currentState, refreshedIn: 'v1.1' });
      expect(u.versionHistory.at(-1)).toMatchObject({ version: '1.1', note: 'Workshop notes added', classification: 'PENDING', changes: { new: ['Severity 3 SLA is 2 days'] } });
    });

    it('lets CONFIRMED knowledge resolve findings, supersede them and answer questions', async () => {
      const p = await ready();
      const [confirmedF, pendingF] = p.findings;
      const question = p.decisions.find(d => d.kind === 'QUESTION');
      vi.mocked(analyseUpdate).mockResolvedValue({
        notice: null,
        result: {
          changes: { new: [], changed: [], conflicts: [], resolved: [], superseded: [], pending: [] },
          newFindings: [], resolvedFindingIds: [pendingF.id, 'made-up'], supersededFindingIds: [confirmedF.id], conflictingFindingIds: [],
          newOpenItems: [], answeredQuestions: [{ id: question.id, answer: 'The Duty Manager.' }], overview: EMPTY_OVERVIEW, versionNote: '',
        },
      });
      const refs = [{ source: 'confluence', title: 'Support SLA v3', ref: 'SUP', url: 'https://wiki.example.com/x', text: 'Severity 2 is reviewed the same day.' }];
      const u = (await knowledge(p, { classification: 'CONFIRMED', references: refs })).data.project;
      expect(u.findings.find(f => f.id === pendingF.id)).toMatchObject({ status: 'CONFIRMED' });
      expect(u.findings.find(f => f.id === confirmedF.id)).toMatchObject({ status: 'SUPERSEDED' });
      expect(u.decisions.find(d => d.id === question.id)).toMatchObject({ status: 'CONFIRMED', outcome: 'The Duty Manager.' });
      expect(u.sources.at(-1)).toMatchObject({ kind: 'confluence', name: 'Support SLA v3', version: 'v1.1' });
    });

    it('needs a baseline and something new', async () => {
      const p = await create();
      expect((await knowledge(p, { context: 'Workshop notes' })).status).toBe(409);
      expect((await knowledge(await ready(), {})).status).toBe(400);
    });
  });

  it('upgrades projects saved before open items and per-version changes', async () => {
    const at = new Date().toISOString();
    await insertOne('asisProjects', {
      id: '00000000-0000-4000-8000-000000000001', name: 'Old', module: '', notes: '', version: '1.1',
      versionHistory: [{ version: '1.0', note: 'Project created', at }, { version: '1.1', note: 'Update', at }],
      intake: {}, sources: [], findings: [], analysis: { summary: 'S', questions: ['Who signs off?'], gaps: [] },
      decisions: [{ id: 'd1', title: 'Pick a vendor', status: 'OPEN' }],
      changes: { version: '1.1', classification: 'PENDING', new: ['x'] }, createdAt: at, updatedAt: at,
    });
    const p = (await call(getProject, req('/x', { user: analyst }), { id: '00000000-0000-4000-8000-000000000001' })).data.project;
    expect(p.decisions.map(d => [d.kind, d.title])).toEqual([['DECISION', 'Pick a vendor'], ['QUESTION', 'Who signs off?']]);
    expect(p.analysis.questions).toBeUndefined();
    expect(p.versionHistory[1]).toMatchObject({ classification: 'PENDING', changes: { new: ['x'] } });
    expect(p.changes).toBeNull();
    expect(p.schema).toBe(2);
  });

  it('edits findings and open items, and keeps deleted items restorable', async () => {
    const p = await ready();
    const f = p.findings[1];
    const ok = await call(updateFinding, req('/x', { method: 'PATCH', user: other, body: { status: 'CONFIRMED', note: 'Confirmed in workshop' } }), { id: p.id, findingId: f.id });
    expect(ok.data.project.findings[1]).toMatchObject({ status: 'CONFIRMED', note: 'Confirmed in workshop', updatedByName: 'Otto Other' });
    expect((await call(updateFinding, req('/x', { method: 'PATCH', user: other, body: { status: 'MAYBE' } }), { id: p.id, findingId: f.id })).status).toBe(400);
    await call(addFinding, req('/x', { method: 'POST', user: other, body: { text: 'Night shift uses a paper log.', status: 'ASSUMPTION' } }), { id: p.id });

    const q = (await call(addItem, req('/x', { method: 'POST', user: other, body: { kind: 'QUESTION' } }), { id: p.id })).data.project.decisions.at(-1);
    expect(q).toMatchObject({ kind: 'QUESTION', title: 'New question', status: 'OPEN' });
    const answered = await call(updateItem, req('/x', { method: 'PATCH', user: other, body: { outcome: 'Yes', status: 'CONFIRMED' } }), { id: p.id, decisionId: q.id });
    expect(answered.data.project.decisions.at(-1)).toMatchObject({ outcome: 'Yes', status: 'CONFIRMED', resolvedAt: expect.any(String) });
    expect((await call(updateItem, req('/x', { method: 'PATCH', user: other, body: { owner: 'x'.repeat(101) } }), { id: p.id, decisionId: q.id })).status).toBe(400);

    const first = p.decisions[0];
    const del = (await call(deleteItem, req('/x', { method: 'DELETE', user: other }), { id: p.id, decisionId: first.id })).data.project;
    expect(del.decisions.some(d => d.id === first.id)).toBe(false);
    expect(del.deletedItems[0]).toMatchObject({ id: first.id, deletedByName: 'Otto Other' });
    const back = (await call(restoreItem, req('/x', { method: 'POST', user: analyst }), { id: p.id, itemId: first.id })).data.project;
    expect(back.decisions[0].id).toBe(first.id);
    expect(back.deletedItems).toEqual([]);
    await call(deleteItem, req('/x', { method: 'DELETE', user: other }), { id: p.id, decisionId: first.id });
    expect((await call(purgeDeleted, req('/x', { method: 'DELETE', user: other }), { id: p.id })).data.project.deletedItems).toEqual([]);
  });

  describe('TO-BE design', () => {
    const DESIGN = {
      summary: 'Triage in the OMS queue.', principles: ['One queue'],
      steps: [
        { id: 'T1', name: 'Log ticket in OMS', actor: 'Desk', system: 'OMS', change: 'CHANGED', description: 'd', replaces: ['A1'], basedOn: ['F1'] },
        { id: 'T2', name: 'Auto-classify severity', actor: 'System', system: 'OMS', change: 'AUTOMATED', description: 'd', replaces: ['A2', 'A9'], basedOn: ['F2', 'Q1', 'X7'] },
      ],
      traceability: [{ ref: 'P1', resolution: 'Automated.', steps: ['T2', 'T9'], status: 'ADDRESSED' }, { ref: 'P1', resolution: 'dup', steps: [], status: 'PARTIAL' }],
      assumptions: [{ text: 'Desk adopts OMS', basedOn: ['D1'] }],
      directionApplied: [{ instruction: 'Keep a human check', status: 'APPLIED', how: 'Step 2' }],
      changeNote: '',
    };

    it('normalises the AI design and flags steps that rest on unconfirmed knowledge', async () => {
      const p = await ready();
      const d = normalizeDesign(DESIGN, p, 'Keep a human check.');
      expect(d.steps[1].replaces.map(r => r.ref)).toEqual(['A2']);
      expect(d.steps[1].basedOn.map(r => r.ref)).toEqual(['F2', 'Q1']);
      expect(d.traceability.map(t => [t.ref, t.status, t.stepIds])).toEqual([['P1', 'ADDRESSED', ['T2']], ['G1', 'NOT_ADDRESSED', []]]);
      const m = designModel({ ...p, design: d });
      expect(m.flaggedSteps).toBe(1);
      expect(m.validation.map(v => [v.kind, v.live.status, v.steps])).toEqual([['finding', 'PENDING', [2]], ['question', 'OPEN', [2]], ['decision', 'PENDING', []]]);
      expect(m.coverage).toEqual({ total: 2, addressed: 1, partial: 0, none: 1 });
      expect(m.stale).toBe(false);
    });

    it('generates, edits, restores and downloads the design', async () => {
      const p = await ready();
      vi.mocked(designProcess).mockResolvedValue(structuredClone(DESIGN));
      const made = await call(design, req('/x', { method: 'POST', user: analyst, body: { direction: 'Keep a human check.' } }), { id: p.id });
      expect(made.status).toBe(200);
      expect(made.data.project.design).toMatchObject({ basedOnKb: 'v1.0', direction: 'Keep a human check.', generatedByName: 'Ana Lyst' });
      expect(made.data.project.designPrev).toBeNull();

      const steps = [...made.data.project.design.steps].reverse().map(s => ({ ...s, name: `${s.name}!` }));
      const edited = (await call(editDesign, req('/x', { method: 'PATCH', user: other, body: { steps, traceability: [{ ref: 'G1', status: 'PARTIAL', resolution: 'Later phase.' }] } }), { id: p.id })).data.project.design;
      expect(edited.steps.map(s => s.name)).toEqual(['Auto-classify severity!', 'Log ticket in OMS!']);
      expect(edited.traceability).toEqual([expect.objectContaining({ ref: 'G1', status: 'PARTIAL', resolution: 'Later phase.' })]);
      expect((await call(editDesign, req('/x', { method: 'PATCH', user: other, body: { steps: [{ name: 'x', change: 'TELEPORTED' }] } }), { id: p.id })).status).toBe(400);

      // Regenerating keeps the edited version as the previous design, which can be swapped back.
      const demo = (await call(design, req('/x', { method: 'POST', user: analyst, body: { demo: true, direction: 'Use OMS. Keep two checks.' } }), { id: p.id })).data.project;
      expect(demo.design).toMatchObject({ demo: true, directionApplied: [{ instruction: 'Use OMS', status: 'APPLIED' }, { instruction: 'Keep two checks', status: 'APPLIED' }] });
      expect(demo.designPrev).toMatchObject({ basedOnKb: 'v1.0' });
      const restored = (await call(restoreDesign, req('/x', { method: 'POST', user: analyst }), { id: p.id })).data.project;
      expect(restored.design.steps[0].name).toBe('Auto-classify severity!');

      const res = await designDocx(req('/x', { user: other }), ctx({ id: p.id }));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toMatch(/To-Be Ticket triage - KB v1\.0 - \d{4}-\d{2}-\d{2} \d{4}\.docx/);
      const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
      const xml = await zip.file('word/document.xml').async('string');
      expect(xml).toContain('TO-BE Process Design');
      expect(xml).toContain('Auto-classify severity!');
    });

    it('stores a TO-BE template and fills it batch by batch, reusing content while it is current', async () => {
      const p = await ready();
      await call(design, req('/x', { method: 'POST', user: analyst, body: { demo: true } }), { id: p.id });
      const outline = {
        sections: [
          { id: 'S1', level: 1, heading: 'Purpose', guidance: 'Describe the purpose.', tables: [] },
          { id: 'S2', level: 1, heading: 'As-Is Business Process Map', guidance: '', hasImage: true, tables: [] },
          { id: 'S3', level: 1, heading: 'Requirements', guidance: '', tables: ['T2'] },
          { id: 'S4', level: 1, heading: 'Open Issues', guidance: '', tables: [] },
          { id: 'bad', level: 1, heading: 'Dropped', tables: [] },
        ],
        tables: [{ id: 'T1', section: 'S0', columns: ['Version', 'Date', 'Change', 'Author'], examples: [] }, { id: 'T2', section: 'S3', columns: ['Process', 'Ref', 'Requirement'], examples: [] }],
        fixedTexts: ['[Process Name] As-Is Definition'],
      };
      const docx = new File([await makeDocx([{ heading: 'Purpose' }, { text: 'Describe the purpose.' }])], 'Template.dotx');
      const upForm = new FormData();
      upForm.set('file', docx);
      upForm.set('outline', JSON.stringify(outline));
      const up = await call(uploadTemplate, req('/x', { method: 'POST', user: analyst, form: upForm }), { id: p.id });
      expect(up.status).toBe(200);
      expect(up.data.project.toBeTemplate).toMatchObject({ name: 'Template.dotx', sectionCount: 4, tableCount: 2, batchCount: 2 });
      expect(up.data.project.toBeTemplate.storageKey).toBeUndefined();

      const file = await templateFile(req('/x', { user: other }), ctx({ id: p.id }));
      expect(Buffer.from(await file.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');

      const first = await call(fill, req('/x', { method: 'POST', user: analyst, body: { batch: 0, demo: true, today: '16/10/2026' } }), { id: p.id });
      expect(first.data).toMatchObject({ batchCount: 2, cached: false });
      expect(first.data.result.sections.map(s => [s.id, s.action, s.newHeading])).toEqual([['S1', 'replace', ''], ['S2', 'replace', 'To-Be Business Process Map'], ['S3', 'replace', '']]);
      expect(first.data.result.replacements).toContainEqual({ find: '[Process Name]', replace: 'Parole Release Date Calculation' });
      expect((await call(fill, req('/x', { method: 'POST', user: analyst, body: { batch: 0, demo: true } }), { id: p.id })).data.cached).toBe(true);
      expect((await call(fill, req('/x', { method: 'POST', user: analyst, body: { batch: 2, demo: true } }), { id: p.id })).status).toBe(400);

      // Live fills go through Claude, and a changed knowledge base invalidates the cache.
      vi.mocked(fillTemplate).mockResolvedValue({ replacements: [], sections: [{ id: 'S4', action: 'replace', newHeading: '', blocks: [{ type: 'bullets', text: '', items: ['Who approves?'] }], tables: [] }], coverTables: [] });
      expect((await call(fill, req('/x', { method: 'POST', user: analyst, body: { batch: 1 } }), { id: p.id })).data.result.sections[0].blocks[0].items).toEqual(['Who approves?']);
      await call(addFinding, req('/x', { method: 'POST', user: other, body: { text: 'New fact' } }), { id: p.id });
      expect((await call(fill, req('/x', { method: 'POST', user: analyst, body: { batch: 0, demo: true } }), { id: p.id })).data.cached).toBe(false);

      const bad = new FormData();
      bad.set('file', new File(['x'], 'template.doc'));
      bad.set('outline', JSON.stringify(outline));
      expect((await call(uploadTemplate, req('/x', { method: 'POST', user: analyst, form: bad }), { id: p.id })).status).toBe(415);
      expect((await call(removeTemplate, req('/x', { method: 'DELETE', user: analyst }), { id: p.id })).data.project.toBeTemplate).toBeNull();
    });

    it('needs a baseline first', async () => {
      const p = await create();
      expect((await call(design, req('/x', { method: 'POST', user: analyst, body: { demo: true } }), { id: p.id })).status).toBe(409);
    });
  });

  it('only lets the creator or an admin delete a project', async () => {
    const p = await create();
    expect((await call(deleteProject, req('/x', { method: 'DELETE', user: other }), { id: p.id })).status).toBe(403);
    expect((await call(deleteProject, req('/x', { method: 'DELETE', user: admin }), { id: p.id })).status).toBe(200);
    expect((await call(getProject, req('/x', { user: analyst }), { id: p.id })).status).toBe(404);
  });

  it('names downloads after the AS-IS document and builds the discovery summary', () => {
    expect(nextVersion('1.9')).toBe('1.10');
    const p = { name: 'P', version: '1.2', sources: [{ name: 'notes.txt' }, { name: 'As-Is Parole Release Dates.docx', addedAt: '1' }] };
    expect(defaultToBeName(p)).toBe('To-Be Parole Release Dates');
    expect(defaultToBeName({ ...p, sources: [{ name: 'AS_IS calc.pdf' }] })).toBe('TO_BE calc');
    expect(toBeFileName({ ...p, toBeFileName: 'My: Design' }, new Date(2026, 9, 16, 9, 5))).toBe('My Design - KB v1.2 - 2026-10-16 0905.docx');
    const text = discoverySummary({ ...p, findings: [{ status: 'PENDING', text: 'X' }], decisions: [{ kind: 'QUESTION', status: 'OPEN', title: 'Q?' }], analysis: { summary: 'S' } });
    expect(text).toContain('[PENDING] X');
    expect(text).toContain('QUESTIONS\n[OPEN] Q?');
  });
});
