import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES } from '@/lib/access';
import { buildCql, createConfluenceClient } from '@/lib/server/integrations/confluence';
import { adfToText, buildJql, createJiraClient } from '@/lib/server/integrations/jira';
import { confluenceConfig, jiraConfig, publicConfig } from '@/lib/server/integrations/config';
import { getClient } from '@/lib/server/integrations';
import { GET as status } from '@/app/api/integrations/status/route';
import { POST as testConn } from '@/app/api/integrations/[name]/test/route';
import { GET as jiraSearch } from '@/app/api/jira/search/route';
import { GET as confluenceSearch } from '@/app/api/confluence/search/route';
import { GET as knowledge } from '@/app/api/knowledge/search/route';
import { call, createUser, req, useTempDataDir } from './helpers';

const ENV_KEYS = ['CONFLUENCE_TOKEN_TYPE', 'CONFLUENCE_CLOUD_ID', 'CONFLUENCE_DEPLOYMENT', 'JIRA_TOKEN_TYPE', 'JIRA_CLOUD_ID', 'CONFLUENCE_BASE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN', 'CONFLUENCE_PAT', 'CONFLUENCE_ENABLED', 'CONFLUENCE_SPACE_KEYS',
  'JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PAT', 'JIRA_ENABLED', 'JIRA_PROJECT_KEYS', 'JIRA_DEFECT_JQL', 'JIRA_DEPLOYMENT', 'INTEGRATION_TIMEOUT_MS'];

const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function mockFetch(handler) {
  const fn = vi.fn(async (url, init) => handler(new URL(url), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const cloudConfluence = { baseUrl: 'https://acme.atlassian.net/wiki', deployment: 'cloud', email: 'bot@acme.test', apiToken: 'secret-token', pat: '', timeoutMs: 500, spaceKeys: [], configured: true };
const dcJira = { baseUrl: 'https://jira.acme.test', deployment: 'datacenter', pat: 'dc-pat', email: '', apiToken: '', timeoutMs: 500, projectKeys: [], defectJql: 'issuetype = Bug', clientField: 'customfield_100', severityField: '', configured: true };
const cloudJira = { ...dcJira, baseUrl: 'https://acme.atlassian.net', deployment: 'cloud', pat: '', email: 'bot@acme.test', apiToken: 't' };

beforeEach(async () => { ENV_KEYS.forEach(k => delete process.env[k]); });
afterEach(() => { vi.unstubAllGlobals(); });

function scopedEnv(prefix) {
  process.env[`${prefix}_BASE_URL`] = `https://acme.atlassian.net${prefix === 'CONFLUENCE' ? '/wiki' : ''}`;
  process.env[`${prefix}_TOKEN_TYPE`] = 'scoped';
  process.env[`${prefix}_CLOUD_ID`] = 'cloud-123';
  process.env[`${prefix}_EMAIL`] = 'bot@acme.test';
  process.env[`${prefix}_API_TOKEN`] = 'scoped-secret';
}

describe('scoped token configuration and requests', () => {
  it('routes Jira search, identity and issue reads through the gateway but keeps site links', async () => {
    scopedEnv('JIRA');
    const fetchFn = mockFetch((url) => {
      if (url.pathname.endsWith('/myself')) return jsonResponse({ displayName: 'Bot' });
      if (url.pathname.endsWith('/search/jql')) return jsonResponse({ issues: [], isLast: true });
      return jsonResponse({ id: '1', key: 'SUP-1', fields: { summary: 'Movement', description: { type: 'doc', content: [{ type: 'text', text: 'Details' }] } } });
    });
    const cfg = jiraConfig();
    expect(cfg).toMatchObject({ configured: true, deployment: 'cloud', apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-123' });
    const client = getClient('jira');
    await client.testConnection();
    await client.search({ query: 'movement' });
    const issue = await client.getIssue('SUP-1');
    expect(fetchFn.mock.calls.map(([url]) => String(url).split('?')[0])).toEqual([
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/myself',
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/search/jql',
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/SUP-1',
    ]);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('bot@acme.test:scoped-secret').toString('base64')}`);
    expect(issue).toMatchObject({ url: 'https://acme.atlassian.net/browse/SUP-1', description: 'Details' });
    expect(JSON.stringify(publicConfig(cfg))).not.toContain('scoped-secret');
  });

  it('routes Confluence identity, search, v2 body and space reads, without gateway browser links', async () => {
    scopedEnv('CONFLUENCE');
    const fetchFn = mockFetch((url) => {
      if (url.pathname.endsWith('/user/current')) return jsonResponse({ displayName: 'Bot' });
      if (url.pathname.endsWith('/search')) return jsonResponse({ results: [{ content: { id: '42', type: 'page' }, title: 'Guide', url: '/wiki/spaces/SUP/pages/42' }], _links: { base: 'https://api.atlassian.com/ex/confluence/cloud-123/wiki' } });
      if (url.pathname.endsWith('/spaces/9')) return jsonResponse({ id: '9', key: 'SUP', name: 'Support' });
      expect(url.searchParams.get('body-format')).toBe('storage');
      return jsonResponse({ id: '42', title: 'Guide', spaceId: '9', version: { number: 3, createdAt: '2026-10-19' }, body: { storage: { value: '<p>Instructions</p>' } }, _links: { webui: 'https://api.atlassian.com/ex/confluence/cloud-123/wiki/spaces/SUP/pages/42' } });
    });
    const client = getClient('confluence');
    await client.testConnection();
    const search = await client.search({ query: 'guide' });
    const page = await client.getPage('42');
    expect(search.results[0].url).toBe('https://acme.atlassian.net/wiki/spaces/SUP/pages/42');
    expect(page).toMatchObject({ type: 'page', text: 'Instructions', version: 3, updatedAt: '2026-10-19', space: { key: 'SUP', name: 'Support' }, url: search.results[0].url });
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/ex/confluence/cloud-123/wiki/rest/api/user/current', '/ex/confluence/cloud-123/wiki/rest/api/search',
      '/ex/confluence/cloud-123/wiki/api/v2/pages/42', '/ex/confluence/cloud-123/wiki/api/v2/spaces/9',
    ]);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('bot@acme.test:scoped-secret').toString('base64')}`);
  });

  it('requires a Cloud ID and valid scoped configuration before making any request', () => {
    scopedEnv('JIRA');
    delete process.env.JIRA_CLOUD_ID;
    const fetchFn = mockFetch(() => jsonResponse({}));
    expect(jiraConfig().configured).toBe(false);
    expect(() => getClient('jira')).toThrow(/Cloud ID/);
    process.env.JIRA_CLOUD_ID = 'cloud-123';
    process.env.JIRA_DEPLOYMENT = 'datacenter';
    expect(jiraConfig().configured).toBe(false);
    process.env.JIRA_DEPLOYMENT = 'cloud';
    process.env.JIRA_PAT = 'old-pat';
    expect(jiraConfig().configured).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('infers scoped from Cloud ID and rejects gateway site URLs or invalid token types', () => {
    scopedEnv('CONFLUENCE');
    delete process.env.CONFLUENCE_TOKEN_TYPE;
    expect(confluenceConfig()).toMatchObject({ configured: true, tokenType: 'scoped' });
    process.env.CONFLUENCE_BASE_URL = 'https://api.atlassian.com/ex/confluence/cloud-123/wiki';
    expect(confluenceConfig().configured).toBe(false);
    process.env.CONFLUENCE_BASE_URL = 'https://acme.atlassian.net/wiki';
    process.env.CONFLUENCE_TOKEN_TYPE = 'typo';
    expect(confluenceConfig().configured).toBe(false);
  });

  it('keeps existing classic configuration on the site API', () => {
    process.env.JIRA_BASE_URL = 'https://acme.atlassian.net/';
    process.env.JIRA_EMAIL = 'bot@acme.test';
    process.env.JIRA_API_TOKEN = 'classic-secret';
    expect(jiraConfig()).toMatchObject({ configured: true, tokenType: 'classic', apiBaseUrl: 'https://acme.atlassian.net' });
  });
});

describe('query building', () => {
  it('quotes user input in CQL and JQL so it cannot change the query', () => {
    expect(buildCql('release "notes" \\ OR space = X')).toContain('text ~ "release \\"notes\\" \\\\ OR space = X"');
    expect(buildJql({ query: 'login fails" OR project = SECRET' })).toBe('text ~ "login fails\\" OR project = SECRET" ORDER BY updated DESC');
    expect(buildJql({ query: 'abc-123' })).toBe('key = "ABC-123" ORDER BY updated DESC');
    expect(() => buildJql({ project: 'x y; drop' })).toThrow(/Invalid project/);
  });

  it('combines the configured defect filter and project allow-list', () => {
    const jql = buildJql({ query: 'timeout', status: 'In Progress', baseJql: 'issuetype = Bug ORDER BY created', projectKeys: ['SUP'] });
    expect(jql).toBe('(issuetype = Bug) AND project in ("SUP") AND status = "In Progress" AND text ~ "timeout" ORDER BY updated DESC');
    expect(() => buildJql({ project: 'OTHER', projectKeys: ['SUP'] })).toThrow(/not available/);
  });

  it('converts Atlassian Document Format to text', () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Steps:' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open case' }] }] }] }] };
    expect(adfToText(adf).trim()).toBe('Steps:\nOpen case');
  });
});

describe('Confluence client', () => {
  it('reads Cloud blog posts through v2 after a page 404', async () => {
    const fetchFn = mockFetch((url) => url.pathname.includes('/pages/') ? jsonResponse({}, 404) : jsonResponse({ id: '7', title: 'News', body: { storage: { value: 'Update' } } }));
    const page = await createConfluenceClient(cloudConfluence).getPage('7');
    expect(page).toMatchObject({ type: 'blogpost', text: 'Update' });
    expect(String(fetchFn.mock.calls[1][0])).toBe('https://acme.atlassian.net/wiki/api/v2/blogposts/7?body-format=storage');
  });

  it('keeps the v1 content API on Data Center', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ id: '7', type: 'page', body: { storage: { value: '<p>DC text</p>' } }, version: { number: 2, when: '2026-01-01', by: { displayName: 'Editor' } } }));
    const page = await createConfluenceClient({ ...cloudConfluence, baseUrl: 'https://confluence.acme.test', deployment: 'datacenter', pat: 'dc-pat' }).getPage('7');
    expect(new URL(fetchFn.mock.calls[0][0]).pathname).toBe('/rest/api/content/7');
    expect(page).toMatchObject({ text: 'DC text', updatedBy: 'Editor', updatedAt: '2026-01-01' });
  });
  it('searches with Basic auth and maps results, excerpts and pagination', async () => {
    const fetchFn = mockFetch(() => jsonResponse({
      results: [{ content: { id: '42', type: 'page', _links: { webui: '/spaces/SUP/pages/42' } }, title: '@@@hl@@@Escalation@@@endhl@@@ guide', excerpt: 'Call the <b>Duty</b> Manager', resultGlobalContainer: { title: 'Support' }, lastModified: '2026-09-01T00:00:00Z', url: '/spaces/SUP/pages/42' }],
      start: 0, limit: 1, size: 1, totalSize: 3, _links: { base: 'https://acme.atlassian.net/wiki', next: '/rest/api/search?cursor=abc123&limit=1' },
    }));
    const r = await createConfluenceClient(cloudConfluence).search({ query: 'escalation', limit: 1 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/wiki/rest/api/search?cql=');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('bot@acme.test:secret-token').toString('base64')}`);
    expect(r.results[0]).toMatchObject({ id: '42', title: 'Escalation guide', excerpt: 'Call the Duty Manager', space: 'Support', url: 'https://acme.atlassian.net/wiki/spaces/SUP/pages/42' });
    expect(r).toMatchObject({ total: 3, nextCursor: 'abc123', hasMore: true });
  });

  it('maps permission, expired-credential and missing-page errors', async () => {
    const client = createConfluenceClient(cloudConfluence);
    mockFetch(() => jsonResponse({ message: 'nope' }, 401));
    await expect(client.search({ query: 'x' })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    mockFetch(() => jsonResponse({}, 403));
    await expect(client.getPage('7')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    mockFetch(() => jsonResponse({}, 404));
    await expect(client.getPage('7')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.getPage('../admin')).rejects.toMatchObject({ code: 'BAD_QUERY' });
  });

  it('never puts the token in error messages', async () => {
    mockFetch(() => jsonResponse({}, 500));
    const err = await createConfluenceClient(cloudConfluence).search({ query: 'x' }).catch(e => e);
    expect(err.code).toBe('UPSTREAM');
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain('secret-token');
  });
});

describe('Jira client', () => {
  it('uses v2 search with startAt pagination on Data Center', async () => {
    const fetchFn = mockFetch(() => jsonResponse({
      startAt: 0, maxResults: 2, total: 5,
      issues: [{ id: '1', key: 'SUP-1', fields: { summary: 'Login fails', status: { name: 'Open', statusCategory: { key: 'new' } }, priority: { name: 'High' }, issuetype: { name: 'Bug' }, project: { key: 'SUP', name: 'Support' }, components: [{ name: 'Auth' }], labels: [], customfield_100: { value: 'County A' } } }],
    }));
    const r = await createJiraClient(dcJira).search({ query: 'login', defectsOnly: true, limit: 2 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://jira.acme.test/rest/api/2/search');
    expect(init.headers.Authorization).toBe('Bearer dc-pat');
    expect(JSON.parse(init.body)).toMatchObject({ jql: '(issuetype = Bug) AND text ~ "login" ORDER BY updated DESC', startAt: 0, maxResults: 2 });
    expect(r.issues[0]).toMatchObject({ key: 'SUP-1', status: 'Open', priority: 'High', client: 'County A', components: ['Auth'], url: 'https://jira.acme.test/browse/SUP-1' });
    expect(r.hasMore).toBe(true);
  });

  it('uses the v3 /search/jql endpoint with page tokens on Cloud', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ issues: [], nextPageToken: 'tok2', isLast: false }));
    const r = await createJiraClient(cloudJira).search({ query: 'x', nextPageToken: 'tok1' });
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://acme.atlassian.net/rest/api/3/search/jql');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).nextPageToken).toBe('tok1');
    expect(r).toMatchObject({ nextPageToken: 'tok2', hasMore: true });
  });

  it('retries once on 429, honouring Retry-After, then reports rate limiting', async () => {
    let calls = 0;
    mockFetch(() => { calls++; return jsonResponse({}, 429, { 'retry-after': '0' }); });
    await expect(createJiraClient(dcJira).getIssue('SUP-1')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(calls).toBe(2);
  });

  it('reports timeouts and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; }));
    await expect(createJiraClient(dcJira).getIssue('SUP-1')).rejects.toMatchObject({ code: 'TIMEOUT', status: 504 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(createJiraClient(dcJira).getIssue('SUP-1')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('shows Jira JQL errors and validates issue keys', async () => {
    mockFetch(() => jsonResponse({ errorMessages: ["Field 'foo' does not exist"] }, 400));
    await expect(createJiraClient(dcJira).search({ query: 'x' })).rejects.toThrow(/does not exist/);
    await expect(createJiraClient(dcJira).getIssue('not a key')).rejects.toMatchObject({ code: 'BAD_QUERY' });
  });
});

describe('routes without configuration', () => {
  let admin, employee;
  beforeEach(async () => {
    useTempDataDir();
    admin = await createUser(ROLES.ADMIN);
    employee = await createUser(ROLES.EMPLOYEE);
  });

  it('reports integrations as not configured and keeps the rest working', async () => {
    const s = await call(status, req('/x', { user: employee }));
    expect(s.data.integrations.jira).toMatchObject({ configured: false, lastCheck: null });
    const j = await call(jiraSearch, req('/api/jira/search?q=x', { user: employee }));
    expect(j.status).toBe(503);
    expect(j.data.error.code).toBe('NOT_CONFIGURED');
    const c = await call(confluenceSearch, req('/api/confluence/search?q=x', { user: employee }));
    expect(c.status).toBe(503);
    const k = await call(knowledge, req('/api/knowledge/search?q=escalation', { user: employee }));
    expect(k.data.sources).toMatchObject({ internal: { status: 'ok' }, confluence: { status: 'not_configured' }, jira: { status: 'not_configured' } });
  });

  it('records a verified connection only after a successful test, and only admins can test', async () => {
    process.env.JIRA_BASE_URL = 'https://jira.acme.test';
    process.env.JIRA_PAT = 'dc-pat';
    expect((await call(testConn, req('/x', { method: 'POST', user: employee }), { name: 'jira' })).status).toBe(403);

    mockFetch(() => jsonResponse({}, 401));
    let r = await call(testConn, req('/x', { method: 'POST', user: admin }), { name: 'jira' });
    expect(r.data.integration.lastCheck).toMatchObject({ ok: false });
    expect(r.data.integration.lastCheck.message).toMatch(/credentials/);

    mockFetch(() => jsonResponse({ displayName: 'Integration Bot' }));
    r = await call(testConn, req('/x', { method: 'POST', user: admin }), { name: 'jira' });
    expect(r.data.integration).toMatchObject({ configured: true, deployment: 'datacenter', authMethod: 'Personal access token' });
    expect(r.data.integration.lastCheck).toMatchObject({ ok: true, account: 'Integration Bot' });
    expect(JSON.stringify(r.data)).not.toContain('dc-pat');
  });

  it('invalidates a successful check after token or Cloud ID changes', async () => {
    scopedEnv('JIRA');
    mockFetch(() => jsonResponse({ displayName: 'Bot' }));
    await call(testConn, req('/x', { method: 'POST', user: admin }), { name: 'jira' });
    expect((await call(status, req('/x', { user: employee }))).data.integrations.jira.lastCheck.ok).toBe(true);
    process.env.JIRA_API_TOKEN = 'replacement';
    let r = await call(status, req('/x', { user: employee }));
    expect(r.data.integrations.jira.lastCheck).toBeNull();
    expect(JSON.stringify(r.data)).not.toMatch(/replacement|configFingerprint|scoped-secret/);
    await call(testConn, req('/x', { method: 'POST', user: admin }), { name: 'jira' });
    process.env.JIRA_CLOUD_ID = 'another-cloud';
    r = await call(status, req('/x', { user: employee }));
    expect(r.data.integrations.jira.lastCheck).toBeNull();
  });
});
