import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { addItem, publicProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Adds an open item. Body: { kind: DECISION | QUESTION, title, description, position, owner, status }
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await addItem(user, id, await readJson(request))) }, 201);
});
