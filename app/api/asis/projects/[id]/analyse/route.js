import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { readAnalysisForm, runInitialAnalysis } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Multipart: module, problem, currentState, pains (JSON list), otherPains,
// references (JSON list), files (repeatable), template (optional file).
export const POST = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json({ project: await runInitialAnalysis(user, id, await readAnalysisForm(request)) });
});
