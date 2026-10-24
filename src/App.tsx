import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { useTheme } from '@/hooks/use-theme';
import { requestPersistence } from '@/lib/storage';
import {
  CalendarioPage,
  EntrevistasPage,
  HistorialPage,
  PlantillasPage,
  ReunionesPage,
  SeguimientosPage,
} from '@/pages/areas';
import ConfiguracionPage from '@/pages/configuracion';
import InicioPage from '@/pages/inicio';
import MasPage from '@/pages/mas';

export default function App() {
  const { isDark } = useTheme();

  // Chrome en Android concede la protección de almacenamiento sin mostrar un aviso cuando
  // corresponde (app instalada o uso frecuente). Se intenta en silencio al abrir.
  useEffect(() => {
    void requestPersistence();
  }, []);

  return (
    // reducedMotion="user": las animaciones se reducen si el sistema lo pide.
    // LazyMotion + `m`: carga solo las funciones de animación que se usan (paquete más ligero).
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<InicioPage />} />
              <Route path="calendario" element={<CalendarioPage />} />
              <Route path="reuniones" element={<ReunionesPage />} />
              <Route path="entrevistas" element={<EntrevistasPage />} />
              <Route path="seguimientos" element={<SeguimientosPage />} />
              <Route path="plantillas" element={<PlantillasPage />} />
              <Route path="historial" element={<HistorialPage />} />
              <Route path="configuracion" element={<ConfiguracionPage />} />
              <Route path="mas" element={<MasPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" theme={isDark ? 'dark' : 'light'} />
      </LazyMotion>
    </MotionConfig>
  );
}
