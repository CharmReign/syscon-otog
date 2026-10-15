'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { QuizRunner } from '@/components/levelup/quiz-runner';
import { EmptyState, ErrorState, Loading, Panel, useApi } from '@/components/otog/ui';

export default function TakeQuizPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useApi(`levelup/quizzes/${id}`, { staleTime: Infinity });

  if (isLoading) return <Loading label="Loading quiz…" />;
  if (error?.status === 404) {
    return (
      <Panel>
        <EmptyState title="Quiz not available" body="It may have been unpublished or removed." action={<Button asChild><Link href="/modules/level-up/quizzes">Back to quizzes</Link></Button>} />
      </Panel>
    );
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return <div className="max-w-3xl"><QuizRunner key={data.quiz.id} quiz={data.quiz} /></div>;
}
