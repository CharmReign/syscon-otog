import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';

export const dynamic = 'force-dynamic';

// Client defects come from Jira, filtered by the server-configured JIRA_DEFECT_JQL.
// ?q=&project=&status=&limit=&startAt=&next=
export const GET = route(async (request) => {
  requireUser(request);
  const sp = new URL(request.url).searchParams;
  const data = await getClient('jira').search({
    defectsOnly: true,
    query: sp.get('q') || undefined, project: sp.get('project') || undefined, status: sp.get('status') || undefined,
    limit: sp.get('limit'), startAt: sp.get('startAt'), nextPageToken: sp.get('next') || undefined,
  });
  return json(data);
});
