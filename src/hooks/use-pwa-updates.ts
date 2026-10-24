import { useEffect } from 'react';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registra el service worker. Una versión nueva nunca se aplica sola:
 * se avisa y la persona decide cuándo actualizar (evita cambiar la app en plena reunión).
 */
export function usePwaUpdates(): void {
  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        toast('Hay una versión nueva disponible', {
          description: 'Actualiza cuando no estés en una reunión.',
          duration: Infinity,
          action: { label: 'Actualizar', onClick: () => void update(true) },
        });
      },
      onOfflineReady() {
        toast.success('Lista para usar sin conexión');
      },
    });
  }, []);
}
