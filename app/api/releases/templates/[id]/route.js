import { requireAdmin } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { deleteTemplate, saveTemplate } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

export const PUT = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { id } = await params(ctx);
  return json({ template: await saveTemplate(user, id, await readJson(request)) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { id } = await params(ctx);
  return json(await deleteTemplate(user, id));
});
