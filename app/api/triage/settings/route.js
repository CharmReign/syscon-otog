import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { getBaseline, setBaseline } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

// The "before" numbers the Results tab compares against.
export const GET = route(async (request) => {
  await requireUser(request);
  return json({ baseline: await getBaseline() });
});

// Body: { hours, devShare }
export const PUT = route(async (request) => {
  const user = await requireUser(request);
  return json({ baseline: await setBaseline(user, await readJson(request)) });
});
