'use client';

import Link from 'next/link';
import { Compass, FileText, Ticket } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { IssueBrowser } from '@/components/integrations/issue-browser';
import { ErrorState, IntegrationNotice, Loading, PageTitle, Panel, useApi } from '@/components/otog/ui';
import { isAdmin } from '@/lib/access';

// Client Defect Triage: client defects come from Jira (filtered by the server's
// JIRA_DEFECT_JQL); each defect is paired with internal and Confluence knowledge that
// may explain it. No defect data is stored or invented here.
export default function DefectTriagePage() {
  const { user } = useAuth();
  const status = useApi('integrations/status');

  return (
    <div>
      <PageTitle eyebrow="Internal module" title="Client Defect Triage"
        subtitle="Find a reported client defect, see its severity, priority and affected product, and pull up the documentation that helps you triage it." />
      {status.isLoading ? <Loading /> : status.error ? <ErrorState error={status.error} onRetry={status.refetch} /> : !status.data.integrations.jira.configured ? (
        <div className="space-y-4">
          <IntegrationNotice name="Jira" isAdmin={isAdmin(user)} />
          <Panel title="What you can do meanwhile">
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Compass className="w-4 h-4 text-primary mt-0.5" /><span>Search product and system documentation in the <Link href="/modules/as-is-navigator" className="text-primary hover:underline">AS-IS Navigator</Link>.</span></li>
              <li className="flex gap-2"><FileText className="w-4 h-4 text-primary mt-0.5" /><span>Read support procedures in <Link href="/modules/level-up/materials" className="text-primary hover:underline">Learning materials</Link>.</span></li>
              <li className="flex gap-2"><Ticket className="w-4 h-4 text-primary mt-0.5" /><span>Once Jira is connected, client defects appear here with related knowledge for each one.</span></li>
            </ul>
          </Panel>
        </div>
      ) : (
        <IssueBrowser listPath="triage/defects" detailPath="triage/defects" showClient relatedKnowledge
          emptyHint="Showing client defects from Jira." />
      )}
    </div>
  );
}
