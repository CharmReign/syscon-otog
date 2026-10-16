import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, readJson, route } from '@/lib/server/http';
import { createProject, listProjects, publicProject } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  await requireUser(request);
  return json({ projects: await listProjects(), ai: aiConfigured() });
});

// Body: { name, module, notes }
export const POST = route(async (request) => {
  const user = await requireUser(request);
  return json({ project: publicProject(await createProject(user, await readJson(request))) }, 201);
});
