import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { addKnowledge, readAnalysisForm } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Multipart: context, classification, references (JSON list), files (repeatable).
export const POST = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json({ project: await addKnowledge(user, id, await readAnalysisForm(request)) });
});
