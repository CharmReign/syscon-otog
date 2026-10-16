import { beforeEach, describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/access';
import { releaseSummary } from '@/lib/releases';
import { POST as createTemplate } from '@/app/api/releases/templates/route';
import { GET as listReleases, POST as createRelease } from '@/app/api/releases/route';
import { DELETE as deleteRelease } from '@/app/api/releases/[id]/route';
import { PATCH as updateCheck } from '@/app/api/releases/[id]/checks/[checkId]/route';
import { call, createUser, req, useTempDataDir } from './helpers';

describe('release sanity checks', () => {
  let admin, lead, other;
  beforeEach(async () => {
    useTempDataDir();
    admin = await createUser(ROLES.ADMIN);
    lead = await createUser(ROLES.EMPLOYEE, 'Rae Release');
    other = await createUser(ROLES.EMPLOYEE, 'Otto Other');
  });

  const template = { name: 'Web release', items: [{ title: 'Login works', critical: true }, { title: 'Reports render' }] };

  it('lets only admins define checklist templates', async () => {
    expect((await call(createTemplate, req('/x', { method: 'POST', user: lead, body: template }))).status).toBe(403);
    expect((await call(createTemplate, req('/x', { method: 'POST', user: admin, body: template }))).status).toBe(201);
  });

  it('creates releases from a template, records results and summarises risk', async () => {
    const t = (await call(createTemplate, req('/x', { method: 'POST', user: admin, body: template }))).data.template;
    const created = await call(createRelease, req('/x', { method: 'POST', user: lead, body: { name: 'R 26.10', templateId: t.id, targetDate: '2026-10-20' } }));
    expect(created.status).toBe(201);
    const r = created.data.release;
    expect(r.summary).toMatchObject({ total: 2, outstanding: 2, readiness: 'IN_PROGRESS' });

    const critical = r.checks.find(c => c.critical);
    const failed = await call(updateCheck, req('/x', { method: 'PATCH', user: other, body: { status: 'FAIL', comment: 'SSO loop', jiraKeys: 'sup-12, SUP-13' } }), { id: r.id, checkId: critical.id });
    expect(failed.data.release.summary).toMatchObject({ readiness: 'AT_RISK', criticalOpen: 1 });
    expect(failed.data.release.checks.find(c => c.id === critical.id)).toMatchObject({ jiraKeys: ['SUP-12', 'SUP-13'], updatedByName: 'Otto Other' });

    const bad = await call(updateCheck, req('/x', { method: 'PATCH', user: other, body: { jiraKeys: 'not-a-key!' } }), { id: r.id, checkId: critical.id });
    expect(bad.status).toBe(400);
    const badLink = await call(updateCheck, req('/x', { method: 'PATCH', user: other, body: { links: [{ url: 'javascript:alert(1)' }] } }), { id: r.id, checkId: critical.id });
    expect(badLink.status).toBe(400);

    expect((await call(listReleases, req('/x', { user: other }))).data.releases[0].summary.readiness).toBe('AT_RISK');
  });

  it('only lets the creator or an admin delete a release', async () => {
    const r = (await call(createRelease, req('/x', { method: 'POST', user: lead, body: { name: 'R1' } }))).data.release;
    expect((await call(deleteRelease, req('/x', { method: 'DELETE', user: other }), { id: r.id })).status).toBe(403);
    expect((await call(deleteRelease, req('/x', { method: 'DELETE', user: lead }), { id: r.id })).status).toBe(200);
  });

  it('computes readiness', () => {
    expect(releaseSummary([]).readiness).toBe('NO_CHECKS');
    expect(releaseSummary([{ status: 'PASS' }, { status: 'PASS' }]).readiness).toBe('READY');
    expect(releaseSummary([{ status: 'BLOCKED', critical: false }, { status: 'PASS' }]).readiness).toBe('IN_PROGRESS');
  });
});
