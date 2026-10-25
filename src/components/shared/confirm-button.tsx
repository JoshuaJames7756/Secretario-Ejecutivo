import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Botón para acciones destructivas: el primer toque pide confirmación en el mismo lugar
 * (sin ventanas emergentes) y se cancela solo a los 6 segundos.
 */
export function ConfirmButton({
  children,
  confirmLabel = 'Confirmar',
  onConfirm,
  size = 'sm',
  ariaLabel,
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  size?: 'sm' | 'default';
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button variant="ghost" size={size} aria-label={ariaLabel} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span role="group" aria-label="Confirmar acción" className="inline-flex items-center gap-1">
      <Button
        variant="outline"
        size={size}
        className="border-danger text-danger"
        onClick={async () => {
          setArmed(false);
          await onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArmed(false)}>
        Cancelar
      </Button>
    </span>
  );
}
