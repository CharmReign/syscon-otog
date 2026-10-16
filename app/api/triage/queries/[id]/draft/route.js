import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { draftQuery } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Finds the closest references, then drafts (or redrafts) the reply with Claude.
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ query: await draftQuery(user, id) });
});
