import { CalendarCheck2 } from 'lucide-react';
import { NavLink } from 'react-router';
import { NAV_ITEMS } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { SyncBadge } from './sync-badge';

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface px-3 py-5 md:flex">
      <div className="mb-6 flex items-center gap-3 px-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-fg">
          <CalendarCheck2 className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold">Secretaría</p>
          <p className="text-xs text-muted">Estaca</p>
        </div>
      </div>

      <nav aria-label="Principal" className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-soft text-primary-soft-fg'
                      : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="px-3">
        <SyncBadge />
      </div>
    </aside>
  );
}
