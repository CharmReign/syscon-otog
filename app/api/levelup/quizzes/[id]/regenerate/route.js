import { requireAdmin } from '@/lib/server/auth';
import { badRequest, json, params, readJson, route } from '@/lib/server/http';
import { regenerateQuiz } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export const POST = route(async (request, ctx) => {
  const user = requireAdmin(request);
  const { id } = await params(ctx);
  const body = await readJson(request);
  if (body.settings !== undefined && (typeof body.settings !== 'object' || Array.isArray(body.settings))) throw badRequest('settings must be an object.');
  return json({ quiz: await regenerateQuiz(user, id, { settings: body.settings }) });
});
