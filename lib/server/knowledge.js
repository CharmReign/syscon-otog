// Unified knowledge lookup across internal documents, Confluence and Jira. Each source
// reports its own results or error, so one unavailable integration never hides the rest.
// Used by the AS-IS Navigator and by Client Defect Triage's related-knowledge panel.
import { searchDocuments, terms } from '@/lib/server/documents/search';
import { getClient } from '@/lib/server/integrations';
import { confluenceConfig, jiraConfig } from '@/lib/server/integrations/config';
import { IntegrationError } from '@/lib/server/integrations/http';

const SOURCES = ['internal', 'confluence', 'jira'];

async function settle(name, configured, fn) {
  if (!configured) return { status: 'not_configured', results: [] };
  try {
    return { status: 'ok', results: await fn() };
  } catch (e) {
    return { status: 'error', results: [], error: e instanceof IntegrationError ? e.message : `Couldn't search ${name}.` };
  }
}

export async function searchKnowledge(query, { sources = SOURCES, categories, limit = 10 } = {}) {
  const want = new Set(sources.filter(s => SOURCES.includes(s)));
  const out = {};
  const tasks = [];
  if (want.has('internal')) out.internal = { status: 'ok', results: searchDocuments(query, { categories, limit }) };
  if (want.has('confluence')) {
    tasks.push(settle('Confluence', confluenceConfig().configured, async () => (await getClient('confluence').search({ query, limit })).results)
      .then(r => { out.confluence = r; }));
  }
  if (want.has('jira')) {
    tasks.push(settle('Jira', jiraConfig().configured, async () => (await getClient('jira').search({ query, limit })).issues)
      .then(r => { out.jira = r; }));
  }
  await Promise.all(tasks);
  return out;
}

// Turns a defect summary into a focused query: the longest distinctive words first.
export function queryFromText(text, max = 6) {
  return terms(text).sort((a, b) => b.length - a.length).slice(0, max).join(' ');
}
