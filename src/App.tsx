import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster, toast } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { seedCatalog } from '@/features/templates/service';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/actions';
import { requestPersistence } from '@/lib/storage';
import { HistorialPage } from '@/pages/areas';
import CalendarioPage from '@/pages/calendario';
import ConfiguracionPage from '@/pages/configuracion';
import InicioPage from '@/pages/inicio';
import EntrevistaDetallePage from '@/pages/entrevista-detalle';
import EntrevistaNuevaPage from '@/pages/entrevista-nueva';
import EntrevistasConfiguracionPage from '@/pages/entrevistas-configuracion';
import EntrevistasPage from '@/pages/entrevistas';
import MasPage from '@/pages/mas';
import ModoReunionPage from '@/pages/modo-reunion';
import ReunionDetallePage from '@/pages/reunion-detalle';
import ReunionNuevaPage from '@/pages/reunion-nueva';
import ReunionesPage from '@/pages/reuniones';
import SeguimientosPage from '@/pages/seguimientos';
import PlantillaDetallePage from '@/pages/plantilla-detalle';
import PlantillaEditarPage from '@/pages/plantilla-editar';
import PlantillasPage from '@/pages/plantillas';

export default function App() {
  const { isDark } = useTheme();

  // Chrome en Android concede la protección de almacenamiento sin mostrar un aviso cuando
  // corresponde (app instalada o uso frecuente). Se intenta en silencio al abrir.
  useEffect(() => {
    void requestPersistence();
    // Carga el catálogo de plantillas la primera vez. Nunca sobrescribe lo que ya existe.
    seedCatalog().catch((error: unknown) => toast.error(describeError(error)));
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
              <Route path="reuniones/nueva" element={<ReunionNuevaPage />} />
              <Route path="reuniones/:id" element={<ReunionDetallePage />} />
              <Route path="reuniones/:id/modo-reunion" element={<ModoReunionPage />} />
              <Route path="entrevistas" element={<EntrevistasPage />} />
              <Route path="entrevistas/nueva" element={<EntrevistaNuevaPage />} />
              <Route path="entrevistas/configuracion" element={<EntrevistasConfiguracionPage />} />
              <Route path="entrevistas/:id" element={<EntrevistaDetallePage />} />
              <Route path="seguimientos" element={<SeguimientosPage />} />
              <Route path="plantillas" element={<PlantillasPage />} />
              <Route path="plantillas/:id" element={<PlantillaDetallePage />} />
              <Route path="plantillas/:id/editar" element={<PlantillaEditarPage />} />
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
