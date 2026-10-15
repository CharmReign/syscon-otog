import { requireUser } from '@/lib/server/auth';
import { json, params, route } from '@/lib/server/http';
import { getClient } from '@/lib/server/integrations';
import { queryFromText, searchKnowledge } from '@/lib/server/knowledge';

export const dynamic = 'force-dynamic';

// One defect plus knowledge that may help triage it: internal documents and Confluence
// pages matching its summary and components. An AI triage summary can be added here
// later by passing `defect` and `related` to a generation service.
export const GET = route(async (request, ctx) => {
  requireUser(request);
  const { key } = await params(ctx);
  const defect = await getClient('jira').getIssue(key);
  const query = queryFromText(`${defect.summary} ${defect.components.join(' ')}`);
  const related = query ? await searchKnowledge(query, { sources: ['internal', 'confluence'], limit: 5 }) : {};
  return json({ defect, related, relatedQuery: query });
});
