import { requireUser } from '@/lib/server/auth';
import { json, params, readJson, route } from '@/lib/server/http';
import { editDesign, generateDesign, publicProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Super-Agent 2 designs (or redesigns) the TO-BE process. Body: { direction, demo }
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await generateDesign(user, id, await readJson(request))) });
});

// Saves the BA's edits. Body: { steps } and/or { traceability }
export const PATCH = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await editDesign(user, id, await readJson(request))) });
});
