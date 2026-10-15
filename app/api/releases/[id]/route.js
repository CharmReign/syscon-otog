import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { deleteRelease, getRelease, updateRelease } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  requireUser(request);
  const { id } = await params(ctx);
  return json({ release: getRelease(id) });
});

export const PATCH = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json({ release: updateRelease(user, id, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json(deleteRelease(user, id));
});
