import { currentUser, ensureUsers, publicUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

// Returns { user } or { user: null }; never 401, so the login page can call it freely.
export const GET = route(async (request) => {
  await ensureUsers();
  return json({ user: publicUser(await currentUser(request)) });
});
