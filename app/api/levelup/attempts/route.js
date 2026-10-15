import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { listAttempts } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

// Your own attempts. Admins may pass ?all=1 to review everyone's results.
export const GET = route(async (request) => {
  const user = requireUser(request);
  const sp = new URL(request.url).searchParams;
  return json({ attempts: listAttempts(user, { all: sp.get('all') === '1', quizId: sp.get('quizId') || undefined }) });
});
