import { clearSessionCookie } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async () => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() }));
