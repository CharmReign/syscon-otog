import { requireAdmin, requireUser } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { listTemplates, saveTemplate } from '@/lib/server/releases';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  requireUser(request);
  return json({ templates: listTemplates() });
});

// Admin. Body: { name, description, items: [{ title, description, critical }] }
export const POST = route(async (request) => {
  const user = requireAdmin(request);
  return json({ template: saveTemplate(user, null, await readJson(request)) }, 201);
});
