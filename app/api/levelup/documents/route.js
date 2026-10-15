import { requireAdmin, requireUser } from '@/lib/server/auth';
import { HttpError, json, route, str } from '@/lib/server/http';
import { maxUploadBytes } from '@/lib/server/documents/extract';
import { listDocuments, publicDocument, uploadDocument } from '@/lib/server/documents/service';
import { DOC_STATUS } from '@/lib/levelup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const GET = route(async (request) => {
  const user = requireUser(request);
  const category = new URL(request.url).searchParams.get('category') || undefined;
  return json({ documents: listDocuments(user, { category }) });
});

// Admin-only multipart upload: file, title, description, category.
export const POST = route(async (request) => {
  const user = requireAdmin(request);
  // Reject oversized bodies before buffering them (multipart adds a little overhead).
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxUploadBytes() + 64 * 1024) throw new HttpError(413, `The file is over ${Math.round(maxUploadBytes() / 1048576)} MB.`, 'TOO_LARGE');
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Send the document as multipart form data.', 'BAD_REQUEST');
  }
  const doc = await uploadDocument(user, {
    file: form.get('file'),
    title: str(form.get('title'), { field: 'Title', max: 150 }),
    description: str(form.get('description'), { field: 'Description', max: 1000 }),
    category: str(form.get('category'), { field: 'Category', max: 20 }),
  });
  // A FAILED document is still saved (so the admin sees why), but the request reports it.
  return json({ document: publicDocument(doc) }, doc.status === DOC_STATUS.READY ? 201 : 422);
});
