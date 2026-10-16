import { requireAdmin } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicDocument, reprocessDocument } from '@/lib/server/documents/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = route(async (request, ctx) => {
  const user = await requireAdmin(request);
  const { id } = await params(ctx);
  return json({ document: publicDocument(await reprocessDocument(user, id)) });
});
