import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, params, readJson, route } from '@/lib/server/http';
import { deleteProject, getProject, publicProject, updateProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await getProject(id)), ai: aiConfigured() });
});

// Body: any of { name, module, notes, toBeFileName,
//   intake: { problem, currentState, pains, otherPains, pasted, pastedSources } (before the baseline only) }
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await updateProject(user, id, await readJson(request))) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json(await deleteProject(user, id));
});
