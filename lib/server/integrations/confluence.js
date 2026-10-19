// Confluence REST client (Cloud and Data Center). Read-only: search pages and read a page.
// Cloud reads use v2 pages/blogposts; Data Center keeps the v1 content API.
import { confluenceConfig } from '@/lib/server/integrations/config';
import { IntegrationError, cleanTerms, fetchJson, htmlToText } from '@/lib/server/integrations/http';

const MAX_LIMIT = 50;

// CQL string literal: backslashes and quotes escaped, wrapped in quotes.
export const cqlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// anyTerms: plain words, any of which may match (used by Client Defect Triage).
export function buildCql(query, { spaceKey, spaceKeys = [], anyTerms } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  const words = cleanTerms(anyTerms);
  if (!q && !words.length) throw new IntegrationError('confluence', 'BAD_QUERY', 'Enter something to search for.', 400);
  const parts = ['type in (page, blogpost)'];
  if (q) parts.push(`(title ~ ${cqlString(q)} OR text ~ ${cqlString(q)})`);
  if (words.length) parts.push(`(${words.map(w => `text ~ ${cqlString(w)}`).join(' OR ')})`);
  const allowed = spaceKeys.map(k => k.toUpperCase());
  if (spaceKey) {
    const key = String(spaceKey).toUpperCase();
    if (!/^[A-Z0-9~_]{1,255}$/.test(key)) throw new IntegrationError('confluence', 'BAD_QUERY', 'Invalid space key.', 400);
    if (allowed.length && !allowed.includes(key)) throw new IntegrationError('confluence', 'FORBIDDEN', 'That space is not available through this integration.', 403);
    parts.push(`space = ${cqlString(key)}`);
  } else if (allowed.length) {
    parts.push(`space in (${allowed.map(cqlString).join(', ')})`);
  }
  return parts.join(' AND ');
}

const cleanExcerpt = (s) => htmlToText(String(s || '').replace(/@@@(end)?hl@@@/g, '')).slice(0, 400);

function absolute(cfg, links, rel) {
  if (!rel) return null;
  if (/^https?:\/\//.test(rel)) {
    const url = new URL(rel);
    if (url.hostname !== 'api.atlassian.com') return rel;
    rel = url.pathname.replace(/^\/ex\/confluence\/[^/]+/, '') + url.search + url.hash;
  }
  const base = (cfg.baseUrl || links?.base).replace(/\/+$/, '');
  // Gateway responses may have an API-domain base. Browser links must use the site.
  if (base.endsWith('/wiki') && rel.startsWith('/wiki/')) return `${base.slice(0, -5)}${rel}`;
  return `${base}/${rel.replace(/^\/+/, '')}`;
}

export function createConfluenceClient(cfg = confluenceConfig()) {
  const call = (path, opts) => fetchJson('confluence', cfg, path, opts);
  return {
    config: cfg,

    async testConnection() {
      const me = await call('/rest/api/user/current');
      if (me?.type === 'anonymous') throw new IntegrationError('confluence', 'AUTH_FAILED', 'Confluence treated the request as anonymous. Check the credentials.', 502);
      return { account: me?.displayName || me?.publicName || me?.username || 'integration account' };
    },

    // Returns { results, start, limit, total, nextCursor, hasMore }.
    async search({ query, spaceKey, anyTerms, start = 0, limit = 20, cursor } = {}) {
      const cql = buildCql(query, { spaceKey, spaceKeys: cfg.spaceKeys, anyTerms });
      const lim = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIMIT);
      const data = await call('/rest/api/search', {
        query: { cql, limit: lim, ...(cursor ? { cursor } : { start: Math.max(Number(start) || 0, 0) }), excerpt: 'highlight' },
      });
      const results = (data.results || []).filter(r => r.content?.id).map(r => ({
        id: String(r.content.id),
        type: r.content.type,
        title: htmlToText(r.title || r.content.title || '').replace(/@@@(end)?hl@@@/g, ''),
        excerpt: cleanExcerpt(r.excerpt),
        space: r.resultGlobalContainer?.title || r.content.space?.name || null,
        lastModified: r.lastModified || null,
        url: absolute(cfg, data._links, r.url || r.content._links?.webui),
      }));
      const next = data._links?.next;
      let nextCursor = null;
      if (next) {
        try { nextCursor = new URL(next, 'http://x').searchParams.get('cursor'); } catch { /* ignore */ }
      }
      const begin = data.start ?? Number(start) ?? 0;
      return {
        results, start: begin, limit: lim, total: data.totalSize ?? null, nextCursor,
        hasMore: Boolean(next) || (data.totalSize != null && begin + results.length < data.totalSize),
      };
    },

    async getPage(id) {
      if (!/^\d{1,20}$/.test(String(id))) throw new IntegrationError('confluence', 'BAD_QUERY', 'Invalid page id.', 400);
      let p;
      if (cfg.deployment === 'cloud') {
        // Search includes both pages and blog posts. Their v2 read endpoints differ.
        try {
          p = { ...await call(`/api/v2/pages/${id}`, { query: { 'body-format': 'storage' } }), type: 'page' };
        } catch (e) {
          if (!(e instanceof IntegrationError) || e.code !== 'NOT_FOUND') throw e;
          p = { ...await call(`/api/v2/blogposts/${id}`, { query: { 'body-format': 'storage' } }), type: 'blogpost' };
        }
        if (p.spaceId) {
          const space = await call(`/api/v2/spaces/${encodeURIComponent(p.spaceId)}`);
          p.space = { key: space.key, name: space.name };
        }
      } else {
        p = await call(`/rest/api/content/${id}`, { query: { expand: 'body.storage,space,version' } });
      }
      const text = htmlToText(p.body?.storage?.value || '');
      return {
        id: String(p.id), title: p.title, type: p.type,
        space: p.space ? { key: p.space.key, name: p.space.name } : null,
        version: p.version?.number || null, updatedAt: p.version?.createdAt || p.version?.when || null, updatedBy: p.version?.by?.displayName || null,
        url: absolute(cfg, p._links, p._links?.webui),
        text: text.slice(0, 50_000), truncated: text.length > 50_000,
      };
    },
  };
}
