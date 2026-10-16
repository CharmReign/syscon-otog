import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { addAttachments, readQueryForm } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

// Multipart: meta (JSON list), files (JPEG, repeatable).
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ query: await addAttachments(user, id, await readQueryForm(request)) });
});
