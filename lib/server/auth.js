// Server-side authentication and role checks.
//
// Sessions are an HMAC-SHA256-signed, httpOnly cookie holding { uid, exp }. The role is
// always read from the users collection on each request, never trusted from the client,
// so demoting a user takes effect immediately.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, findOne, insertOne } from '@/lib/server/store';
import { HttpError } from '@/lib/server/http';
import { ROLES } from '@/lib/access';

export const SESSION_COOKIE = 'otog_session';
const SESSION_HOURS = 8;

// ---- secrets ----

function sessionSecret() {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    // Shown on the login screen, so a missing setting is obvious after a first deploy.
    throw new HttpError(500, 'The server is missing SESSION_SECRET. Add it to the environment variables (e.g. in Vercel project settings) and redeploy.', 'NO_SESSION_SECRET');
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

// Built-in accounts, so the platform is usable without any user management. Their
// credentials are shown on the login screen. They have fixed ids, so a session stays
// valid on every server instance even when each one seeds its own (temporary) store.
// Set SEED_DEMO_USERS=false once real accounts exist.
export const BUILT_IN_PASSWORD = 'syscon123';
export const BUILT_IN_ACCOUNTS = [
  { id: 'syscon-admin', username: 'sysconadmin', name: 'Syscon Admin', role: ROLES.ADMIN },
  { id: 'syscon-user', username: 'sysconuser', name: 'Syscon User', role: ROLES.EMPLOYEE },
];

const shouldSeedDemoUsers = () => process.env.SEED_DEMO_USERS !== 'false';

// Remembers which stores were already seeded, so each request doesn't re-check.
const SEEDED = '__otog_seeded__';
const storeKey = () => (process.env.MONGODB_URI ? `${process.env.MONGODB_URI}|${process.env.MONGODB_DB || ''}` : dataDir());

export async function ensureUsers() {
  if (!shouldSeedDemoUsers()) return;
  const seeded = (globalThis[SEEDED] ||= new Set());
  const key = storeKey();
  if (seeded.has(key)) return;
  for (const a of BUILT_IN_ACCOUNTS) {
    if (await findOne('users', a.id)) continue;
    try {
      await insertOne('users', { ...a, email: '', passwordHash: hashPassword(BUILT_IN_PASSWORD), createdAt: new Date().toISOString() });
    } catch (e) {
      // Another instance seeded the same account at the same moment (duplicate _id).
      if (e?.code !== 11000) throw e;
    }
  }
  seeded.add(key);
}

export const publicUser = (u) => u && ({
  id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
});

export async function authenticate(username, password) {
  await ensureUsers();
  const user = await findOne('users', u => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
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

export async function currentUser(request) {
  const session = readSessionToken(cookieValue(request, SESSION_COOKIE));
  if (!session) return null;
  // A fresh instance may not have seeded its store yet.
  await ensureUsers();
  const user = await findOne('users', session.uid);
  return user && !user.disabled ? user : null;
}

export async function requireUser(request) {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Sign in to continue.', 'UNAUTHENTICATED');
  return user;
}

export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user.role !== ROLES.ADMIN) throw new HttpError(403, 'Only administrators can do this.', 'FORBIDDEN');
  return user;
}
