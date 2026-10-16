// Shared HTTP layer for Atlassian integrations: timeouts, one polite retry on 429/503,
// and errors mapped to stable codes. Credentials are only ever placed in the
// Authorization header and never logged or echoed back in error messages.

export class IntegrationError extends Error {
  constructor(service, code, message, status) {
    super(message);
    this.name = 'IntegrationError';
    this.service = service;
    this.code = code;
    this.status = status;
  }
}

const LABELS = { confluence: 'Confluence', jira: 'Jira' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Words for an "any of these words" search clause: lowercase letters and digits only,
// so they are safe to quote into JQL or CQL.
export const cleanTerms = (terms) => (Array.isArray(terms) ? terms : [])
  .map(t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(t => t.length > 2).slice(0, 8);

export function authHeader(cfg) {
  if (cfg.pat) return `Bearer ${cfg.pat}`;
  if (cfg.email && cfg.apiToken) return `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`;
  return null;
}

// Short, safe detail from an Atlassian error body (Jira's JQL errors are useful to show).
async function errorDetail(res) {
  try {
    const body = await res.json();
    const msgs = [...(body.errorMessages || []), ...Object.values(body.errors || {}), body.message].filter(m => typeof m === 'string');
    return msgs.join(' ').slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * fetchJson('jira', cfg, '/rest/api/2/myself', { method, body, query })
 * cfg: { baseUrl, timeoutMs, pat | email+apiToken }
 */
export async function fetchJson(service, cfg, path, { method = 'GET', body, query } = {}) {
  const name = LABELS[service] || service;
  const auth = authHeader(cfg);
  if (!cfg.baseUrl || !auth) throw new IntegrationError(service, 'NOT_CONFIGURED', `${name} is not configured.`, 503);

  const url = new URL(cfg.baseUrl.replace(/\/+$/, '') + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          'X-Atlassian-Token': 'no-check',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(cfg.timeoutMs || 10000),
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        throw new IntegrationError(service, 'TIMEOUT', `${name} did not respond in time. Try again shortly.`, 504);
      }
      console.warn(`[${service}] network error: ${e?.cause?.code || e?.message}`);
      throw new IntegrationError(service, 'NETWORK', `Couldn't reach ${name}. Check the base URL and network access.`, 502);
    }

    if (res.ok) return res.status === 204 ? null : res.json();

    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 1, 5) * 1000;
      await sleep(wait);
      continue;
    }
    const detail = await errorDetail(res);
    console.warn(`[${service}] ${method} ${url.pathname} -> ${res.status}`);
    switch (res.status) {
      case 400: throw new IntegrationError(service, 'BAD_QUERY', detail || `${name} rejected the search.`, 400);
      case 401: throw new IntegrationError(service, 'AUTH_FAILED', `${name} rejected the configured credentials. They may have expired or been revoked.`, 502);
      case 403: throw new IntegrationError(service, 'FORBIDDEN', `The ${name} integration account doesn't have permission for this.`, 403);
      case 404: throw new IntegrationError(service, 'NOT_FOUND', `Not found in ${name}, or the integration account can't see it.`, 404);
      case 429: throw new IntegrationError(service, 'RATE_LIMITED', `${name} is rate-limiting requests. Wait a minute and try again.`, 429);
      default: throw new IntegrationError(service, 'UPSTREAM', `${name} returned an error (${res.status}).`, 502);
    }
  }
}

// Storage-format / view HTML -> readable text.
export function htmlToText(html = '') {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
