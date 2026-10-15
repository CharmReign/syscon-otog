import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { removeCheck, updateCheck } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

// Body: any of { status, comment, jiraKeys, links, title, critical }
export const PATCH = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, checkId } = await params(ctx);
  return json({ release: updateCheck(user, id, checkId, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, checkId } = await params(ctx);
  return json({ release: removeCheck(user, id, checkId) });
});
