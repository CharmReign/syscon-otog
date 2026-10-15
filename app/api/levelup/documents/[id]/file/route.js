import { requireUser } from '@/lib/server/auth';
import { params, route } from '@/lib/server/http';
import { getDocumentFile } from '@/lib/server/documents/service';

export const dynamic = 'force-dynamic';

// Downloads the original upload. Sent as an attachment with a fixed type so the
// browser never renders an uploaded file inline as a page.
export const GET = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  const { buffer, filename, mime } = getDocumentFile(user, id);
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
