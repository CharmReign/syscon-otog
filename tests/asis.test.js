import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES } from '@/lib/access';
import { discoverySummary, nextVersion, projectStats } from '@/lib/asis';
import { analyseIntake, analyseUpdate } from '@/lib/server/asis/ai';
import { GET as listProjects, POST as createProject } from '@/app/api/asis/projects/route';
import { DELETE as deleteProject, GET as getProject } from '@/app/api/asis/projects/[id]/route';
import { POST as analyse } from '@/app/api/asis/projects/[id]/analyse/route';
import { POST as addKnowledge } from '@/app/api/asis/projects/[id]/knowledge/route';
import { POST as addFinding } from '@/app/api/asis/projects/[id]/findings/route';
import { PATCH as updateFinding } from '@/app/api/asis/projects/[id]/findings/[findingId]/route';
import { POST as addDecision } from '@/app/api/asis/projects/[id]/decisions/route';
import { PATCH as updateDecision } from '@/app/api/asis/projects/[id]/decisions/[decisionId]/route';
import { SUPPORT_TEXT, call, createUser, req, textFile, useTempDataDir } from './helpers';

// Multipart body as the workspace sends it: repeatable `files` plus text fields.
function uploadForm(file, fields = {}) {
  const form = new FormData();
  if (file) form.append('files', file);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

vi.mock('@/lib/server/asis/ai', () => ({ analyseIntake: vi.fn(), analyseUpdate: vi.fn() }));

const INTAKE_RESULT = {
  summary: 'Tickets are triaged within 4 hours and escalated by severity.',
  currentState: ['Support desk logs the ticket', 'Severity is classified'],
  stakeholders: [{ role: 'Duty Manager', involvement: 'Receives Severity 1 escalations' }],
  businessRules: ['Severity 1 is escalated immediately'],
  findings: [
    { status: 'CONFIRMED', text: 'Tickets are triaged within 4 hours.', source: 'support-procedure.md' },
    { status: 'PENDING', text: 'Severity 2 review may move to the same day.', source: 'Intake' },
  ],
  painPoints: [{ point: 'Manual data entry', impact: 'Delays triage' }],
  gaps: [{ priority: 'HIGH', gap: 'No SLA for Severity 3', why: 'Not documented' }],
  complianceFlags: [],
  decisions: [{ title: 'Severity 2 review timing', description: '', position: 'Next morning', status: 'PENDING', owner: 'Support lead' }],
  questions: ['Who approves Severity 3 timings?'],
};

describe('AS-IS Navigator projects', () => {
  let admin, analyst, other;
  beforeEach(() => {
    useTempDataDir();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.mocked(analyseIntake).mockReset().mockResolvedValue({ result: INTAKE_RESULT, notice: null });
    vi.mocked(analyseUpdate).mockReset();
    admin = createUser(ROLES.ADMIN);
    analyst = createUser(ROLES.EMPLOYEE, 'Ana Lyst');
    other = createUser(ROLES.EMPLOYEE, 'Otto Other');
  });

  const create = async (body = { name: 'Ticket triage', module: 'Support' }) =>
    (await call(createProject, req('/x', { method: 'POST', user: analyst, body }))).data.project;

  const runIntake = (p, extra = {}) => {
    const form = uploadForm(textFile(SUPPORT_TEXT), { problem: 'Slow triage', pains: JSON.stringify(['Manual data entry']), ...extra });
    return call(analyse, req('/x', { method: 'POST', user: analyst, form }), { id: p.id });
  };

  it('requires sign-in and a project name', async () => {
    expect((await call(listProjects, req('/x'))).status).toBe(401);
    expect((await call(createProject, req('/x', { method: 'POST', user: analyst, body: { name: ' ' } }))).status).toBe(400);
  });

  it('runs the initial analysis from intake and extracted documents', async () => {
    const p = await create();
    expect(p).toMatchObject({ version: '1.0', analysis: null });
    const res = await runIntake(p);
    expect(res.status).toBe(200);
    const done = res.data.project;
    expect(done.version).toBe('1.0');
    expect(done.findings).toHaveLength(2);
    expect(done.findings.every(f => f.id && f.origin === 'ai')).toBe(true);
    expect(done.decisions[0]).toMatchObject({ title: 'Severity 2 review timing', status: 'PENDING' });
    expect(done.sources[0]).toMatchObject({ kind: 'document', name: 'support-procedure.md' });
    expect(done.intake).toMatchObject({ problem: 'Slow triage', pains: ['Manual data entry'] });
    expect(done.analysis.gaps[0].priority).toBe('HIGH');

    // The analyser received the extracted text, with section references.
    const { material } = vi.mocked(analyseIntake).mock.calls[0][0];
    expect(material.documents[0].text).toContain('Escalation Rules');
    expect(projectStats(done)).toMatchObject({ findings: 2, gaps: 1, questions: 1, sources: 1 });
  });

  it('explains when AI is not configured and rejects unreadable files', async () => {
    const p = await create();
    delete process.env.ANTHROPIC_API_KEY;
    expect((await runIntake(p)).data.error.code).toBe('AI_NOT_CONFIGURED');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const bad = uploadForm(new File(['x'], 'image.png'), {});
    const res = await call(analyse, req('/x', { method: 'POST', user: analyst, form: bad }), { id: p.id });
    expect(res.status).toBe(415);
    expect(res.data.error.message).toContain('image.png');
  });

  it('needs an initial analysis before knowledge can be added', async () => {
    const p = await create();
    const form = uploadForm(null, { context: 'Workshop notes' });
    expect((await call(addKnowledge, req('/x', { method: 'POST', user: analyst, form }), { id: p.id })).status).toBe(409);
  });

  it('never lets unconfirmed knowledge confirm or retire findings', async () => {
    const p = (await runIntake(await create())).data.project;
    const [confirmedF, pendingF] = p.findings;
    vi.mocked(analyseUpdate).mockResolvedValue({
      notice: null,
      result: {
        changes: { new: ['Severity 3 SLA is 2 days'], changed: [], conflicts: [], resolved: ['Severity 2 timing'], superseded: [], pending: [] },
        newFindings: [{ status: 'CONFIRMED', text: 'Severity 3 tickets are answered within 2 days.', source: 'Workshop' }],
        resolvedFindingIds: [pendingF.id],
        supersededFindingIds: [confirmedF.id],
        conflictingFindingIds: [],
        newDecisions: [],
        versionNote: 'Workshop notes added',
      },
    });
    const form = uploadForm(null, { context: 'Workshop notes from 20 Aug', classification: 'PENDING' });
    const res = await call(addKnowledge, req('/x', { method: 'POST', user: analyst, form }), { id: p.id });
    expect(res.status).toBe(200);
    const u = res.data.project;
    expect(u.version).toBe('1.1');
    expect(u.findings.find(f => f.id === pendingF.id).status).toBe('PENDING');
    expect(u.findings.find(f => f.id === confirmedF.id).status).toBe('CONFLICTING');
    expect(u.findings.at(-1)).toMatchObject({ status: 'PENDING', text: 'Severity 3 tickets are answered within 2 days.' });
    expect(u.changes).toMatchObject({ version: '1.1', classification: 'PENDING', new: ['Severity 3 SLA is 2 days'] });
    expect(u.versionHistory.at(-1)).toMatchObject({ version: '1.1', note: 'Workshop notes added' });
    expect(u.sources.at(-1)).toMatchObject({ kind: 'note' });
  });

  it('lets CONFIRMED knowledge resolve and supersede findings, ignoring unknown ids', async () => {
    const p = (await runIntake(await create())).data.project;
    const [confirmedF, pendingF] = p.findings;
    vi.mocked(analyseUpdate).mockResolvedValue({
      notice: null,
      result: {
        changes: { new: [], changed: [], conflicts: [], resolved: [], superseded: [], pending: [] },
        newFindings: [], resolvedFindingIds: [pendingF.id, 'made-up'], supersededFindingIds: [confirmedF.id], conflictingFindingIds: [],
        newDecisions: [{ title: 'Adopt same-day review', description: '', position: '', status: 'CONFIRMED', owner: '' }], versionNote: '',
      },
    });
    const refs = JSON.stringify([{ source: 'confluence', title: 'Support SLA v3', ref: 'SUP', url: 'https://wiki.example.com/x', text: 'Severity 2 is reviewed the same day.' }]);
    const form = uploadForm(null, { classification: 'CONFIRMED', references: refs });
    const u = (await call(addKnowledge, req('/x', { method: 'POST', user: analyst, form }), { id: p.id })).data.project;
    expect(u.findings.find(f => f.id === pendingF.id)).toMatchObject({ status: 'CONFIRMED' });
    expect(u.findings.find(f => f.id === confirmedF.id)).toMatchObject({ status: 'SUPERSEDED' });
    expect(u.sources.at(-1)).toMatchObject({ kind: 'confluence', name: 'Support SLA v3', url: 'https://wiki.example.com/x' });
    expect(u.decisions.at(-1).title).toBe('Adopt same-day review');
  });

  it('keeps hand-written findings when the initial analysis is re-run', async () => {
    const p = (await runIntake(await create())).data.project;
    await call(addFinding, req('/x', { method: 'POST', user: other, body: { text: 'Night shift uses a paper log.', status: 'ASSUMPTION' } }), { id: p.id });
    const rerun = (await runIntake(p)).data.project;
    expect(rerun.version).toBe('1.1');
    expect(rerun.findings.filter(f => f.origin === 'manual')).toHaveLength(1);
    expect(rerun.findings.filter(f => f.origin === 'ai')).toHaveLength(2);
  });

  it('edits findings and decisions with validation', async () => {
    const p = (await runIntake(await create())).data.project;
    const f = p.findings[1];
    const ok = await call(updateFinding, req('/x', { method: 'PATCH', user: other, body: { status: 'CONFIRMED', note: 'Confirmed in workshop' } }), { id: p.id, findingId: f.id });
    expect(ok.data.project.findings[1]).toMatchObject({ status: 'CONFIRMED', note: 'Confirmed in workshop', updatedByName: 'Otto Other' });
    expect(ok.data.project.findings[1].resolvedAt).toBeTruthy();
    expect((await call(updateFinding, req('/x', { method: 'PATCH', user: other, body: { status: 'MAYBE' } }), { id: p.id, findingId: f.id })).status).toBe(400);

    const added = await call(addDecision, req('/x', { method: 'POST', user: other, body: {} }), { id: p.id });
    const d = added.data.project.decisions.at(-1);
    expect(d).toMatchObject({ title: 'New open item', status: 'OPEN' });
    const upd = await call(updateDecision, req('/x', { method: 'PATCH', user: other, body: { status: 'CONFIRMED', owner: 'Rae' } }), { id: p.id, decisionId: d.id });
    expect(upd.data.project.decisions.at(-1)).toMatchObject({ status: 'CONFIRMED', owner: 'Rae' });
  });

  it('only lets the creator or an admin delete a project', async () => {
    const p = await create();
    expect((await call(deleteProject, req('/x', { method: 'DELETE', user: other }), { id: p.id })).status).toBe(403);
    expect((await call(deleteProject, req('/x', { method: 'DELETE', user: admin }), { id: p.id })).status).toBe(200);
    expect((await call(getProject, req('/x', { user: analyst }), { id: p.id })).status).toBe(404);
  });

  it('builds the discovery summary and versions', () => {
    expect(nextVersion('1.9')).toBe('1.10');
    const text = discoverySummary({ name: 'P', version: '1.2', findings: [{ status: 'PENDING', text: 'X' }], decisions: [], analysis: { summary: 'S' } });
    expect(text).toContain('DISCOVERY SUMMARY — P');
    expect(text).toContain('[PENDING] X');
  });
});
