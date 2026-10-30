import { CalendarCheck2, Plus } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { NAV_GROUP_LABEL, NAV_ITEMS, type NavItem } from '@/lib/nav';
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

      <Link
        to="/entrevistas/nueva"
        className={cn(buttonVariants({ size: 'lg' }), 'mx-1 mb-5 w-[calc(100%-0.5rem)]')}
      >
        <Plus className="size-5" aria-hidden />
        Nueva entrevista
      </Link>

      <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto">
        {(['diario', 'consulta', 'sistema'] as NavItem['group'][]).map((group) => (
          <div key={group}>
            <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">
              {NAV_GROUP_LABEL[group]}
            </p>
            <ul className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group).map(({ to, label, icon: Icon }) => (
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
          </div>
        ))}
      </nav>

      <div className="px-3">
        <SyncBadge />
      </div>
    </aside>
  );
}
