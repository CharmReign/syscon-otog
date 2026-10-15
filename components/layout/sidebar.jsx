'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, LogOut, ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogoMark } from '@/components/brand/logo';
import { navFor, isActive } from '@/components/layout/nav-config';
import { ROLE_LABELS } from '@/lib/access';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

function NavLink({ item, pathname, onClose, external, child }) {
  const active = isActive(item, pathname);
  return (
    <Link
      href={item.href}
      onClick={() => onClose?.()}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
        child ? 'px-2.5 py-1.5 text-[13px]' : 'px-2.5 py-2',
        active ? 'bg-accent text-accent-foreground' : 'text-foreground/75 hover:bg-muted hover:text-foreground',
      )}
    >
      <item.icon className={cn('flex-shrink-0', child ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      <span className="truncate flex-1">{item.label}</span>
      {external && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" aria-label="External system" />}
    </Link>
  );
}

export function Sidebar({ user, onLogout, mobile = false, onClose }) {
  const pathname = usePathname();
  return (
    <aside className={cn('flex flex-col bg-sidebar border-r border-sidebar-border', mobile ? 'h-full' : 'w-72 h-screen')}>
      <div className="h-16 px-4 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <LogoMark className="w-9 h-9" />
          <div className="min-w-0 leading-tight">
            <div className="font-bold tracking-tight truncate">OneTeamOneGoal</div>
            <div className="text-[11px] text-primary font-semibold">Syscon</div>
          </div>
        </div>
        {mobile && <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close menu"><X className="w-4 h-4" /></Button>}
      </div>
      <ScrollArea className="flex-1 scrollbar-thin">
        <nav aria-label="Main" className="p-3 space-y-5">
          {navFor(user).map((group) => (
            <div key={group.section} className={cn(group.external && 'rounded-xl border border-dashed border-sidebar-border p-2 -mx-1')}>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{group.section}</span>
                {group.external && <span className="text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-semibold">Atlassian</span>}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <div key={item.key}>
                    {item.children ? (
                      <>
                        <div className={cn('flex items-center gap-3 px-2.5 py-2 text-sm font-semibold', pathname.startsWith(item.href) ? 'text-primary' : 'text-foreground/90')}>
                          <item.icon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <div className="ml-4 pl-2 border-l border-sidebar-border space-y-0.5">
                          {item.children.map(c => <NavLink key={c.key} item={c} pathname={pathname} onClose={onClose} child />)}
                        </div>
                      </>
                    ) : (
                      <NavLink item={item} pathname={pathname} onClose={onClose} external={group.external} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="p-3 border-t border-sidebar-border">
        <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition text-left">
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials(user?.name || '')}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{ROLE_LABELS[user?.role]}</div>
          </div>
          <LogOut className="w-4 h-4 text-muted-foreground" aria-label="Sign out" />
        </button>
      </div>
    </aside>
  );
}
