import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  ListChecks,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
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

export const CalendarioPage = createAreaPage({
  title: 'Calendario',
  description: 'Vistas anual, mensual, semanal y diaria, con reuniones únicas y recurrentes.',
  icon: CalendarDays,
  emptyTitle: 'Tu calendario aparecerá aquí',
  emptyText: 'Podrás programar reuniones, repetirlas y reprogramarlas conservando el historial.',
  phase: 2,
});

export const ReunionesPage = createAreaPage({
  title: 'Reuniones',
  description: 'Agenda, modo reunión, notas y acuerdos de cada reunión.',
  icon: Users,
  emptyTitle: 'Aún no hay reuniones',
  emptyText:
    'Cada reunión tendrá su propia agenda, notas, decisiones confirmadas y asignaciones, independientes de la plantilla.',
  phase: 2,
});

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

export const SeguimientosPage = createAreaPage({
  title: 'Seguimientos',
  description: 'Asuntos pendientes y asignaciones que se revisan en reuniones posteriores.',
  icon: ListChecks,
  emptyTitle: 'No hay asuntos por seguir',
  emptyText:
    'Las asignaciones y los asuntos pendientes que registres en una reunión se reunirán aquí.',
  phase: 2,
});

export const PlantillasPage = createAreaPage({
  title: 'Plantillas y Manual',
  description: 'Catálogo de reuniones basado en el Manual General y plantillas locales.',
  icon: BookOpen,
  emptyTitle: 'El catálogo todavía está vacío',
  emptyText:
    'Antes de publicarlo se verificarán las denominaciones y frecuencias en el Manual General vigente.',
  phase: 2,
});

export const HistorialPage = createAreaPage({
  title: 'Historial y búsqueda',
  description: 'Reuniones, notas, decisiones y asignaciones, con acceso al registro original.',
  icon: Search,
  emptyTitle: 'Nada que buscar todavía',
  emptyText: 'Cuando haya registros podrás buscarlos por fecha, tipo, organización o responsable.',
  phase: 2,
});
