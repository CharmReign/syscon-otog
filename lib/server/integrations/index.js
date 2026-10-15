// Entry point for routes: configured clients, status, and connection tests.
// A connection is only reported as working after a real test call succeeded.
import { audit } from '@/lib/server/audit';
import { confluenceConfig, jiraConfig, publicConfig } from '@/lib/server/integrations/config';
import { createConfluenceClient } from '@/lib/server/integrations/confluence';
import { createJiraClient } from '@/lib/server/integrations/jira';
import { IntegrationError } from '@/lib/server/integrations/http';
import { findOne, insertOne, updateOne } from '@/lib/server/store';

const SERVICES = {
  confluence: { label: 'Confluence', config: confluenceConfig, client: createConfluenceClient },
  jira: { label: 'Jira', config: jiraConfig, client: createJiraClient },
};

export const isIntegration = (name) => Object.hasOwn(SERVICES, name);

export function getClient(name) {
  const svc = SERVICES[name];
  const cfg = svc.config();
  if (!cfg.configured) {
    throw new IntegrationError(name, 'NOT_CONFIGURED', `${svc.label} isn't set up yet. An administrator needs to add its URL and credentials to the server configuration.`, 503);
  }
  return svc.client(cfg);
}

export function integrationStatus() {
  return Object.fromEntries(Object.entries(SERVICES).map(([name, svc]) => {
    const cfg = svc.config();
    const last = findOne('integrationChecks', name);
    return [name, {
      name, label: svc.label, ...publicConfig(cfg),
      // Only meaningful while the configuration hasn't changed since the check.
      lastCheck: last && last.baseUrl === cfg.baseUrl ? { ok: last.ok, message: last.message, account: last.account, checkedAt: last.checkedAt, checkedByName: last.checkedByName } : null,
    }];
  }));
}

export async function testIntegration(user, name) {
  const cfg = SERVICES[name].config();
  let result;
  try {
    const { account } = await getClient(name).testConnection();
    result = { ok: true, account, message: `Connected as ${account}.` };
  } catch (e) {
    result = { ok: false, account: null, message: e instanceof IntegrationError ? e.message : 'The connection test failed unexpectedly.' };
  }
  const record = { ...result, baseUrl: cfg.baseUrl, checkedAt: new Date().toISOString(), checkedByName: user.name };
  if (findOne('integrationChecks', name)) updateOne('integrationChecks', name, record);
  else insertOne('integrationChecks', { id: name, ...record });
  audit(user, 'integration.tested', 'integration', name, result.ok ? 'ok' : result.message);
  return integrationStatus()[name];
}
