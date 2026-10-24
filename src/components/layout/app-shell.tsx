import * as m from 'motion/react-m';
import { Outlet, useLocation } from 'react-router';
import { usePwaUpdates } from '@/hooks/use-pwa-updates';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import { SyncBadge } from './sync-badge';

export function AppShell() {
  const { pathname } = useLocation();
  usePwaUpdates();

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        Saltar al contenido
      </a>

      <Sidebar />

      <div className="md:pl-64">
        {/* Barra superior solo en teléfono: el estado de guardado siempre a la vista. */}
        <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <span className="font-display text-base font-semibold">Secretaría</span>
          <SyncBadge />
        </div>

        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto max-w-5xl px-4 pt-5 pb-28 outline-none md:px-8 md:pt-10 md:pb-12"
        >
          <m.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </m.div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
