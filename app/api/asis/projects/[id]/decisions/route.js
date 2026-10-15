import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { addDecision } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const POST = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json({ project: addDecision(user, id, await readJson(request)) }, 201);
});
