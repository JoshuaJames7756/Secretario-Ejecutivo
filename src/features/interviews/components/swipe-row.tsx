import { Check, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const THRESHOLD = 84;
const MAX = 120;

/**
 * Deslizar hacia la derecha para confirmar (o quitar la confirmación). Es un atajo: el botón
 * de siempre sigue disponible para quien no use gestos.
 */
export function SwipeRow({
  confirmed,
  onSwipe,
  children,
}: {
  confirmed: boolean;
  onSwipe: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);

  const reset = () => {
    start.current = null;
    axis.current = null;
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center gap-2 pl-5 text-sm font-semibold',
          confirmed ? 'bg-surface-2 text-muted' : 'bg-success-soft text-success',
        )}
      >
        {confirmed ? <X className="size-5" /> : <Check className="size-5" strokeWidth={3} />}
        {confirmed ? 'Quitar confirmación' : 'Confirmar'}
      </div>
      <div
        className={cn(
          'relative touch-pan-y',
          dx === 0 && 'transition-transform duration-200 motion-reduce:transition-none',
        )}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) start.current = { x: t.clientX, y: t.clientY };
          axis.current = null;
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (!t || !start.current) return;
          const mx = t.clientX - start.current.x;
          const my = t.clientY - start.current.y;
          if (!axis.current && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
            axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          }
          if (axis.current === 'x') setDx(Math.max(0, Math.min(MAX, mx)));
        }}
        onTouchEnd={() => {
          if (axis.current === 'x' && dx >= THRESHOLD) {
            if ('vibrate' in navigator) navigator.vibrate(15);
            onSwipe();
          }
          reset();
        }}
        onTouchCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
