import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES } from '@/lib/access';
import { composeReply, emailFromText, jiraFromCSV, rankRefs, searchTerms, triageStats } from '@/lib/triage';
import { buildJql } from '@/lib/server/integrations/jira';
import { buildCql } from '@/lib/server/integrations/confluence';
import { draftReply } from '@/lib/server/triage/ai';
import { GET as listQueries, POST as createQuery } from '@/app/api/triage/queries/route';
import { DELETE as deleteQuery, GET as getQuery, PATCH as reviewQuery } from '@/app/api/triage/queries/[id]/route';
import { POST as draft } from '@/app/api/triage/queries/[id]/draft/route';
import { GET as references } from '@/app/api/triage/queries/[id]/references/route';
import { POST as addAttachments } from '@/app/api/triage/queries/[id]/attachments/route';
import { DELETE as removeAttachment, GET as getAttachment } from '@/app/api/triage/queries/[id]/attachments/[attachmentId]/route';
import { GET as listSources, POST as addSources } from '@/app/api/triage/sources/route';
import { DELETE as removeSource } from '@/app/api/triage/sources/[id]/route';
import { GET as getSettings, PUT as putSettings } from '@/app/api/triage/settings/route';
import { call, createUser, ctx, req, useTempDataDir } from './helpers';

vi.mock('@/lib/server/triage/ai', () => ({ draftReply: vi.fn() }));

const jpeg = (name = 'error.jpg') => new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], name, { type: 'image/jpeg' });

function queryForm(fields, files = [], meta = []) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  files.forEach(f => form.append('files', f));
  form.set('meta', JSON.stringify(meta));
  return form;
}

const RELEASE_Q = { channel: 'Email', from: 'Records supervisor (sample)', subject: 'Release dates changed overnight without my approval', body: 'Two release dates moved by 4 days overnight and I never approved the sentence recalculation changes. What do I do?' };
const KNOWN_ISSUE = { id: 'DR-123', type: 'Jira', title: 'Nightly sentence recalculation applies release date changes without sign-off', text: 'Status: Fixed in 24.3.2. Workaround: run Recalculate with Approval for each person; the release date change goes to Pending Approvals.' };

const AI_DRAFT = {
  category: 'Known issue with workaround', confidence: 'High', module: 'Sentence Management',
  answer: 'You have hit a known issue (DR-123).', steps: ['Run Recalculate with Approval.'], resolution: 'Fixed in 24.3.2.',
  refs: ['DR-123', 'MADE-UP-1'], note: 'Known bug.', escalate: '', raiseJira: false,
  jira: { summary: '', severity: 'Low', environment: '', steps: [], expected: '', actual: '', impact: '', workaround: '', missingInfo: [] },
};

describe('Client Defect Triage', () => {
  let admin, agent, other;
  beforeEach(async () => {
    useTempDataDir();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.mocked(draftReply).mockReset().mockResolvedValue(AI_DRAFT);
    admin = await createUser(ROLES.ADMIN);
    agent = await createUser(ROLES.EMPLOYEE, 'Ann Agent');
    other = await createUser(ROLES.EMPLOYEE, 'Otto Other');
  });

  const create = async (fields = RELEASE_Q, files, meta) =>
    (await call(createQuery, req('/x', { method: 'POST', user: agent, form: queryForm(fields, files, meta) }))).data.query;
  const addLibrary = (items, user = agent) => call(addSources, req('/x', { method: 'POST', user, body: { items } }));

  it('requires sign-in and a message or attachment', async () => {
    expect((await call(listQueries, req('/x'))).status).toBe(401);
    const res = await call(createQuery, req('/x', { method: 'POST', user: agent, form: queryForm({ body: 'hi' }) }));
    expect(res.status).toBe(400);
  });

  it('stores queries with JPEG attachments and rejects other files', async () => {
    const q = await create(RELEASE_Q, [jpeg()], [{ kind: 'image', name: 'attendance-error.png' }]);
    expect(q).toMatchObject({ number: 1, channel: 'Email', subject: RELEASE_Q.subject, draft: null });
    expect(q.attachments[0]).toMatchObject({ kind: 'image', name: 'attendance-error.png' });

    const img = await getAttachment(req('/x', { user: other }), ctx({ id: q.id, attachmentId: q.attachments[0].id }));
    expect(img.headers.get('content-type')).toBe('image/jpeg');

    const bad = await call(createQuery, req('/x', { method: 'POST', user: agent, form: queryForm(RELEASE_Q, [new File(['<svg/>'], 'x.svg')]) }));
    expect(bad.status).toBe(415);

    // A video's stills are removed together.
    const frames = [{ kind: 'frame', name: 'clip.mp4', label: 'still 1' }, { kind: 'frame', name: 'clip.mp4', label: 'still 2' }];
    const withVideo = (await call(addAttachments, req('/x', { method: 'POST', user: agent, form: queryForm({}, [jpeg(), jpeg()], frames) }), { id: q.id })).data.query;
    expect(withVideo.attachments).toHaveLength(3);
    const after = (await call(removeAttachment, req('/x', { method: 'DELETE', user: agent }), { id: q.id, attachmentId: withVideo.attachments[1].id })).data.query;
    expect(after.attachments.map(a => a.kind)).toEqual(['image']);
    expect((await call(listQueries, req('/x', { user: other }))).data.queries[0].attachments).toHaveLength(1);
  });

  it('drafts a holding reply without calling the AI when nothing matches', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const q = await create({ ...RELEASE_Q, subject: 'Export classification history', body: 'Can we export the full classification history to Excel for a review board?' });
    const res = await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id });
    expect(res.status).toBe(200);
    expect(res.data.query.draft).toMatchObject({ category: 'No approved reference', source: 'No match', status: 'Draft', refs: [] });
    expect(res.data.query.draft.reply).toContain('Export classification history');
    expect(draftReply).not.toHaveBeenCalled();
  });

  it('sends only matching references and attachments to Claude and drops ids it was not given', async () => {
    await addLibrary([KNOWN_ISSUE, { id: 'CF-9', type: 'Confluence', title: 'Recording program attendance', text: 'Open the session, tick attendees and Save.' }]);
    const q = await create(RELEASE_Q, [jpeg()], [{ kind: 'image', name: 'screen.png' }]);

    const preview = await call(references, req('/x', { user: agent }), { id: q.id });
    expect(preview.data.matches.map(m => m.id)).toEqual(['DR-123']);
    expect(preview.data.notes.join(' ')).toContain('Jira isn\'t connected');

    const res = await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id });
    expect(res.status).toBe(200);
    const { refs, images } = vi.mocked(draftReply).mock.calls[0][0];
    expect(refs.map(r => r.id)).toEqual(['DR-123']);
    expect(images).toHaveLength(1);
    expect(images[0].label).toContain('screen.png');

    const d = res.data.query.draft;
    expect(d).toMatchObject({ category: 'Known issue with workaround', refs: ['DR-123'], jira: null, source: 'Claude', imagesSent: 1 });
    expect(d.citedRefs[0]).toMatchObject({ id: 'DR-123', type: 'Jira' });
    expect(d.reply).toContain('1. Run Recalculate with Approval.');
  });

  it('replaces an uncited definite answer with a holding reply, and needs a key when references match', async () => {
    await addLibrary([KNOWN_ISSUE]);
    const q = await create();
    vi.mocked(draftReply).mockResolvedValue({ ...AI_DRAFT, refs: ['NOT-GIVEN'] });
    const d = (await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id })).data.query.draft;
    expect(d).toMatchObject({ category: 'No approved reference', refs: [] });

    delete process.env.ANTHROPIC_API_KEY;
    const res = await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id });
    expect(res.status).toBe(503);
    expect(res.data.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('keeps a Jira ticket draft for new defects', async () => {
    await addLibrary([KNOWN_ISSUE]);
    const q = await create();
    vi.mocked(draftReply).mockResolvedValue({
      ...AI_DRAFT, category: 'New defect', refs: [], raiseJira: true,
      jira: { summary: 'Release dates change without approval', severity: 'Severe', environment: 'Production', steps: ['Run job'], expected: 'Sign-off', actual: 'No sign-off', impact: 'Wrong releases', workaround: '', missingInfo: ['Person IDs'] },
    });
    const d = (await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id })).data.query.draft;
    expect(d.category).toBe('New defect');
    expect(d.jira).toMatchObject({ summary: 'Release dates change without approval', severity: 'Medium', missingInfo: ['Person IDs'] });
    expect(d.reply).toContain('- Person IDs');
  });

  it('records review: edits, approval and sending', async () => {
    const q = await create({ ...RELEASE_Q, body: 'Something nobody has documented anywhere at all.' });
    expect((await call(reviewQuery, req('/x', { method: 'PATCH', user: agent, body: { status: 'Approved' } }), { id: q.id })).status).toBe(409);
    await call(draft, req('/x', { method: 'POST', user: agent }), { id: q.id });

    const approved = (await call(reviewQuery, req('/x', { method: 'PATCH', user: other, body: { status: 'Approved' } }), { id: q.id })).data.query.draft;
    expect(approved).toMatchObject({ status: 'Approved', approvedByName: 'Otto Other' });
    const edited = (await call(reviewQuery, req('/x', { method: 'PATCH', user: other, body: { reply: 'Hi, new text.' } }), { id: q.id })).data.query.draft;
    expect(edited).toMatchObject({ status: 'Draft', reply: 'Hi, new text.' });
    const sent = (await call(reviewQuery, req('/x', { method: 'PATCH', user: agent, body: { status: 'Sent' } }), { id: q.id })).data.query.draft;
    expect(sent).toMatchObject({ status: 'Sent', sentByName: 'Ann Agent' });
    expect((await call(reviewQuery, req('/x', { method: 'PATCH', user: agent, body: { status: 'Gone' } }), { id: q.id })).status).toBe(400);
  });

  it('only lets the agent who added a query or an admin delete it', async () => {
    const q = await create(RELEASE_Q, [jpeg()], [{ kind: 'image', name: 'a.png' }]);
    expect((await call(deleteQuery, req('/x', { method: 'DELETE', user: other }), { id: q.id })).status).toBe(403);
    expect((await call(deleteQuery, req('/x', { method: 'DELETE', user: admin }), { id: q.id })).status).toBe(200);
    expect((await call(getQuery, req('/x', { user: agent }), { id: q.id })).status).toBe(404);
  });

  it('manages the shared knowledge library', async () => {
    const res = await addLibrary([{ type: 'Email', title: 'Re: Admission won\'t close', text: 'Resolved by returning the open property item.' }, KNOWN_ISSUE]);
    expect(res.data).toMatchObject({ added: 2, updated: 0 });
    expect(res.data.sources.map(s => s.id)).toEqual(['DR-123', 'EM-1']);
    const again = await addLibrary([{ ...KNOWN_ISSUE, text: 'Status: Fixed and released.' }], other);
    expect(again.data).toMatchObject({ added: 0, updated: 1 });
    expect((await addLibrary([{ type: 'Wiki', title: 't', text: 'x' }])).status).toBe(400);
    expect((await addLibrary([{ id: 'bad id!', type: 'Jira', title: 't', text: 'x' }])).status).toBe(400);

    expect((await call(removeSource, req('/x', { method: 'DELETE', user: agent }), { id: 'DR-123' })).status).toBe(403);
    expect((await call(removeSource, req('/x', { method: 'DELETE', user: agent }), { id: 'EM-1' })).status).toBe(200);
    expect((await call(listSources, req('/x', { user: agent }))).data.sources.map(s => s.id)).toEqual(['DR-123']);
  });

  it('stores the baseline numbers', async () => {
    expect((await call(getSettings, req('/x', { user: agent }))).data.baseline).toMatchObject({ hours: 26, devShare: 60 });
    expect((await call(putSettings, req('/x', { method: 'PUT', user: agent, body: { hours: 12, devShare: 140 } }))).status).toBe(400);
    const ok = await call(putSettings, req('/x', { method: 'PUT', user: agent, body: { hours: 12, devShare: 45 } }));
    expect(ok.data.baseline).toMatchObject({ hours: 12, devShare: 45, updatedByName: 'Ann Agent' });
  });

  it('searches Jira and Confluence for any of the words, safely quoted', () => {
    expect(buildJql({ anyTerms: ['release', 'appr"oval', 'x'] })).toBe('(text ~ "release" OR text ~ "approval") ORDER BY updated DESC');
    expect(buildCql('', { anyTerms: ['release', 'dates'] })).toBe('type in (page, blogpost) AND (text ~ "release" OR text ~ "dates")');
    expect(() => buildCql('', { anyTerms: ['a'] })).toThrow();
  });

  it('ranks references, picks search words, parses exports and counts results', () => {
    const refs = [KNOWN_ISSUE, { id: 'CF-1', type: 'Confluence', title: 'Parole hearings', text: 'Reschedule a hearing.' }];
    expect(rankRefs(RELEASE_Q, refs).map(m => m.ref.id)).toEqual(['DR-123']);
    expect(searchTerms(RELEASE_Q)).toEqual(['release', 'date', 'changed', 'overnight', 'without', 'approval']);

    const csv = 'Issue key,Summary,Status,Description\nDR-1,"Save fails, error 7F3A",Open,"Steps: ""Save"""\n';
    expect(jiraFromCSV(csv)).toEqual([{ id: 'DR-1', type: 'Jira', title: 'Save fails, error 7F3A', text: 'Status: Open. Steps: "Save"' }]);
    expect(() => jiraFromCSV('Name\nx')).toThrow();
    expect(emailFromText('Subject: Re: Count\nFrom: a@b\n\nExplained the  snapshot.', 'f')).toEqual({ title: 'Re: Count', text: 'Explained the snapshot.' });

    expect(composeReply({ subject: 'S' }, { category: 'No approved reference', escalate: 'BA team' })).toContain('our BA team');
    const s = triageStats([
      { draft: { category: 'How-to', status: 'Sent', draftSeconds: 4, refs: ['A'] } },
      { draft: { category: 'New defect', status: 'Approved', draftSeconds: 6, refs: [] } },
      { draft: { category: 'How-to', status: 'Draft', draftSeconds: 2, refs: ['B'] } },
      { draft: null },
    ]);
    expect(s).toMatchObject({ drafted: 3, reviewed: 2, deflected: 1, toDev: 1, rate: 50, avgSeconds: 4, citations: 2 });
  });
});
