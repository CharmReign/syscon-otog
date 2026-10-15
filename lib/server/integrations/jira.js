// Jira REST client (Cloud and Data Center). Read-only by design: it never creates,
// edits, transitions or deletes issues.
//   Cloud:       REST v3, POST /rest/api/3/search/jql (token pagination), ADF descriptions
//   Data Center: REST v2, POST /rest/api/2/search (startAt pagination), wiki-text descriptions
import { jiraConfig } from '@/lib/server/integrations/config';
import { IntegrationError, fetchJson } from '@/lib/server/integrations/http';

const MAX_LIMIT = 50;
export const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

export const jqlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const stripOrder = (jql) => String(jql).replace(/\s+order\s+by\s+[\s\S]*$/i, '').trim();
const bad = (msg) => new IntegrationError('jira', 'BAD_QUERY', msg, 400);

/**
 * Builds JQL from user filters. Every user value is validated or quoted, so filters can't
 * inject JQL. baseJql comes from server configuration, never from the request.
 */
export function buildJql({ query, project, status, baseJql, projectKeys = [] } = {}) {
  const clauses = [];
  if (baseJql) clauses.push(`(${stripOrder(baseJql)})`);
  if (projectKeys.length) clauses.push(`project in (${projectKeys.map(jqlString).join(', ')})`);
  if (project) {
    const p = String(project).toUpperCase();
    if (!PROJECT_KEY.test(p)) throw bad('Invalid project key.');
    if (projectKeys.length && !projectKeys.includes(p)) throw new IntegrationError('jira', 'FORBIDDEN', 'That project is not available through this integration.', 403);
    clauses.push(`project = ${jqlString(p)}`);
  }
  if (status) {
    const s = String(status).trim().slice(0, 60);
    if (s) clauses.push(`status = ${jqlString(s)}`);
  }
  const q = String(query || '').trim().slice(0, 200);
  if (q) {
    const upper = q.toUpperCase();
    clauses.push(ISSUE_KEY.test(upper) ? `key = ${jqlString(upper)}` : `text ~ ${jqlString(q)}`);
  }
  if (!clauses.length) throw bad('Enter a keyword, issue key or filter to search.');
  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

// Atlassian Document Format -> plain text.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '';
  const inner = (node.content || []).map(adfToText).join('');
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow'].includes(node.type) ? `${inner}\n` : inner;
}

const fieldText = (v) => {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(', ') || null;
  return v.value || v.name || v.displayName || v.key || null;
};

export function createJiraClient(cfg = jiraConfig()) {
  const cloud = cfg.deployment === 'cloud';
  const v = cloud ? '3' : '2';
  const call = (path, opts) => fetchJson('jira', cfg, path, opts);
  const browse = (key) => `${cfg.baseUrl}/browse/${encodeURIComponent(key)}`;
  const extraFields = [cfg.clientField, cfg.severityField].filter(Boolean);
  const FIELDS = ['summary', 'status', 'priority', 'issuetype', 'assignee', 'reporter', 'project', 'components', 'labels', 'created', 'updated', ...extraFields];

  const mapIssue = (i, { withDescription = false } = {}) => {
    const f = i.fields || {};
    return {
      id: i.id, key: i.key, url: browse(i.key),
      summary: f.summary || '',
      status: f.status?.name || null, statusCategory: f.status?.statusCategory?.key || null,
      priority: f.priority?.name || null, issueType: f.issuetype?.name || null,
      project: f.project ? { key: f.project.key, name: f.project.name } : null,
      assignee: f.assignee?.displayName || null, reporter: f.reporter?.displayName || null,
      components: (f.components || []).map(c => c.name), labels: f.labels || [],
      client: cfg.clientField ? fieldText(f[cfg.clientField]) : null,
      severity: cfg.severityField ? fieldText(f[cfg.severityField]) : null,
      created: f.created || null, updated: f.updated || null,
      ...(withDescription ? { description: (cloud ? adfToText(f.description) : String(f.description || '')).trim().slice(0, 20_000) } : {}),
    };
  };

  return {
    config: cfg,

    async testConnection() {
      const me = await call(`/rest/api/${v}/myself`);
      return { account: me?.displayName || me?.name || 'integration account' };
    },

    // Returns { issues, total, nextPageToken, startAt, hasMore }.
    async search({ query, project, status, defectsOnly = false, limit = 20, startAt = 0, nextPageToken } = {}) {
      const jql = buildJql({ query, project, status, baseJql: defectsOnly ? cfg.defectJql : null, projectKeys: cfg.projectKeys });
      const maxResults = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIMIT);
      if (cloud) {
        const data = await call('/rest/api/3/search/jql', { method: 'POST', body: { jql, maxResults, fields: FIELDS, ...(nextPageToken ? { nextPageToken } : {}) } });
        return { issues: (data.issues || []).map(i => mapIssue(i)), total: null, nextPageToken: data.nextPageToken || null, hasMore: !data.isLast && Boolean(data.nextPageToken) };
      }
      const start = Math.max(Number(startAt) || 0, 0);
      const data = await call('/rest/api/2/search', { method: 'POST', body: { jql, startAt: start, maxResults, fields: FIELDS } });
      const issues = (data.issues || []).map(i => mapIssue(i));
      return { issues, total: data.total ?? null, startAt: start, hasMore: data.total != null && start + issues.length < data.total };
    },

    async getIssue(key) {
      const k = String(key || '').toUpperCase();
      if (!ISSUE_KEY.test(k)) throw bad('Invalid issue key.');
      if (cfg.projectKeys.length && !cfg.projectKeys.includes(k.split('-')[0])) {
        throw new IntegrationError('jira', 'NOT_FOUND', 'Not found in Jira, or the integration account can\'t see it.', 404);
      }
      const i = await call(`/rest/api/${v}/issue/${encodeURIComponent(k)}`, { query: { fields: [...FIELDS, 'description'].join(',') } });
      return mapIssue(i, { withDescription: true });
    },

    browseUrl: (key) => (cfg.baseUrl ? browse(key) : null),
  };
}
