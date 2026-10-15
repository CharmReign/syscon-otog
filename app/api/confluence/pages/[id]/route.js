import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  requireUser(request);
  const { id } = await params(ctx);
  return json({ page: await getClient('confluence').getPage(id) });
});
