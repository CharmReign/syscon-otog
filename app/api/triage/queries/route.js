import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, route } from '@/lib/server/http';
import { createQuery, listQueries, readQueryForm } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  requireUser(request);
  return json({ queries: listQueries(), ai: aiConfigured() });
});

// Multipart: channel, from, subject, body, meta (JSON list), files (JPEG, repeatable).
export const POST = route(async (request) => {
  const user = requireUser(request);
  return json({ query: await createQuery(user, await readQueryForm(request)) }, 201);
});
