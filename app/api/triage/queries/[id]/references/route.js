import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { previewReferences } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

// The references a draft would use: library, documents, Jira and Confluence. No AI call.
export const GET = route(async (request, ctx) => {
  await requireUser(request);
  const { id } = await params(ctx);
  return json(await previewReferences(id));
});
