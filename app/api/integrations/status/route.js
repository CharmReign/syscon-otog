import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { integrationStatus } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  requireUser(request);
  return json({ integrations: integrationStatus() });
});
