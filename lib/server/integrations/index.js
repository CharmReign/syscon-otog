// Entry point for routes: configured clients, status, and connection tests.
// A connection is only reported as working after a real test call succeeded.
import { audit } from '@/lib/server/audit';
import { createHash } from 'node:crypto';
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

// Keep only a digest server-side so changing credentials or the gateway invalidates
// an earlier connection check. Never expose this digest in public status responses.
const configFingerprint = (cfg) => createHash('sha256').update(JSON.stringify(cfg)).digest('hex');

export function getClient(name) {
  const svc = SERVICES[name];
  const cfg = svc.config();
  if (!cfg.configured) {
    throw new IntegrationError(name, 'NOT_CONFIGURED', `${svc.label} isn't set up yet. Check the server configuration: ${cfg.missing.join(', ') || 'integration disabled'}.`, 503);
  }
  return svc.client(cfg);
}

export async function integrationStatus() {
  return Object.fromEntries(await Promise.all(Object.entries(SERVICES).map(async ([name, svc]) => {
    const cfg = svc.config();
    const last = await findOne('integrationChecks', name);
    return [name, {
      name, label: svc.label, ...publicConfig(cfg),
      // Only meaningful while the configuration hasn't changed since the check.
      lastCheck: last && last.configFingerprint === configFingerprint(cfg) ? { ok: last.ok, message: last.message, account: last.account, checkedAt: last.checkedAt, checkedByName: last.checkedByName } : null,
    }];
  })));
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
  const record = { ...result, baseUrl: cfg.baseUrl, configFingerprint: configFingerprint(cfg), checkedAt: new Date().toISOString(), checkedByName: user.name };
  if (await findOne('integrationChecks', name)) await updateOne('integrationChecks', name, record);
  else await insertOne('integrationChecks', { id: name, ...record });
  await audit(user, 'integration.tested', 'integration', name, result.ok ? 'ok' : result.message);
  return (await integrationStatus())[name];
}
