// Integration settings, read from the environment on each call so tests and restarts
// pick up changes. Nothing here is ever sent to the browser except via publicConfig().
//
// Cloud:       *_BASE_URL + *_EMAIL + *_API_TOKEN (Basic auth with an Atlassian API token)
// Data Center: *_BASE_URL + *_PAT (Bearer personal access token)

const list = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const flag = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true');

function deployment(explicit, baseUrl) {
  if (explicit === 'cloud' || explicit === 'datacenter') return explicit;
  return /\.atlassian\.net/i.test(baseUrl || '') ? 'cloud' : 'datacenter';
}

function base(prefix) {
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.trim().replace(/\/+$/, '') || '';
  const cfg = {
    baseUrl,
    deployment: deployment(process.env[`${prefix}_DEPLOYMENT`]?.trim().toLowerCase(), baseUrl),
    email: process.env[`${prefix}_EMAIL`]?.trim() || '',
    apiToken: process.env[`${prefix}_API_TOKEN`]?.trim() || '',
    pat: process.env[`${prefix}_PAT`]?.trim() || '',
    timeoutMs: Number(process.env.INTEGRATION_TIMEOUT_MS) || 10000,
  };
  cfg.hasCredentials = Boolean(cfg.pat || (cfg.email && cfg.apiToken));
  cfg.enabled = flag(process.env[`${prefix}_ENABLED`], Boolean(baseUrl));
  cfg.configured = cfg.enabled && Boolean(baseUrl) && cfg.hasCredentials;
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
    authMethod: cfg.pat ? 'Personal access token' : cfg.email && cfg.apiToken ? 'API token (Basic)' : null,
    missing: [
      !cfg.baseUrl && 'base URL',
      !cfg.hasCredentials && 'credentials',
    ].filter(Boolean),
  };
}
