import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { publicProject, removeItem, updateItem } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Body: any of { kind, title, description, position, outcome, owner, status }
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, decisionId } = await params(ctx);
  return json({ project: publicProject(await updateItem(user, id, decisionId, await readJson(request))) });
});

// Moves the item to the project's recently deleted list.
export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, decisionId } = await params(ctx);
  return json({ project: publicProject(await removeItem(user, id, decisionId)) });
});
