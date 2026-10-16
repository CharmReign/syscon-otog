import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, params, readJson, route } from '@/lib/server/http';
import { deleteQuery, getQuery, reviewQuery } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  await requireUser(request);
  const { id } = await params(ctx);
  return json({ query: await getQuery(id), ai: aiConfigured() });
});

// Body: { reply?, status? } — the agent's edits and approval of the drafted reply.
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ query: await reviewQuery(user, id, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json(await deleteQuery(user, id));
});
