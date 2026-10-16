import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

// ?q=&space=&start=&limit=&cursor=
export const GET = route(async (request) => {
  await requireUser(request);
  const sp = new URL(request.url).searchParams;
  const data = await getClient('confluence').search({
    query: sp.get('q'), spaceKey: sp.get('space') || undefined,
    start: sp.get('start'), limit: sp.get('limit'), cursor: sp.get('cursor') || undefined,
  });
  return json(data);
});
