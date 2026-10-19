'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, CheckCircle2, CircleSlash, Loader2, PlugZap, Sparkles, Ticket, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { ErrorState, Loading, PageTitle, Panel, Pill, useApi } from '@/components/otog/ui';
import { api } from '@/lib/api-client';
import { isAdmin } from '@/lib/access';
import { fmtBytes, fmtDateTime } from '@/lib/format';

const ICONS = { confluence: BookOpen, jira: Ticket };

// Integration and quiz-generation status. Secrets never reach the browser; this page
// only shows what is configured and whether a real connection test has succeeded.
export function SettingsPage({ user }) {
  const admin = isAdmin(user);
  const integrations = useApi('integrations/status');
  const levelup = useApi('levelup/status');

  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Settings & integrations" subtitle="Connection status for the external sections, and how quizzes are generated." />

      <div>
        <h2 className="text-lg font-semibold text-primary mb-3">External integrations</h2>
        {integrations.isLoading ? <Loading /> : integrations.error ? <ErrorState error={integrations.error} onRetry={integrations.refetch} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.values(integrations.data.integrations).map(i => <IntegrationCard key={i.name} integration={i} admin={admin} />)}
          </div>
        )}
        {!admin && <p className="text-xs text-muted-foreground mt-2">Only administrators can run connection tests.</p>}
      </div>

      <Panel title="Quiz generation">
        {levelup.isLoading ? <Loading /> : levelup.error ? <ErrorState error={levelup.error} /> : (
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Question writer</dt>
              <dd className="font-medium flex items-center gap-1.5 mt-0.5"><Sparkles className="w-4 h-4 text-primary" />{levelup.data.generator.label}</dd>
              {!levelup.data.generator.aiConfigured && <dd className="text-xs text-muted-foreground mt-1">Set ANTHROPIC_API_KEY on the server to have Claude write questions. Each AI question must quote its source, or it's discarded.</dd>}
            </div>
            <div>
              <dt className="text-muted-foreground">Publishing</dt>
              <dd className="font-medium mt-0.5">{levelup.data.autoPublish ? 'Valid quizzes publish automatically (QUIZ_AUTO_PUBLISH=true)' : 'Every quiz is reviewed by an administrator before publishing'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Accepted documents</dt>
              <dd className="font-medium mt-0.5">{levelup.data.upload.types.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Maximum upload size</dt>
              <dd className="font-medium mt-0.5">{fmtBytes(levelup.data.upload.maxBytes)}</dd>
            </div>
          </dl>
        )}
      </Panel>

      <Panel title="Appearance">
        <div className="flex items-center justify-between text-sm">
          <span>Light or dark theme</span>
          <ThemeToggle />
        </div>
      </Panel>
    </div>
  );
}

function IntegrationCard({ integration: i, admin }) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const Icon = ICONS[i.name] || PlugZap;

  const test = async () => {
    setTesting(true);
    try {
      const { integration } = await api(`integrations/${i.name}/test`, { method: 'POST' });
      queryClient.setQueryData(['integrations/status'], (old) => old && ({ integrations: { ...old.integrations, [i.name]: integration } }));
      integration.lastCheck?.ok ? toast.success(integration.lastCheck.message) : toast.error(integration.lastCheck?.message || 'Connection failed');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  let state;
  if (!i.configured) state = <Pill tone="gray"><CircleSlash className="w-3 h-3" /> Not configured</Pill>;
  else if (!i.lastCheck) state = <Pill tone="amber">Configured · not verified</Pill>;
  else if (i.lastCheck.ok) state = <Pill tone="green"><CheckCircle2 className="w-3 h-3" /> Connected</Pill>;
  else state = <Pill tone="red"><XCircle className="w-3 h-3" /> Connection failed</Pill>;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold"><Icon className="w-5 h-5 text-primary" /> {i.label}</div>
        {state}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Deployment</dt><dd>{i.baseUrl ? (i.deployment === 'cloud' ? 'Cloud' : 'Data Center / Server') : '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Base URL</dt><dd className="truncate max-w-[60%]" title={i.baseUrl || ''}>{i.baseUrl || '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">API URL</dt><dd className="truncate max-w-[60%]" title={i.apiBaseUrl || ''}>{i.apiBaseUrl || '—'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Authentication</dt><dd>{i.authMethod || '—'}</dd></div>
        {i.missing.length > 0 && <div className="text-xs text-warning">Missing: {i.missing.join(', ')}</div>}
        {!i.enabled && i.baseUrl && <div className="text-xs text-muted-foreground">Disabled by configuration.</div>}
        {i.lastCheck && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
            <div className={i.lastCheck.ok ? 'text-success' : 'text-destructive'}>{i.lastCheck.message}</div>
            <div className="text-muted-foreground mt-0.5">Tested {fmtDateTime(i.lastCheck.checkedAt)} by {i.lastCheck.checkedByName}</div>
          </div>
        )}
      </dl>
      {admin && (
        <Button variant="outline" size="sm" className="mt-4" onClick={test} disabled={!i.configured || testing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} Test connection
        </Button>
      )}
    </Panel>
  );
}
