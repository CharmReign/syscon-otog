import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { getAttempt } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ attempt: await getAttempt(user, id) });
});
