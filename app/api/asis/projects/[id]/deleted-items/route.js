import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicProject, purgeDeleted } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Empties the recently deleted list.
export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await purgeDeleted(user, id)) });
});
