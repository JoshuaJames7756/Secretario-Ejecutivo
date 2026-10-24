import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/shared/page';
import { MOBILE_MORE } from '@/lib/nav';

/** Destinos que no caben en la barra inferior del teléfono. */
export default function MasPage() {
  return (
    <>
      <PageHeader title="Más" />
      <ul className="overflow-hidden rounded-card border border-border bg-surface">
        {MOBILE_MORE.map(({ to, label, icon: Icon }) => (
          <li key={to} className="border-b border-border last:border-b-0">
            <Link
              to={to}
              className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-surface-2"
            >
              <Icon className="size-5 text-muted" aria-hidden />
              <span className="flex-1 font-medium">{label}</span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
