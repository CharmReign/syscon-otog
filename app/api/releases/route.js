import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { createRelease, listReleases } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  await requireUser(request);
  return json({ releases: await listReleases() });
});

// Body: { name, version, targetDate, notes, jiraKeys, templateId }
export const POST = route(async (request) => {
  const user = await requireUser(request);
  return json({ release: await createRelease(user, await readJson(request)) }, 201);
});
