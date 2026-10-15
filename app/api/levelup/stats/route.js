import { requireUser } from '@/lib/server/auth';
import { json, route } from '@/lib/server/http';
import { learnerStats } from '@/lib/server/quiz/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => json({ stats: learnerStats(requireUser(request)) }));
