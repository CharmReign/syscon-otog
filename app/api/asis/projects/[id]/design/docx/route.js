import { requireUser } from '@/lib/server/auth';
import { params, route } from '@/lib/server/http';
import { designWord } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// The TO-BE design as a Word document in the standard layout.
export const GET = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  const { buffer, filename } = await designWord(user, id);
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
