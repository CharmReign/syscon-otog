import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicProject, restoreItem } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Restores a deleted open item to where it was.
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id, itemId } = await params(ctx);
  return json({ project: publicProject(await restoreItem(user, id, itemId)) });
});
