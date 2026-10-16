import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { fillTemplateBatch } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Writes one batch of the TO-BE template's sections. Body: { batch, demo, today }
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json(await fillTemplateBatch(user, id, await readJson(request)));
});
