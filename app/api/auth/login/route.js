import { authenticate, createSessionToken, publicUser, sessionCookie } from '@/lib/server/auth';
import { HttpError, json, readJson, route, str } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { findAll } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  const body = await readJson(request);
  const username = str(body.username, { field: 'Username', required: true, max: 100 });
  const password = str(body.password, { field: 'Password', required: true, max: 200 });
  const user = await authenticate(username, password);
  if (!user && !(await findAll('users')).length) {
    // Only when the built-in accounts were switched off and no others exist.
    throw new HttpError(503, 'No accounts exist yet. Remove SEED_DEMO_USERS=false from the server settings to bring back the built-in accounts, then restart or redeploy.', 'NO_USERS');
  }
  if (!user) throw new HttpError(401, 'Incorrect username or password.', 'INVALID_CREDENTIALS');
  await audit(user, 'auth.login', 'user', user.id);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(createSessionToken(user.id)) });
});
