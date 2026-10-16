import { requireAdmin } from '@/lib/server/auth';
import { json, notFound, params, route } from '@/lib/server/http';
import { isIntegration, testIntegration } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

// Admin: makes a real authenticated call and records whether it worked.
export const POST = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { name } = await params(ctx);
  if (!isIntegration(name)) throw notFound('Unknown integration.');
  return json({ integration: await testIntegration(user, name) });
});
