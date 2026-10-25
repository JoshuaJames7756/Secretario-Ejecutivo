import type { AgendaPointTemplate, BaseEntity, MeetingTemplate } from '@/db/types';

/**
 * Catálogo inicial. Se carga una sola vez y NUNCA se vuelve a sobrescribir: lo que la persona
 * edite, archive o marque como verificado se conserva.
 *
 * Fuente de los datos oficiales: Manual General, capítulos 29 y 6 (versión vigente en español).
 * Se extrajeron con una herramienta que resume las páginas, por eso NINGUNA entrada tiene
 * `lastReviewedAt`: la interfaz las muestra como "referencia por verificar" hasta que la persona
 * compare con el texto vivo y las marque como revisadas.
 *
 * Reglas del catálogo (especificación, 5.2 y 5.4):
 *  - No se inventan frecuencias oficiales. Si el Manual no indica una, queda vacía.
 *  - "Si es posible" y "según resulte necesario" se guardan como frecuencia SUGERIDA.
 *  - Los puntos de agenda y la lista de preparación son sugerencias de la aplicación, no
 *    indicaciones del Manual, y la interfaz lo dice.
 */

export const CATALOG_VERSION = 1;

export const MANUAL_CH29_URL =
  'https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=spa';
export const MANUAL_CH6_URL =
  'https://www.churchofjesuschrist.org/study/manual/general-handbook/6-stake-leadership?lang=spa';

type CatalogEntry = Omit<MeetingTemplate, keyof BaseEntity> & { id: string };

const WORKING_AGENDA: AgendaPointTemplate[] = [
  {
    title: 'Revisión de asuntos pendientes',
    description: 'Asuntos y asignaciones abiertos de reuniones anteriores.',
  },
  { title: 'Asuntos nuevos' },
  { title: 'Asignaciones y responsables' },
  { title: 'Resumen de acuerdos' },
];

const WORKING_CHECKLIST = [
  'Confirmar fecha, hora y lugar',
  'Confirmar participantes',
  'Revisar asuntos pendientes',
  'Preparar los documentos necesarios',
];

const EVENT_CHECKLIST = [
  'Confirmar fecha, hora y lugar',
  'Confirmar a quienes dirigen y participan',
  'Preparar y distribuir la información necesaria',
];

const official = (
  entry: Omit<CatalogEntry, 'origin' | 'status' | 'manualUrl' | 'frequencyBasis'> & {
    manualUrl?: string;
    frequencyBasis?: string;
  },
): CatalogEntry => ({
  manualUrl: MANUAL_CH29_URL,
  frequencyBasis: entry.suggestedFrequency ? `Manual General ${entry.manualRef}` : undefined,
  ...entry,
  origin: 'oficial',
  status: 'activo',
});

export const CATALOG: CatalogEntry[] = [
  official({
    id: 'oficial:presidencia-estaca',
    name: 'Reunión de la presidencia de estaca',
    category: 'Presidencia y consejos',
    description: 'Deliberar y decidir sobre asuntos de la estaca.',
    manualRef: '29.3.5',
    suggestedParticipants: [
      'Presidente de estaca',
      'Primer consejero',
      'Segundo consejero',
      'Secretario de estaca',
      'Secretario ejecutivo de estaca',
    ],
    leader: 'Presidente de estaca',
    suggestedFrequency: 'Con regularidad (por lo general, cada semana)',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:sumo-consejo',
    name: 'Reunión del sumo consejo',
    category: 'Presidencia y consejos',
    description: 'Deliberar en consejo sobre la obra de salvación y exaltación en la estaca.',
    manualRef: '29.3.6',
    suggestedParticipants: [
      'Presidencia de estaca',
      'Sumo consejo',
      'Secretario de estaca',
      'Secretario ejecutivo de estaca',
    ],
    leader: 'Presidencia de estaca',
    suggestedFrequency: 'Dos veces al mes, si es posible',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:consejo-estaca',
    name: 'Reunión del consejo de estaca',
    category: 'Presidencia y consejos',
    description:
      'Deliberar sobre cómo fortalecer a las personas y las familias, las necesidades temporales y otros asuntos de la estaca.',
    manualRef: '29.3.7',
    suggestedParticipants: [
      'Presidencia de estaca',
      'Sumo consejo',
      'Secretario de estaca',
      'Secretario ejecutivo de estaca',
      'Presidenta de la Sociedad de Socorro de estaca',
      'Presidenta de las Mujeres Jóvenes de estaca',
      'Presidenta de la Primaria de estaca',
      'Presidente de los Hombres Jóvenes de estaca',
      'Presidente de la Escuela Dominical de estaca',
    ],
    leader: 'Presidente de estaca',
    suggestedFrequency: 'Cada mes, si es posible',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:consejo-obispos',
    name: 'Reunión del consejo de obispos de estaca',
    category: 'Presidencia y consejos',
    description: 'Compartir experiencias, tratar inquietudes e instruir a los obispos.',
    manualRef: '29.3.10',
    suggestedParticipants: [
      'Presidente de estaca',
      'Obispos',
      'Presidentes de rama',
      'Secretario de estaca',
    ],
    leader: 'Presidente de estaca',
    suggestedFrequency: 'Por lo menos trimestralmente',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:cuorum-sumos-sacerdotes',
    name: 'Cuórum de sumos sacerdotes de estaca',
    category: 'Presidencia y consejos',
    description: 'El Manual lo describe, pero no indica una frecuencia de reunión.',
    manualRef: '6.2.1.1',
    manualUrl: MANUAL_CH6_URL,
    suggestedParticipants: [
      'Obispos y consejeros',
      'Sumo consejo',
      'Patriarcas en servicio activo',
    ],
    leader: 'Presidente de estaca',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:conferencia-estaca',
    name: 'Conferencia de estaca',
    category: 'Conferencias y reuniones generales',
    description: 'Fortalecer la fe de los miembros en Jesucristo.',
    manualRef: '29.3.1',
    suggestedParticipants: ['Miembros de la estaca'],
    leader: 'Presidente de estaca o líder asignado',
    suggestedFrequency: 'Dos veces al año',
    agendaPoints: [],
    checklist: EVENT_CHECKLIST,
  }),
  official({
    id: 'oficial:reunion-general-sacerdocio',
    name: 'Reunión general del sacerdocio de estaca',
    category: 'Conferencias y reuniones generales',
    description: 'Instruir e inspirar a los poseedores del sacerdocio en sus deberes.',
    manualRef: '29.3.2',
    suggestedParticipants: ['Poseedores del sacerdocio de la estaca'],
    leader: 'Presidencia de estaca',
    suggestedFrequency: 'Una vez al año',
    agendaPoints: [],
    checklist: EVENT_CHECKLIST,
  }),
  official({
    id: 'oficial:lideres-sacerdocio',
    name: 'Reunión de los líderes del sacerdocio de estaca',
    category: 'Conferencias y reuniones generales',
    description:
      'Enseñar deberes, mejorar habilidades y fortalecer la fe de los líderes del sacerdocio.',
    manualRef: '29.3.3',
    suggestedParticipants: [
      'Presidencia de estaca',
      'Sumo consejo',
      'Secretarios y secretarios ejecutivos',
      'Presidencia de los Hombres Jóvenes',
      'Obispados',
      'Presidencias y secretarios de cuórumes de élderes',
      'Asesores de cuórumes aarónicos',
    ],
    leader: 'Presidencia de estaca',
    suggestedFrequency: 'Parte de una conferencia de estaca al año; puede programarse una segunda',
    agendaPoints: [],
    checklist: EVENT_CHECKLIST,
  }),
  official({
    id: 'oficial:lideres-estaca',
    name: 'Reunión de líderes de estaca',
    category: 'Organizaciones',
    description: 'Enseñar deberes, mejorar como líderes y fortalecer la fe; deliberar en consejo.',
    manualRef: '29.3.4',
    suggestedParticipants: [
      'Presidencias y secretarios de la Sociedad de Socorro',
      'Presidencias y secretarios de las Mujeres Jóvenes',
      'Presidencias y secretarios de la Primaria',
      'Presidencias y secretarios de la Escuela Dominical',
    ],
    leader: 'Presidencias de las organizaciones de estaca',
    suggestedFrequency: 'Una vez al año; puede autorizarse una segunda',
    agendaPoints: [],
    checklist: EVENT_CHECKLIST,
  }),
  official({
    id: 'oficial:comite-adultos',
    name: 'Comité de líderes de adultos de estaca',
    category: 'Comités',
    description:
      'Apoyar a los líderes de barrio en la obra de salvación y exaltación, y coordinar bienestar y autosuficiencia. El Manual marca esta reunión como adaptable a la realidad local.',
    manualRef: '29.3.8',
    suggestedParticipants: [
      'Presidencia de estaca',
      'Presidenta de la Sociedad de Socorro de estaca',
      'Miembros del sumo consejo asignados a cuórumes de élderes',
    ],
    leader: 'Presidencia de estaca',
    suggestedFrequency: 'Según resulte necesario',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:comite-jovenes',
    name: 'Comité de líderes de jóvenes de estaca',
    category: 'Comités',
    description: 'Fortalecer a los jóvenes y planificar proyectos de servicio y actividades.',
    manualRef: '29.3.9',
    suggestedParticipants: [
      'Un miembro de la presidencia de estaca',
      'Presidencia de los Hombres Jóvenes',
      'Presidencia de las Mujeres Jóvenes',
      'Jóvenes de cada barrio',
    ],
    leader: 'Un miembro de la presidencia de estaca',
    suggestedFrequency: 'Según resulte necesario',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  official({
    id: 'oficial:consejo-comunicaciones',
    name: 'Consejo de comunicaciones de estaca (opcional)',
    category: 'Otras reuniones',
    description: 'El Manual lo presenta como opcional y no indica una frecuencia.',
    manualRef: '6.2.1.7',
    manualUrl: MANUAL_CH6_URL,
    suggestedParticipants: ['Director de comunicaciones', 'Directores auxiliares y especialistas'],
    leader: 'Presidencia de estaca o consejero asignado',
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
  }),
  {
    id: 'local:templo-historia-familiar',
    name: 'Reunión de líderes de templo e historia familiar',
    category: 'Otras reuniones',
    description:
      'Plantilla local. No se encontró como reunión de estaca en los capítulos 6 y 29 del Manual; ajústala a la realidad de tu estaca.',
    suggestedParticipants: [],
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
    origin: 'local',
    status: 'activo',
  },
  {
    id: 'local:presidencia-organizacion',
    name: 'Reunión con una presidencia de organización de estaca',
    category: 'Organizaciones',
    description:
      'Plantilla local para reunirte con la presidencia de la Sociedad de Socorro, las Mujeres Jóvenes, la Primaria, la Escuela Dominical u otra. Su frecuencia es la que tú definas.',
    suggestedParticipants: [],
    agendaPoints: WORKING_AGENDA,
    checklist: WORKING_CHECKLIST,
    origin: 'local',
    status: 'activo',
  },
];

export const TEMPLATE_CATEGORY_ORDER = [
  'Presidencia y consejos',
  'Conferencias y reuniones generales',
  'Comités',
  'Organizaciones',
  'Otras reuniones',
];
