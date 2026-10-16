import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { removeSource } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json(removeSource(user, decodeURIComponent(id)));
});
