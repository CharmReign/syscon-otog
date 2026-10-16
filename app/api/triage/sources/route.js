import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { addSources, listSources } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  requireUser(request);
  return json({ sources: listSources() });
});

// Body: { items: [{ id?, type, title, text, url? }] } — parsed in the browser from
// Jira CSV exports, saved pages, past emails or a library .json.
export const POST = route(async (request) => {
  const user = requireUser(request);
  return json(addSources(user, await readJson(request)));
});
