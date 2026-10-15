import { DOC_CATEGORIES } from '@/lib/levelup';
import { requireUser } from '@/lib/server/auth';
import { badRequest, json, route } from '@/lib/server/http';
import { searchKnowledge } from '@/lib/server/knowledge';

export const dynamic = 'force-dynamic';

// ?q=&sources=internal,confluence,jira&categories=SYSTEM,SUPPORT
export const GET = route(async (request) => {
  requireUser(request);
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') || '').trim();
  if (q.length < 2) throw badRequest('Enter at least 2 characters to search.');
  if (q.length > 200) throw badRequest('Search text must be 200 characters or fewer.');
  const valid = DOC_CATEGORIES.map(c => c.value);
  const categories = (sp.get('categories') || '').split(',').filter(c => valid.includes(c));
  const sources = (sp.get('sources') || 'internal,confluence,jira').split(',');
  return json({ query: q, sources: await searchKnowledge(q, { sources, categories }) });
});
