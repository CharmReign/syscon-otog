import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicProject, restorePreviousDesign } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Swaps the design with the version it replaced.
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await restorePreviousDesign(user, id)) });
});
