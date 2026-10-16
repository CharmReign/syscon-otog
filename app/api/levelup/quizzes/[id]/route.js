import { isAdmin } from '@/lib/access';
import { requireAdmin, requireUser } from '@/lib/server/auth';
import { HttpError, json, params, readJson, route } from '@/lib/server/http';
import { deleteQuiz, getQuizForAdmin, getQuizForTaking, updateQuiz } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

// ?manage=1 returns the full quiz with answers (admins only); otherwise questions without answers.
export const GET = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  if (new URL(request.url).searchParams.get('manage') === '1') {
    if (!isAdmin(user)) throw new HttpError(403, 'Only administrators can do this.', 'FORBIDDEN');
    return json({ quiz: await getQuizForAdmin(id) });
  }
  return json({ quiz: await getQuizForTaking(user, id) });
});

export const PATCH = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { id } = await params(ctx);
  return json({ quiz: await updateQuiz(user, id, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { id } = await params(ctx);
  return json(await deleteQuiz(user, id));
});
