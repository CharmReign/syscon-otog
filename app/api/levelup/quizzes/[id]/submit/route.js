import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { submitAttempt } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

// Body: { answers: { [questionId]: optionIndex } }. Scored on the server; the attempt
// always belongs to the signed-in user.
export const POST = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  const body = await readJson(request);
  return json({ attempt: submitAttempt(user, id, body.answers) }, 201);
});
