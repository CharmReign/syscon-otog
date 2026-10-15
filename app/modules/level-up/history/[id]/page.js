'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AttemptReview, AttemptSummary } from '@/components/levelup/attempt-review';
import { EmptyState, ErrorState, Loading, Panel, useApi } from '@/components/otog/ui';

export default function AttemptPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useApi(`levelup/attempts/${id}`);

  if (isLoading) return <Loading />;
  if (error?.status === 404) return <Panel><EmptyState title="Attempt not found" body="It doesn't exist or belongs to someone else." /></Panel>;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const a = data.attempt;
  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild><Link href="/modules/level-up/history"><ArrowLeft className="w-4 h-4" /> My history</Link></Button>
      <AttemptSummary attempt={a} actions={<Button asChild><Link href={`/modules/level-up/quizzes/${a.quizId}`}>Retake quiz</Link></Button>} />
      <AttemptReview attempt={a} />
    </div>
  );
}
