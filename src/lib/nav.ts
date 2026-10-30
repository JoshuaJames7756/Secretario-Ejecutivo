import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  House,
  ListChecks,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** Nombre corto para la navegación inferior del teléfono. */
  shortLabel: string;
  icon: LucideIcon;
  /** Aparece directamente en la barra inferior; el resto queda bajo "Más". */
  primaryOnMobile: boolean;
  /** Sección de la barra lateral: lo diario arriba, la consulta y el sistema debajo. */
  group: 'diario' | 'consulta' | 'sistema';
}

export const NAV_GROUP_LABEL: Record<NavItem['group'], string> = {
  diario: 'Cada semana',
  consulta: 'Consulta',
  sistema: 'Sistema',
};

/**
 * Las 8 áreas de la especificación. Las entrevistas son la prioridad diaria, así que van
 * primero después de Inicio y tienen su lugar en la barra inferior del teléfono.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Inicio',
    shortLabel: 'Inicio',
    icon: House,
    primaryOnMobile: true,
    group: 'diario',
  },
  {
    to: '/entrevistas',
    label: 'Entrevistas',
    shortLabel: 'Entrevistas',
    icon: ClipboardList,
    primaryOnMobile: true,
    group: 'diario',
  },
  {
    to: '/reuniones',
    label: 'Reuniones',
    shortLabel: 'Reuniones',
    icon: Users,
    primaryOnMobile: true,
    group: 'diario',
  },
  {
    to: '/seguimientos',
    label: 'Seguimientos',
    shortLabel: 'Pendientes',
    icon: ListChecks,
    primaryOnMobile: true,
    group: 'diario',
  },
  {
    to: '/calendario',
    label: 'Calendario',
    shortLabel: 'Calendario',
    icon: CalendarDays,
    primaryOnMobile: false,
    group: 'diario',
  },
  {
    to: '/plantillas',
    label: 'Plantillas y Manual',
    shortLabel: 'Plantillas',
    icon: BookOpen,
    primaryOnMobile: false,
    group: 'consulta',
  },
  {
    to: '/historial',
    label: 'Historial y búsqueda',
    shortLabel: 'Historial',
    icon: Search,
    primaryOnMobile: false,
    group: 'consulta',
  },
  {
    to: '/configuracion',
    label: 'Configuración y respaldos',
    shortLabel: 'Ajustes',
    icon: Settings,
    primaryOnMobile: false,
    group: 'sistema',
  },
];

export const MOBILE_PRIMARY = NAV_ITEMS.filter((item) => item.primaryOnMobile);
export const MOBILE_MORE = NAV_ITEMS.filter((item) => !item.primaryOnMobile);
export const MORE_ROUTE = '/mas';
