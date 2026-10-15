'use client';

import { Footprints, Target, Zap, Repeat, RotateCcw, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS = { 'first-steps': Footprints, 'sharp-shooter': Target, 'quick-study': Zap, consistent: Repeat, persistent: RotateCcw, 'all-rounder': Crown };

// Badge grid from /api/levelup/stats; earned state is computed on the server from attempts.
export function BadgeGrid({ badges = [], columns = 3 }) {
  return (
    <ul className={cn('grid gap-3', columns === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
      {badges.map((b) => {
        const Icon = ICONS[b.key] || Target;
        return (
          <li key={b.key} title={b.earned ? b.name : b.hint}
            className={cn('flex flex-col items-center gap-1.5 rounded-lg border px-2 py-4 text-center', b.earned ? 'border-primary/50 bg-primary/10' : 'bg-muted/40 opacity-70')}>
            <Icon className={cn('w-6 h-6', b.earned ? 'text-primary' : 'text-muted-foreground')} />
            <span className={cn('text-xs font-semibold leading-tight', !b.earned && 'text-muted-foreground')}>{b.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{b.earned ? 'Earned' : 'Locked'}</span>
          </li>
        );
      })}
    </ul>
  );
}
