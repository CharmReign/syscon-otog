import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicProject, readAnalysisForm, runBaseline } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Creates the AS-IS baseline (KB v1.0), once. Multipart: module, problem, currentState,
// pains (JSON list), otherPains, pasted, pastedSources (JSON list), references (JSON list),
// demo ("1" for the demo script), files (repeatable: documents and JPEG images).
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await runBaseline(user, id, await readAnalysisForm(request))) });
});
