import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { addFinding, publicProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// Body: { text, status, source }
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await addFinding(user, id, await readJson(request))) }, 201);
});
