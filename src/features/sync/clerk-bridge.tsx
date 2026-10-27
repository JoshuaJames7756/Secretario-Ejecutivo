import { esES } from '@clerk/localizations';
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { useEffect } from 'react';
import { getPublishableKey, setAuthBridge, startAutoSync } from './controller';

/**
 * Único lugar que conoce Clerk. Se carga de forma diferida (React.lazy) para que la aplicación
 * arranque y funcione igual aunque Clerk no cargue (sin conexión o sin configurar).
 * No dibuja nada: solo informa al motor si hay sesión y cómo pedir el token.
 */
function Bridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  useEffect(() => {
    if (!isLoaded) {
      setAuthBridge(null);
      return;
    }
    setAuthBridge({
      isSignedIn: Boolean(isSignedIn),
      getToken: () => getToken(),
      openSignIn: () => clerk.openSignIn({}),
      signOut: () => clerk.signOut(),
      email,
    });
    return () => setAuthBridge(null);
  }, [isLoaded, isSignedIn, getToken, clerk, email]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    return startAutoSync();
  }, [isLoaded, isSignedIn]);

  return null;
}

export default function ClerkBridge() {
  return (
    <ClerkProvider publishableKey={getPublishableKey()} localization={esES}>
      <Bridge />
    </ClerkProvider>
  );
}
