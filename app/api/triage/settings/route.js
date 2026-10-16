import { requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { getBaseline, setBaseline } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

// The "before" numbers the Results tab compares against.
export const GET = route(async (request) => {
  requireUser(request);
  return json({ baseline: getBaseline() });
});

// Body: { hours, devShare }
export const PUT = route(async (request) => {
  const user = requireUser(request);
  return json({ baseline: setBaseline(user, await readJson(request)) });
});
