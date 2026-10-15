import { beforeEach, describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/access';
import { authenticate, createSessionToken, readSessionToken, hashPassword, verifyPassword } from '@/lib/server/auth';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { GET as listDocs, POST as uploadDoc } from '@/app/api/levelup/documents/route';
import { POST as createQuiz } from '@/app/api/levelup/quizzes/route';
import { GET as listAttempts } from '@/app/api/levelup/attempts/route';
import { call, createUser, req, textFile, uploadForm, useTempDataDir } from './helpers';

describe('sessions and passwords', () => {
  beforeEach(() => { useTempDataDir(); });

  it('hashes and verifies passwords', () => {
    const h = hashPassword('s3cret-pass');
    expect(verifyPassword('s3cret-pass', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });

  it('rejects tampered and expired session tokens', () => {
    const token = createSessionToken('user-1');
    expect(readSessionToken(token).uid).toBe('user-1');
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'admin-id', exp: Date.now() + 1e6 })).toString('base64url');
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.${sig[0] === 'x' ? 'y' : 'x'}${sig.slice(1)}`)).toBeNull();
    expect(readSessionToken(createSessionToken('user-1', Date.now() - 9 * 3600_000))).toBeNull();
  });

  it('logs in with the right password only and sets an httpOnly cookie', async () => {
    const u = createUser(ROLES.EMPLOYEE);
    expect(authenticate(u.username, 'nope')).toBeNull();
    const res = await login(req('/api/auth/login', { method: 'POST', body: { username: u.username, password: 'pw-123456' } }), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/);
    const bad = await call(login, req('/api/auth/login', { method: 'POST', body: { username: u.username, password: 'nope' } }));
    expect(bad.status).toBe(401);
  });

  it('reads the role from the store, not the client', async () => {
    const u = createUser(ROLES.EMPLOYEE);
    const { data } = await call(me, req('/api/auth/me', { user: u }));
    expect(data.user.role).toBe(ROLES.EMPLOYEE);
    expect(data.user.passwordHash).toBeUndefined();
  });
});

describe('authorization', () => {
  let employee, admin;
  beforeEach(() => {
    useTempDataDir();
    employee = createUser(ROLES.EMPLOYEE, 'Erin Employee');
    admin = createUser(ROLES.ADMIN, 'Ada Admin');
  });

  it('requires sign-in for module data', async () => {
    expect((await call(listDocs, req('/api/levelup/documents'))).status).toBe(401);
    expect((await call(listDocs, req('/api/levelup/documents', { user: employee }))).status).toBe(200);
    expect((await call(listDocs, req('/api/levelup/documents', { user: admin }))).status).toBe(200);
  });

  it('only lets administrators upload quiz source documents', async () => {
    const asEmployee = await call(uploadDoc, req('/api/levelup/documents', { method: 'POST', user: employee, form: uploadForm(textFile()) }));
    expect(asEmployee.status).toBe(403);
    const anonymous = await call(uploadDoc, req('/api/levelup/documents', { method: 'POST', form: uploadForm(textFile()) }));
    expect(anonymous.status).toBe(401);
    const asAdmin = await call(uploadDoc, req('/api/levelup/documents', { method: 'POST', user: admin, form: uploadForm(textFile()) }));
    expect(asAdmin.status).toBe(201);
  });

  it('stops employees generating quizzes or reading everyone\'s results directly', async () => {
    const gen = await call(createQuiz, req('/api/levelup/quizzes', { method: 'POST', user: employee, body: { documentId: 'x' } }));
    expect(gen.status).toBe(403);
    const all = await call(listAttempts, req('/api/levelup/attempts?all=1', { user: employee }));
    expect(all.status).toBe(200);
    expect(all.data.attempts).toEqual([]); // ?all=1 is ignored for employees
  });
});
