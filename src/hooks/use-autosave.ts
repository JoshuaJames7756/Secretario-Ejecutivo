import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Guardado automático de un texto (notas de la reunión).
 *
 *  - Guarda poco después de que la persona deja de escribir, no en cada tecla.
 *  - Los guardados se encolan: nunca hay dos al mismo tiempo ni se pierde el texto más reciente.
 *  - Si falla, el texto SIGUE en pantalla, el estado pasa a "error" y se puede reintentar.
 *  - Guarda de inmediato al salir de la pantalla, ocultar la pestaña o cerrar la página.
 *  - Mientras haya cambios sin guardar, el navegador pide confirmación antes de cerrar la página.
 *
 * El valor inicial solo se lee al montar: para cambiar de registro, usa `key` en el componente.
 */
export function useAutosave(
  initial: string,
  onSave: (value: string) => Promise<unknown>,
  delay = 700,
) {
  const [value, setValueState] = useState(initial);
  const [state, setState] = useState<SaveState>('saved');
  const latest = useRef(initial);
  const lastSaved = useRef(initial);
  const inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  });

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (latest.current === lastSaved.current) {
      if (inFlight.current === 0) setState('saved');
      return chain.current;
    }
    const next = latest.current;
    inFlight.current += 1;
    setState('saving');
    chain.current = chain.current.then(async () => {
      try {
        if (next !== lastSaved.current) {
          await saveRef.current(next);
          lastSaved.current = next;
        }
        inFlight.current -= 1;
        setState(latest.current === lastSaved.current ? 'saved' : 'pending');
      } catch {
        inFlight.current -= 1;
        setState('error');
      }
    });
    return chain.current;
  }, []);

  const setValue = useCallback(
    (next: string) => {
      latest.current = next;
      setValueState(next);
      setState('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  // Guardar al ocultar la pestaña, cerrar la página o salir de la pantalla.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  // Avisar antes de cerrar la página si hay cambios que aún no están a salvo.
  useEffect(() => {
    if (state === 'saved') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  return { value, setValue, state, flush };
}
