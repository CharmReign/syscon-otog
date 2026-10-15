'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { IssueBrowser } from '@/components/integrations/issue-browser';
import { ErrorState, IntegrationNotice, Loading, PageTitle, Pill, useApi } from '@/components/otog/ui';
import { isAdmin } from '@/lib/access';

// Jira Tickets: read-only search and detail through the server's Jira integration.
export default function JiraPage() {
  const { user } = useAuth();
  const status = useApi('integrations/status');
  const jira = status.data?.integrations.jira;

  return (
    <div>
      <PageTitle eyebrow="External integration" title="Jira Tickets"
        subtitle="Search Jira by keyword, issue key, project or status. Results reflect what the integration account can see; nothing in Jira is changed from here."
        actions={jira?.configured && <Pill tone={jira.lastCheck?.ok ? 'green' : 'gray'}>{jira.lastCheck?.ok ? 'Connection verified' : 'Configured · not verified'}</Pill>} />
      {status.isLoading ? <Loading /> : status.error ? <ErrorState error={status.error} onRetry={status.refetch} /> : !jira.configured ? (
        <IntegrationNotice name="Jira" isAdmin={isAdmin(user)} />
      ) : (
        <IssueBrowser listPath="jira/search" detailPath="jira/issues" requireQuery
          emptyHint="Enter keywords, an issue key or a project key to search." />
      )}
    </div>
  );
}
