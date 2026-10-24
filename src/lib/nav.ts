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
}

/** Las 8 áreas de la especificación (sección 3), en el orden indicado. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', shortLabel: 'Inicio', icon: House, primaryOnMobile: true },
  {
    to: '/calendario',
    label: 'Calendario',
    shortLabel: 'Calendario',
    icon: CalendarDays,
    primaryOnMobile: true,
  },
  {
    to: '/reuniones',
    label: 'Reuniones',
    shortLabel: 'Reuniones',
    icon: Users,
    primaryOnMobile: true,
  },
  {
    to: '/entrevistas',
    label: 'Entrevistas',
    shortLabel: 'Entrevistas',
    icon: ClipboardList,
    primaryOnMobile: false,
  },
  {
    to: '/seguimientos',
    label: 'Seguimientos',
    shortLabel: 'Pendientes',
    icon: ListChecks,
    primaryOnMobile: true,
  },
  {
    to: '/plantillas',
    label: 'Plantillas y Manual',
    shortLabel: 'Plantillas',
    icon: BookOpen,
    primaryOnMobile: false,
  },
  {
    to: '/historial',
    label: 'Historial y búsqueda',
    shortLabel: 'Historial',
    icon: Search,
    primaryOnMobile: false,
  },
  {
    to: '/configuracion',
    label: 'Configuración y respaldos',
    shortLabel: 'Ajustes',
    icon: Settings,
    primaryOnMobile: false,
  },
];

export const MOBILE_PRIMARY = NAV_ITEMS.filter((item) => item.primaryOnMobile);
export const MOBILE_MORE = NAV_ITEMS.filter((item) => !item.primaryOnMobile);
export const MORE_ROUTE = '/mas';
