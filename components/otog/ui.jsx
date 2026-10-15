'use client';

// Shared building blocks for OneTeamOneGoal pages, styled after the reference screens:
// teal panels, cyan headings, uppercase stat labels.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, PlugZap, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// GET /api/<path> through TanStack Query. Pass null as path to skip.
export function useApi(path, options = {}) {
  return useQuery({ queryKey: [path], queryFn: () => api(path), enabled: path != null, retry: (n, e) => n < 1 && !(e?.status >= 400 && e?.status < 500), ...options });
}

export function PageTitle({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{eyebrow}</div>}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Panel({ className, title, actions, children, as: As = 'section', ...rest }) {
  return (
    <As className={cn('rounded-xl border bg-card text-card-foreground p-5', className)} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-lg font-semibold text-primary">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </As>
  );
}

export function StatCard({ label, value, sub, icon: Icon, className }) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 flex items-center gap-4', className)}>
      {Icon && <div className="w-12 h-12 rounded-full border-4 border-muted flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></div>}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <div className="text-3xl font-bold text-primary tabular-nums leading-tight mt-1">{value}</div>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

const TONES = {
  green: 'bg-success/15 text-success border-success/30',
  cyan: 'bg-primary/15 text-primary border-primary/30',
  amber: 'bg-warning/15 text-warning border-warning/30',
  red: 'bg-destructive/15 text-destructive border-destructive/30',
  gray: 'bg-muted text-muted-foreground border-border',
};
const STATUS_TONE = {
  READY: 'green', PUBLISHED: 'green', PASS: 'green', PASSED: 'green',
  PROCESSING: 'cyan', IN_PROGRESS: 'cyan', OPEN: 'cyan',
  DRAFT: 'amber', UNPUBLISHED: 'gray', PENDING: 'gray', CLOSED: 'gray', NO_CHECKS: 'gray',
  FAILED: 'red', FAIL: 'red', BLOCKED: 'amber', AT_RISK: 'red',
  EASY: 'green', MEDIUM: 'cyan', HARD: 'amber',
};

export function Pill({ children, tone = 'gray', className }) {
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border uppercase tracking-wide whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export const StatusPill = ({ status, label }) => <Pill tone={STATUS_TONE[status] || 'gray'}>{label || String(status).replace(/_/g, ' ').toLowerCase()}</Pill>;

export function Loading({ label = 'Loading…', className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)} role="status">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cn('rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3', className)}>
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-destructive">Something went wrong</div>
        <div className="text-foreground/80 mt-0.5">{error?.message || String(error)}</div>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="w-3.5 h-3.5" /> Retry</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }) {
  return (
    <div className={cn('flex flex-col items-center text-center gap-2 py-10 px-4', className)}>
      {Icon && <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-1"><Icon className="w-5 h-5 text-muted-foreground" /></div>}
      <div className="font-semibold">{title}</div>
      {body && <p className="text-sm text-muted-foreground max-w-md">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Shown when an Atlassian integration isn't configured, or after a failed call.
export function IntegrationNotice({ name, error, isAdmin }) {
  const notConfigured = !error || error.code === 'NOT_CONFIGURED';
  return (
    <div className="rounded-xl border border-dashed p-6 flex flex-col sm:flex-row gap-4 items-start">
      <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0"><PlugZap className="w-5 h-5 text-muted-foreground" /></div>
      <div className="flex-1 text-sm">
        <div className="font-semibold text-base">{notConfigured ? `${name} isn't connected yet` : `${name} couldn't be reached`}</div>
        <p className="text-muted-foreground mt-1">
          {notConfigured
            ? `This section reads from ${name} through the server, using an integration account. Everything else in OneTeamOneGoal works without it.`
            : error.message}
        </p>
        {notConfigured && (
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? <>Add the {name} settings from <code className="text-xs">.env.example</code> to the server environment, restart, then test the connection in <Link href="/modules/system/settings" className="text-primary hover:underline">Settings</Link>.</>
              : 'Ask an administrator to set up the connection.'}
          </p>
        )}
      </div>
    </div>
  );
}

// Percentage ring from steep's quiz results.
export function Ring({ percent, size = 128, label }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" style={{ width: size, height: size }} className="shrink-0" role="img" aria-label={label || `${percent}%`}>
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" className="stroke-muted" />
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 64 64)" />
      <text x="64" y="73" textAnchor="middle" className="fill-primary text-3xl font-bold">{percent}%</text>
    </svg>
  );
}

export function ProgressBar({ value, className, label }) {
  return (
    <div className={cn('h-2 rounded-full bg-muted overflow-hidden', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
