import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { addCheck } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ release: await addCheck(user, id, await readJson(request)) }, 201);
});
