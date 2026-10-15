import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { removeDecision, updateDecision } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const PATCH = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, decisionId } = await params(ctx);
  return json({ project: updateDecision(user, id, decisionId, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, decisionId } = await params(ctx);
  return json({ project: removeDecision(user, id, decisionId) });
});
