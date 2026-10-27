import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { getControllerState, getPublishableKey, setAuthBridge } from './controller';

const ClerkBridge = lazy(() => import('./clerk-bridge'));

/** Si Clerk falla al cargar, la aplicación sigue normal: solo se pierde la sincronización. */
class Isolate extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    setAuthBridge(null);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Monta el puente con Clerk solo si hay clave configurada. Si se abrió sin conexión y Clerk no
 * pudo cargar, al volver la red se intenta de nuevo sin recargar la página.
 */
export function SyncRoot() {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onOnline = () => {
      if (getControllerState().auth === 'desconocida') setAttempt((n) => n + 1);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  if (!getPublishableKey()) return null;
  return (
    <Isolate key={attempt}>
      <Suspense fallback={null}>
        <ClerkBridge />
      </Suspense>
    </Isolate>
  );
}
