import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { publicProject, removeFinding, updateFinding } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Body: any of { status, text, source, note }
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, findingId } = await params(ctx);
  return json({ project: publicProject(await updateFinding(user, id, findingId, await readJson(request))) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, findingId } = await params(ctx);
  return json({ project: publicProject(await removeFinding(user, id, findingId)) });
});
