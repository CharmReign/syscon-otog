import { requireAdmin } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publishQuiz } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

export const POST = route(async (request, ctx) => {
  const user = requireAdmin(request);
  const { id } = await params(ctx);
  return json({ quiz: publishQuiz(user, id) });
});
