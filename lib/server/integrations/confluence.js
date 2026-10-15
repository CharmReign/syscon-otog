// Confluence REST client (Cloud and Data Center). Read-only: search pages and read a page.
// Uses /rest/api/search and /rest/api/content, which both deployment types support.
import { confluenceConfig } from '@/lib/server/integrations/config';
import { IntegrationError, fetchJson, htmlToText } from '@/lib/server/integrations/http';

const MAX_LIMIT = 50;

// CQL string literal: backslashes and quotes escaped, wrapped in quotes.
export const cqlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function buildCql(query, { spaceKey, spaceKeys = [] } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) throw new IntegrationError('confluence', 'BAD_QUERY', 'Enter something to search for.', 400);
  const parts = ['type in (page, blogpost)', `(title ~ ${cqlString(q)} OR text ~ ${cqlString(q)})`];
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
  if (/^https?:\/\//.test(rel)) return rel;
  return `${(links?.base || cfg.baseUrl).replace(/\/+$/, '')}${rel}`;
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
    async search({ query, spaceKey, start = 0, limit = 20, cursor } = {}) {
      const cql = buildCql(query, { spaceKey, spaceKeys: cfg.spaceKeys });
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
      const p = await call(`/rest/api/content/${id}`, { query: { expand: 'body.storage,space,version' } });
      const text = htmlToText(p.body?.storage?.value || '');
      return {
        id: String(p.id), title: p.title, type: p.type,
        space: p.space ? { key: p.space.key, name: p.space.name } : null,
        version: p.version?.number || null, updatedAt: p.version?.when || null, updatedBy: p.version?.by?.displayName || null,
        url: absolute(cfg, p._links, p._links?.webui),
        text: text.slice(0, 50_000), truncated: text.length > 50_000,
      };
    },
  };
}
