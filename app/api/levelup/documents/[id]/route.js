import { requireAdmin, requireUser } from '@/lib/server/auth';
import { json, params, readJson, route, str } from '@/lib/server/http';
import { deleteDocument, getDocument, publicDocument, updateDocument } from '@/lib/server/documents/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request, ctx) => {
  const user = requireUser(request);
  const { id } = await params(ctx);
  const withContent = new URL(request.url).searchParams.get('content') === '1';
  return json({ document: getDocument(user, id, { withContent }) });
});

export const PATCH = route(async (request, ctx) => {
  const user = requireAdmin(request);
  const { id } = await params(ctx);
  const body = await readJson(request);
  const doc = updateDocument(user, id, {
    title: str(body.title, { field: 'Title', max: 150 }),
    description: body.description === undefined ? undefined : str(body.description, { field: 'Description', max: 1000 }),
    category: str(body.category, { field: 'Category', max: 20 }),
  });
  return json({ document: publicDocument(doc) });
});

export const DELETE = route(async (request, ctx) => {
  const user = requireAdmin(request);
  const { id } = await params(ctx);
  const cascade = new URL(request.url).searchParams.get('cascade') === '1';
  return json(deleteDocument(user, id, { cascade }));
});
