import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { removeCheck, updateCheck } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

// Body: any of { status, comment, jiraKeys, links, title, critical }
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, checkId } = await params(ctx);
  return json({ release: await updateCheck(user, id, checkId, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, checkId } = await params(ctx);
  return json({ release: await removeCheck(user, id, checkId) });
});
