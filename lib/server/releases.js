// Release Sanity Health Check: configurable checklist templates (admins) and releases
// whose checks anyone on the team records. Nothing about the release process is
// hardcoded; templates define the checks.
import { v4 as uuidv4 } from 'uuid';

import { isAdmin } from '@/lib/access';
import { CHECK_STATUS, RELEASE_STATUS, releaseSummary } from '@/lib/releases';
import { audit } from '@/lib/server/audit';
import { HttpError, badRequest, notFound, str } from '@/lib/server/http';
import { ISSUE_KEY } from '@/lib/server/integrations/jira';
import { jiraConfig } from '@/lib/server/integrations/config';
import { deleteOne, findAll, findOne, insertOne, updateOne } from '@/lib/server/store';

const now = () => new Date().toISOString();

function jiraKeys(value) {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
  const keys = [...new Set(raw.map(k => String(k).trim().toUpperCase()).filter(Boolean))];
  const bad = keys.find(k => !ISSUE_KEY.test(k));
  if (bad) throw badRequest(`"${bad}" isn't a Jira issue key (like ABC-123).`);
  if (keys.length > 20) throw badRequest('Link at most 20 Jira issues per check.');
  return keys;
}

function links(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10) throw badRequest('links must be a list of up to 10 links.');
  return value.map(l => {
    const url = str(l?.url, { field: 'Link URL', required: true, max: 500 });
    let parsed;
    try { parsed = new URL(url); } catch { throw badRequest(`"${url}" isn't a valid URL.`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw badRequest('Links must start with http:// or https://.');
    return { title: str(l?.title, { field: 'Link title', max: 150 }) || parsed.hostname, url: parsed.toString() };
  });
}

function templateItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw badRequest('A template needs 1 to 100 checks.');
  return items.map(i => ({
    id: typeof i.id === 'string' && i.id ? i.id : uuidv4(),
    title: str(i.title, { field: 'Check title', required: true, max: 200 }),
    description: str(i.description, { field: 'Check description', max: 1000 }),
    critical: i.critical === true,
  }));
}

// ---- templates (admin) ----

export const listTemplates = async () => (await findAll('checklistTemplates')).sort((a, b) => a.name.localeCompare(b.name));

export async function saveTemplate(user, id, body) {
  const doc = {
    name: str(body.name, { field: 'Template name', required: true, max: 120 }),
    description: str(body.description, { field: 'Description', max: 500 }),
    items: templateItems(body.items),
    updatedAt: now(), updatedByName: user.name,
  };
  if (id) {
    if (!(await findOne('checklistTemplates', id))) throw notFound('Template not found.');
    await audit(user, 'template.updated', 'checklistTemplate', id, doc.name);
    return updateOne('checklistTemplates', id, doc);
  }
  const created = await insertOne('checklistTemplates', { id: uuidv4(), ...doc, createdAt: now() });
  await audit(user, 'template.created', 'checklistTemplate', created.id, doc.name);
  return created;
}

export async function deleteTemplate(user, id) {
  if (!(await deleteOne('checklistTemplates', id))) throw notFound('Template not found.');
  await audit(user, 'template.deleted', 'checklistTemplate', id);
  return { ok: true };
}

// ---- releases ----

const withSummary = (r) => {
  const jira = jiraConfig();
  return {
    ...r,
    summary: releaseSummary(r.checks),
    checks: r.checks.map(c => ({ ...c, jiraLinks: c.jiraKeys.map(k => ({ key: k, url: jira.baseUrl ? `${jira.baseUrl}/browse/${k}` : null })) })),
  };
};

export const listReleases = async () => (await findAll('releases'))
  .sort((a, b) => (a.status === b.status ? (b.targetDate || '').localeCompare(a.targetDate || '') : a.status === 'OPEN' ? -1 : 1))
  .map(r => { const { checks, ...rest } = withSummary(r); return rest; });

export async function getRelease(id) {
  const r = await findOne('releases', id);
  if (!r) throw notFound('Release not found.');
  return withSummary(r);
}

function dateOrEmpty(v) {
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw badRequest('Target date must be YYYY-MM-DD.');
  return String(v);
}

export async function createRelease(user, body) {
  let checks = [];
  if (body.templateId) {
    const t = await findOne('checklistTemplates', body.templateId);
    if (!t) throw notFound('Template not found.');
    checks = t.items.map(i => ({ id: uuidv4(), title: i.title, description: i.description, critical: i.critical, status: 'PENDING', comment: '', jiraKeys: [], links: [], updatedAt: null, updatedByName: null }));
  }
  const r = await insertOne('releases', {
    id: uuidv4(),
    name: str(body.name, { field: 'Release name', required: true, max: 120 }),
    version: str(body.version, { field: 'Version', max: 50 }),
    targetDate: dateOrEmpty(body.targetDate),
    notes: str(body.notes, { field: 'Notes', max: 2000 }),
    jiraKeys: jiraKeys(body.jiraKeys),
    status: 'OPEN', templateId: body.templateId || null, checks,
    createdById: user.id, createdByName: user.name, createdAt: now(), updatedAt: now(),
  });
  await audit(user, 'release.created', 'release', r.id, `${r.name} (${checks.length} checks)`);
  return withSummary(r);
}

export async function updateRelease(user, id, body) {
  const r = await findOne('releases', id);
  if (!r) throw notFound('Release not found.');
  const patch = { updatedAt: now() };
  if (body.name !== undefined) patch.name = str(body.name, { field: 'Release name', required: true, max: 120 });
  if (body.version !== undefined) patch.version = str(body.version, { field: 'Version', max: 50 });
  if (body.targetDate !== undefined) patch.targetDate = dateOrEmpty(body.targetDate);
  if (body.notes !== undefined) patch.notes = str(body.notes, { field: 'Notes', max: 2000 });
  if (body.jiraKeys !== undefined) patch.jiraKeys = jiraKeys(body.jiraKeys);
  if (body.status !== undefined) {
    if (!RELEASE_STATUS.includes(body.status)) throw badRequest('status must be OPEN or CLOSED.');
    patch.status = body.status;
  }
  await audit(user, 'release.updated', 'release', id, Object.keys(patch).filter(k => k !== 'updatedAt').join(', '));
  return withSummary(await updateOne('releases', id, patch));
}

export async function deleteRelease(user, id) {
  const r = await findOne('releases', id);
  if (!r) throw notFound('Release not found.');
  if (!isAdmin(user) && r.createdById !== user.id) throw new HttpError(403, 'Only the release creator or an administrator can delete it.', 'FORBIDDEN');
  await deleteOne('releases', id);
  await audit(user, 'release.deleted', 'release', id, r.name);
  return { ok: true };
}

export async function addCheck(user, releaseId, body) {
  const r = await findOne('releases', releaseId);
  if (!r) throw notFound('Release not found.');
  if (r.checks.length >= 200) throw badRequest('A release can have at most 200 checks.');
  const check = {
    id: uuidv4(),
    title: str(body.title, { field: 'Check title', required: true, max: 200 }),
    description: str(body.description, { field: 'Description', max: 1000 }),
    critical: body.critical === true, status: 'PENDING', comment: '', jiraKeys: [], links: [],
    updatedAt: null, updatedByName: null,
  };
  await audit(user, 'release.check_added', 'release', releaseId, check.title);
  return withSummary(await updateOne('releases', releaseId, { checks: [...r.checks, check], updatedAt: now() }));
}

export async function updateCheck(user, releaseId, checkId, body) {
  const r = await findOne('releases', releaseId);
  if (!r) throw notFound('Release not found.');
  if (r.status === 'CLOSED') throw new HttpError(409, 'This release is closed. Reopen it to record checks.', 'CLOSED');
  const i = r.checks.findIndex(c => c.id === checkId);
  if (i === -1) throw notFound('Check not found.');
  const c = { ...r.checks[i] };
  if (body.status !== undefined) {
    if (!CHECK_STATUS.includes(body.status)) throw badRequest(`status must be one of ${CHECK_STATUS.join(', ')}.`);
    c.status = body.status;
  }
  if (body.comment !== undefined) c.comment = str(body.comment, { field: 'Finding / comment', max: 2000 });
  if (body.jiraKeys !== undefined) c.jiraKeys = jiraKeys(body.jiraKeys);
  if (body.links !== undefined) c.links = links(body.links);
  if (body.title !== undefined) c.title = str(body.title, { field: 'Check title', required: true, max: 200 });
  if (body.critical !== undefined) c.critical = body.critical === true;
  c.updatedAt = now();
  c.updatedByName = user.name;
  const checks = [...r.checks];
  checks[i] = c;
  await audit(user, 'release.check_updated', 'release', releaseId, `${c.title}: ${c.status}`);
  return withSummary(await updateOne('releases', releaseId, { checks, updatedAt: now() }));
}

export async function removeCheck(user, releaseId, checkId) {
  const r = await findOne('releases', releaseId);
  if (!r) throw notFound('Release not found.');
  if (!r.checks.some(c => c.id === checkId)) throw notFound('Check not found.');
  await audit(user, 'release.check_removed', 'release', releaseId, checkId);
  return withSummary(await updateOne('releases', releaseId, { checks: r.checks.filter(c => c.id !== checkId), updatedAt: now() }));
}
