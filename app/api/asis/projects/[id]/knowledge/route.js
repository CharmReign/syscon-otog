import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { addKnowledge, publicProject, readAnalysisForm } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Adds a knowledge base version. Multipart: context, classification, pasted,
// pastedSources (JSON list), references (JSON list), demo, files (repeatable).
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await addKnowledge(user, id, await readAnalysisForm(request))) });
});
