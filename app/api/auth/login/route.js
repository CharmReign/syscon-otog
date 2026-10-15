import { authenticate, createSessionToken, publicUser, sessionCookie } from '@/lib/server/auth';
import { HttpError, json, readJson, route, str } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { findAll } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  const body = await readJson(request);
  const username = str(body.username, { field: 'Username', required: true, max: 100 });
  const password = str(body.password, { field: 'Password', required: true, max: 200 });
  const user = authenticate(username, password);
  if (!user && !findAll('users').length) {
    // Production builds (npm start) don't create the demo accounts unless asked to.
    throw new HttpError(503, 'No accounts exist yet. To use the demo accounts, set SEED_DEMO_USERS=true (and SESSION_SECRET) in .env.local and restart the server.', 'NO_USERS');
  }
  if (!user) throw new HttpError(401, 'Incorrect username or password.', 'INVALID_CREDENTIALS');
  audit(user, 'auth.login', 'user', user.id);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(createSessionToken(user.id)) });
});
