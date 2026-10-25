import { ClipboardList, Search, type LucideIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/shared/page';

interface AreaConfig {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
  phase: number;
}

/** Áreas cuya funcionalidad llega en fases posteriores. Muestran qué contendrán, sin simular datos. */
function createAreaPage(config: AreaConfig) {
  return function AreaPage() {
    return (
      <>
        <PageHeader title={config.title} description={config.description} />
        <EmptyState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyText}
          phase={config.phase}
        />
      </>
    );
  };
}

export const EntrevistasPage = createAreaPage({
  title: 'Entrevistas',
  description:
    'Coordinación de solicitudes con la presidencia, sin registrar contenido confidencial.',
  icon: ClipboardList,
  emptyTitle: 'Sin solicitudes de entrevista',
  emptyText:
    'Registrarás solicitudes, verás la disponibilidad de cada líder y evitarás citas simultáneas.',
  phase: 3,
});

export const HistorialPage = createAreaPage({
  title: 'Historial y búsqueda',
  description: 'Reuniones, notas, decisiones y asignaciones, con acceso al registro original.',
  icon: Search,
  emptyTitle: 'Nada que buscar todavía',
  emptyText: 'Cuando haya registros podrás buscarlos por fecha, tipo, organización o responsable.',
  phase: 2,
});
