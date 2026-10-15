import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

// ?q=&project=&status=&limit=&startAt= (Data Center) or &next= (Cloud page token)
export const GET = route(async (request) => {
  requireUser(request);
  const sp = new URL(request.url).searchParams;
  const data = await getClient('jira').search({
    query: sp.get('q'), project: sp.get('project') || undefined, status: sp.get('status') || undefined,
    limit: sp.get('limit'), startAt: sp.get('startAt'), nextPageToken: sp.get('next') || undefined,
  });
  return json(data);
});
