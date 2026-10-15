import {
  GraduationCap, Bug, Compass, ShieldCheck, BookOpen, Ticket, User, Settings,
  LayoutDashboard, ListChecks, Library, History, Trophy, FolderCog,
} from 'lucide-react';

import { isAdmin } from '@/lib/access';

// Where signed-in users land: the Level Up dashboard.
export const HOME_HREF = '/modules/level-up';

// Sidebar sections. `children` are sub-pages shown under their module. `adminOnly`
// hides an item from employees (the server enforces the same rule on the API).
// Every module is open to both roles.
export const NAV = [
  {
    section: 'Internal modules',
    items: [
      { key: 'defect-triage', href: '/modules/defect-triage', label: 'Client Defect Triage', icon: Bug },
      { key: 'as-is-navigator', href: '/modules/as-is-navigator', label: 'AS-IS Navigator', icon: Compass },
      { key: 'release-health', href: '/modules/release-health', label: 'Release Sanity Health Check', icon: ShieldCheck },
      // Listed last, but still the landing page after sign-in (HOME_HREF).
      {
        key: 'level-up', href: HOME_HREF, label: 'Level Up: Product & Support', short: 'Level Up', icon: GraduationCap,
        children: [
          { key: 'level-up-dashboard', href: HOME_HREF, label: 'Dashboard', icon: LayoutDashboard, exact: true },
          { key: 'quizzes', href: '/modules/level-up/quizzes', label: 'Quizzes', icon: ListChecks },
          { key: 'materials', href: '/modules/level-up/materials', label: 'Learning materials', icon: Library },
          { key: 'history', href: '/modules/level-up/history', label: 'My history', icon: History },
          { key: 'leaderboard', href: '/modules/level-up/leaderboard', label: 'Leaderboard', icon: Trophy },
          { key: 'manage', href: '/modules/level-up/manage', label: 'Manage quizzes', icon: FolderCog, adminOnly: true },
        ],
      },
    ],
  },
  {
    section: 'External integrations',
    external: true,
    items: [
      { key: 'confluence', href: '/modules/confluence', label: 'Confluence Hub', icon: BookOpen },
      { key: 'jira', href: '/modules/jira', label: 'Jira Tickets', icon: Ticket },
    ],
  },
  {
    section: 'Account',
    items: [
      { key: 'profile', href: '/modules/system/profile', label: 'My Profile', icon: User },
      { key: 'settings', href: '/modules/system/settings', label: 'Settings & integrations', icon: Settings },
    ],
  },
];

const visible = (item, user) => !item.adminOnly || isAdmin(user);

export const navFor = (user) => NAV.map(g => ({
  ...g,
  items: g.items.filter(i => visible(i, user)).map(i => (i.children ? { ...i, children: i.children.filter(c => visible(c, user)) } : i)),
}));

const allItems = () => NAV.flatMap(g => g.items.flatMap(i => [i, ...(i.children || [])]));

// Whether `user` may open `pathname`. Sub-routes (e.g. /modules/level-up/quizzes/abc)
// inherit the rule of the longest matching nav item.
export function canOpen(user, pathname) {
  if (!user) return false;
  const match = allItems()
    .filter(i => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return !!match && visible(match, user);
}

export const isActive = (item, pathname) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

export const hrefOf = (key) => allItems().find(i => i.key === key)?.href || HOME_HREF;
