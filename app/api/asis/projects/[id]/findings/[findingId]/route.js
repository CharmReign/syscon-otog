import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { removeFinding, updateFinding } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const PATCH = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, findingId } = await params(ctx);
  return json({ project: updateFinding(user, id, findingId, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, findingId } = await params(ctx);
  return json({ project: removeFinding(user, id, findingId) });
});
