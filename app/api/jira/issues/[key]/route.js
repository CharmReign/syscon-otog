import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  await requireUser(request);
  const { key } = await params(ctx);
  return json({ issue: await getClient('jira').getIssue(key) });
});
