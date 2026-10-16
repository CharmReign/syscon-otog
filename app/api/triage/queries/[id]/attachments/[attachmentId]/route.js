import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { getAttachment, removeAttachment } from '@/lib/server/triage/service';

export const dynamic = 'force-dynamic';

// Serves a stored attachment. Only JPEGs are accepted on upload, so the type is fixed.
export const GET = route(async (request, ctx) => {
  requireUser(request);
  const { id, attachmentId } = await params(ctx);
  return new Response(getAttachment(id, attachmentId), {
    headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' },
  });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id, attachmentId } = await params(ctx);
  return json({ query: removeAttachment(user, id, attachmentId) });
});
