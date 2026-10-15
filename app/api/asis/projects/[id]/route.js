import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, params, readJson, route } from '@/lib/server/http';
import { deleteProject, getProject, updateProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  requireUser(request);
  const { id } = await params(ctx);
  return json({ project: getProject(id), ai: aiConfigured() });
});

// Body: any of { name, module, notes, intake: { problem, currentState, pains, otherPains } }
export const PATCH = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json({ project: updateProject(user, id, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  return json(deleteProject(user, id));
});
