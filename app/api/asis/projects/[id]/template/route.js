import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { publicProject, readAnalysisForm, removeTemplate, templateFile, uploadTemplate } from '@/lib/server/asis/service';

export const dynamic = 'force-dynamic';

// The stored template file, which the browser fills with the design.
export const GET = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  const { buffer, filename, mime } = await templateFile(user, id);
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

// Multipart: file (.docx or .dotx), outline (JSON, described in the browser).
export const POST = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  const { file, fields } = await readAnalysisForm(request);
  return json({ project: publicProject(await uploadTemplate(user, id, { file, outline: fields.outline })) });
});

export const DELETE = route(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await params(ctx);
  return json({ project: publicProject(await removeTemplate(user, id)) });
});
