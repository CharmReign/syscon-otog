// Server-side authentication and role checks.
//
// Sessions are an HMAC-SHA256-signed, httpOnly cookie holding { uid, exp }. The role is
// always read from the users collection on each request, never trusted from the client,
// so demoting a user takes effect immediately.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

import { dataDir, findAll, findOne, insertOne } from '@/lib/server/store';
import { HttpError } from '@/lib/server/http';
import { ROLES } from '@/lib/access';

export const SESSION_COOKIE = 'otog_session';
const SESSION_HOURS = 8;

// ---- secrets ----

function sessionSecret() {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  // Development: generate once and keep it in the data folder so restarts don't sign everyone out.
  const file = path.join(dataDir(), '.session-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(dataDir(), { recursive: true });
  const secret = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

// ---- passwords ----

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---- users ----

// Demo accounts make the app usable out of the box. They are created only outside
// production unless SEED_DEMO_USERS=true; set SEED_DEMO_USERS=false to disable.
function shouldSeedDemoUsers() {
  const flag = process.env.SEED_DEMO_USERS;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export function ensureUsers() {
  if (findAll('users').length || !shouldSeedDemoUsers()) return;
  const password = process.env.DEMO_PASSWORD || 'demo1234';
  const now = new Date().toISOString();
  insertOne('users', { id: uuidv4(), username: 'employee', name: 'Demo Employee', email: 'employee@example.com', role: ROLES.EMPLOYEE, passwordHash: hashPassword(password), createdAt: now });
  insertOne('users', { id: uuidv4(), username: 'admin', name: 'Demo Admin', email: 'admin@example.com', role: ROLES.ADMIN, passwordHash: hashPassword(password), createdAt: now });
}

export const publicUser = (u) => u && ({
  id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
});

export function authenticate(username, password) {
  ensureUsers();
  const user = findOne('users', u => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
  // Verify against a dummy hash when the user doesn't exist so timing doesn't reveal valid usernames.
  const ok = verifyPassword(String(password || ''), user?.passwordHash || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  return ok && user && !user.disabled ? user : null;
}

// ---- session tokens ----

const sign = (payload) => crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');

export function createSessionToken(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + SESSION_HOURS * 3600_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ---- guards used by every route ----

export function currentUser(request) {
  const session = readSessionToken(cookieValue(request, SESSION_COOKIE));
  if (!session) return null;
  const user = findOne('users', session.uid);
  return user && !user.disabled ? user : null;
}

export function requireUser(request) {
  const user = currentUser(request);
  if (!user) throw new HttpError(401, 'Sign in to continue.', 'UNAUTHENTICATED');
  return user;
}

export function requireAdmin(request) {
  const user = requireUser(request);
  if (user.role !== ROLES.ADMIN) throw new HttpError(403, 'Only administrators can do this.', 'FORBIDDEN');
  return user;
}
