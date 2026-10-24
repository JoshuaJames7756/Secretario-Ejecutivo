import { Ellipsis } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { MOBILE_MORE, MOBILE_PRIMARY, MORE_ROUTE } from '@/lib/nav';
import { cn } from '@/lib/utils';

const itemClass = (active: boolean) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors',
    active ? 'text-primary-soft-fg' : 'text-muted',
  );

export function BottomNav() {
  const { pathname } = useLocation();
  const moreActive =
    pathname === MORE_ROUTE || MOBILE_MORE.some((item) => pathname.startsWith(item.to));

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch px-1 pt-1">
        {MOBILE_PRIMARY.map(({ to, shortLabel, icon: Icon }) => (
          <li key={to} className="flex flex-1">
            <NavLink to={to} end={to === '/'} className={({ isActive }) => itemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-7 w-14 place-items-center rounded-full transition-colors',
                      isActive && 'bg-primary-soft',
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {shortLabel}
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="flex flex-1">
          <NavLink
            to={MORE_ROUTE}
            className={() => itemClass(moreActive)}
            aria-current={moreActive ? 'page' : undefined}
          >
            <span
              className={cn(
                'grid h-7 w-14 place-items-center rounded-full transition-colors',
                moreActive && 'bg-primary-soft',
              )}
            >
              <Ellipsis className="size-5" aria-hidden />
            </span>
            Más
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
