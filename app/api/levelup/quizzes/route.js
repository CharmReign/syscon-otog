import { requireAdmin, requireUser } from '@/lib/server/auth';
import { badRequest, json, readJson, route, str } from '@/lib/server/http';
import { createQuizFromDocument, listQuizzes } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Employees get published quizzes; admins get every quiz with its status.
export const GET = route(async (request) => json({ quizzes: listQuizzes(requireUser(request)) }));

// Admin: generate a draft quiz from a processed document.
export const POST = route(async (request) => {
  const user = requireAdmin(request);
  const body = await readJson(request);
  const documentId = str(body.documentId, { field: 'documentId', required: true, max: 64 });
  if (body.settings !== undefined && (typeof body.settings !== 'object' || Array.isArray(body.settings))) throw badRequest('settings must be an object.');
  const quiz = await createQuizFromDocument(user, documentId, {
    title: str(body.title, { field: 'Title', max: 150 }),
    description: str(body.description, { field: 'Description', max: 1000 }),
    settings: body.settings || {},
  });
  return json({ quiz }, 201);
});
