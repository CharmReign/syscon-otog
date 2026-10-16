'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, BookOpen, Bug, Inbox as InboxIcon, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/auth-provider';
import { IssueBrowser } from '@/components/integrations/issue-browser';
import { ErrorState, IntegrationNotice, Loading, PageTitle, useApi } from '@/components/otog/ui';
import { Inbox } from '@/components/triage/inbox';
import { NewQuery } from '@/components/triage/new-query';
import { Results } from '@/components/triage/results';
import { Sources } from '@/components/triage/sources';
import { isAdmin } from '@/lib/access';

const TABS = [
  { value: 'inbox', label: 'Inbox', icon: InboxIcon },
  { value: 'new', label: 'Paste a query', icon: Plus },
  { value: 'sources', label: 'Knowledge sources', icon: BookOpen },
  { value: 'results', label: 'Results', icon: BarChart3 },
  { value: 'defects', label: 'Jira defects', icon: Bug },
];

export default function DefectTriagePage() {
  return <Suspense fallback={<Loading />}><DefectTriage /></Suspense>;
}

// Client Defect Triage: an agent pastes a client email or chat (with screenshots or
// video), gets a cited reply with steps to unblock the client, and a Jira ticket draft
// when it's a new defect. Every reply is reviewed and approved by a person; nothing is
// sent and nothing is written to Jira. The Jira defects tab lists reported defects.
function DefectTriage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some(t => t.value === params.get('tab')) ? params.get('tab') : 'inbox';
  const selected = params.get('id');
  const go = (next, id) => router.replace(`/modules/defect-triage?tab=${next}${id ? `&id=${id}` : ''}`);

  return (
    <div>
      <PageTitle eyebrow="Internal module" title="Client Defect Triage"
        subtitle="Paste a client email or chat, get a cited answer with steps to unblock them, then review and approve it. Nothing is sent without review."
        actions={tab !== 'new' && <Button onClick={() => go('new')}><Plus className="w-4 h-4" /> Paste a query</Button>} />

      <Tabs value={tab} onValueChange={(v) => go(v, v === 'inbox' ? selected : null)}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          {TABS.map(t => <TabsTrigger key={t.value} value={t.value}><t.icon className="w-4 h-4 mr-1.5" /> {t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="inbox"><Inbox selected={selected} onSelect={(id) => go('inbox', id)} onPaste={() => go('new')} /></TabsContent>
        <TabsContent value="new"><NewQuery onAdded={(id) => go('inbox', id)} /></TabsContent>
        <TabsContent value="sources"><Sources /></TabsContent>
        <TabsContent value="results"><Results /></TabsContent>
        <TabsContent value="defects"><JiraDefects /></TabsContent>
      </Tabs>

      <p className="mt-6 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        This module never sends a reply and never writes to Jira. Every draft needs an agent to review and approve it. Jira and Confluence are only read, and only the few matching references (plus the client's attachments) are sent to Claude for each query.
      </p>
    </div>
  );
}

// Client defects from Jira (filtered by the server's JIRA_DEFECT_JQL), each paired with
// internal and Confluence knowledge that may explain it.
function JiraDefects() {
  const { user } = useAuth();
  const status = useApi('integrations/status');
  if (status.isLoading) return <Loading />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.refetch} />;
  if (!status.data.integrations.jira.configured) return <IntegrationNotice name="Jira" isAdmin={isAdmin(user)} />;
  return <IssueBrowser listPath="triage/defects" detailPath="triage/defects" showClient relatedKnowledge emptyHint="Showing client defects from Jira." />;
}
