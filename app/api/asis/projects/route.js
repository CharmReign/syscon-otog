import { requireUser } from '@/lib/server/auth';
import { aiConfigured } from '@/lib/server/ai';
import { json, readJson, route } from '@/lib/server/http';
import { createProject, listProjects } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  requireUser(request);
  return json({ projects: listProjects(), ai: aiConfigured() });
});

// Body: { name, module, notes }
export const POST = route(async (request) => {
  const user = requireUser(request);
  return json({ project: createProject(user, await readJson(request)) }, 201);
});
