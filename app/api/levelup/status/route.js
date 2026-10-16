import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { ACCEPT, MIN_TEXT_CHARS, SUPPORTED_TYPES, maxUploadBytes } from '@/lib/server/documents/extract';
import { generatorStatus } from '@/lib/server/quiz/generator';

export const dynamic = 'force-dynamic';

// Upload limits and which quiz generator is active, for the admin screens.
export const GET = route(async (request) => {
  await requireUser(request);
  return json({
    generator: generatorStatus(),
    autoPublish: process.env.QUIZ_AUTO_PUBLISH === 'true',
    upload: { accept: ACCEPT, maxBytes: maxUploadBytes(), minTextChars: MIN_TEXT_CHARS, types: Object.values(SUPPORTED_TYPES).map(t => t.label) },
  });
});
