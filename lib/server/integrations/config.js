// Integration settings, read from the environment on each call so tests and restarts
// pick up changes. Nothing here is ever sent to the browser except via publicConfig().
//
// Cloud:       site *_BASE_URL + *_EMAIL + *_API_TOKEN; scoped tokens also need *_CLOUD_ID
// Data Center: *_BASE_URL + *_PAT (Bearer personal access token)

const list = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const flag = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true');

function deployment(explicit, baseUrl) {
  if (explicit === 'cloud' || explicit === 'datacenter') return explicit;
  return /\.atlassian\.net/i.test(baseUrl || '') ? 'cloud' : 'datacenter';
}

function base(prefix) {
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.trim().replace(/\/+$/, '') || '';
  const cloudId = process.env[`${prefix}_CLOUD_ID`]?.trim() || '';
  const tokenType = process.env[`${prefix}_TOKEN_TYPE`]?.trim().toLowerCase() || (cloudId ? 'scoped' : 'classic');
  const cfg = {
    baseUrl,
    cloudId,
    tokenType,
    deployment: deployment(process.env[`${prefix}_DEPLOYMENT`]?.trim().toLowerCase(), baseUrl),
    email: process.env[`${prefix}_EMAIL`]?.trim() || '',
    apiToken: process.env[`${prefix}_API_TOKEN`]?.trim() || '',
    pat: process.env[`${prefix}_PAT`]?.trim() || '',
    timeoutMs: Number(process.env.INTEGRATION_TIMEOUT_MS) || 10000,
  };
  cfg.missing = [
    !baseUrl && 'site base URL',
    !['classic', 'scoped'].includes(tokenType) && 'valid token type (classic or scoped)',
    tokenType === 'scoped' && cfg.deployment !== 'cloud' && 'Cloud deployment for scoped tokens',
    tokenType === 'scoped' && !/^[a-zA-Z0-9-]+$/.test(cloudId) && 'valid Cloud ID',
    tokenType === 'scoped' && cfg.pat && 'remove PAT when using a scoped API token',
  ].filter(Boolean);
  if (baseUrl) {
    try {
      const site = new URL(baseUrl);
      if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password || site.search || site.hash || site.hostname === 'api.atlassian.com') {
        cfg.missing.push('site URL (not an API gateway URL, with no credentials or query)');
      }
    } catch { cfg.missing.push('valid site URL'); }
  }
  const service = prefix.toLowerCase();
  cfg.apiBaseUrl = tokenType === 'scoped'
    ? `https://api.atlassian.com/ex/${service}/${encodeURIComponent(cloudId)}${service === 'confluence' ? '/wiki' : ''}`
    : baseUrl;
  cfg.hasCredentials = Boolean(cfg.pat || (cfg.email && cfg.apiToken));
  if (!cfg.hasCredentials) cfg.missing.push('credentials');
  cfg.enabled = flag(process.env[`${prefix}_ENABLED`], Boolean(baseUrl));
  cfg.configured = cfg.enabled && cfg.missing.length === 0;
  return cfg;
}

export function confluenceConfig() {
  return { ...base('CONFLUENCE'), spaceKeys: list(process.env.CONFLUENCE_SPACE_KEYS) };
}

export function jiraConfig() {
  return {
    ...base('JIRA'),
    projectKeys: list(process.env.JIRA_PROJECT_KEYS).map(k => k.toUpperCase()),
    defectJql: process.env.JIRA_DEFECT_JQL?.trim() || 'issuetype = Bug',
    clientField: process.env.JIRA_CLIENT_FIELD?.trim() || '',
    severityField: process.env.JIRA_SEVERITY_FIELD?.trim() || '',
  };
}

// Safe to show any signed-in user: no credentials, just what's set up.
export function publicConfig(cfg) {
  return {
    enabled: cfg.enabled,
    configured: cfg.configured,
    deployment: cfg.deployment,
    baseUrl: cfg.baseUrl || null,
    apiBaseUrl: cfg.apiBaseUrl || null,
    authMethod: cfg.pat ? 'Personal access token' : cfg.email && cfg.apiToken ? `${cfg.tokenType === 'scoped' ? 'Scoped' : 'Classic'} API token (Basic)` : null,
    missing: cfg.missing,
  };
}
