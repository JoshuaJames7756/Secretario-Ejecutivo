import type {
  AgendaItem,
  FollowUp,
  MeetingOccurrence,
  MeetingRecord,
  RecordType,
} from '@/db/types';
import { GENERAL_NOTE_ID_PREFIX } from '@/features/meetings/service';

export type SectionKey =
  | 'participantes'
  | 'agenda'
  | 'decisiones'
  | 'asignaciones'
  | 'pendientes'
  | 'propuestas'
  | 'informativas'
  | 'notas'
  | 'resumen';

export const SECTION_LABEL: Record<SectionKey, string> = {
  resumen: 'Resumen final',
  participantes: 'Participantes',
  agenda: 'Puntos de agenda',
  decisiones: 'Decisiones confirmadas',
  asignaciones: 'Asignaciones',
  pendientes: 'Asuntos pendientes',
  propuestas: 'Propuestas',
  informativas: 'Notas informativas',
  notas: 'Notas por punto y nota general',
};

export const SECTION_ORDER: SectionKey[] = [
  'resumen',
  'participantes',
  'agenda',
  'decisiones',
  'asignaciones',
  'pendientes',
  'propuestas',
  'informativas',
  'notas',
];

export interface ReportOptions {
  sections: SectionKey[];
  /** Las notas y registros privados quedan fuera salvo que se pida expresamente. */
  includePrivate: boolean;
  /** Ids de puntos de agenda a incluir. Vacío o ausente = todos. */
  agendaItemIds?: string[];
  style: 'whatsapp' | 'texto';
}

export interface ReportData {
  meeting: MeetingOccurrence;
  agenda: AgendaItem[];
  records: MeetingRecord[];
  followUps: FollowUp[];
}

export interface Report {
  text: string;
  /** Cuántos registros privados se dejaron fuera. */
  excludedPrivate: number;
}

const dateFmt = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const SECTION_TYPE: Partial<Record<SectionKey, RecordType>> = {
  decisiones: 'decision',
  asignaciones: 'asignacion',
  pendientes: 'pendiente',
  propuestas: 'propuesta',
  informativas: 'informativa',
};

export function buildReport(data: ReportData, options: ReportOptions): Report {
  const bold = (t: string) => (options.style === 'whatsapp' ? `*${t}*` : t.toUpperCase());
  const bullet = options.style === 'whatsapp' ? '•' : '-';
  const chosen = new Set(options.sections);
  const followByRecord = new Map(
    data.followUps.filter((f) => f.originRecordId).map((f) => [f.originRecordId!, f]),
  );
  const items = data.agenda.filter(
    (a) => !options.agendaItemIds?.length || options.agendaItemIds.includes(a.id),
  );
  const itemIds = new Set(items.map((a) => a.id));
  let excludedPrivate = 0;

  const visible = (r: MeetingRecord): boolean => {
    if (r.isPrivate && !options.includePrivate) {
      excludedPrivate += 1;
      return false;
    }
    return true;
  };

  // Un registro ligado a un punto no elegido queda fuera; los generales (sin punto) se mantienen.
  const inScope = (r: MeetingRecord) => !r.agendaItemId || itemIds.has(r.agendaItemId);

  const lines: string[] = [
    bold(data.meeting.title),
    dateFmt.format(new Date(data.meeting.startsAt)),
  ];
  if (data.meeting.place) lines.push(`Lugar: ${data.meeting.place}`);

  const block = (title: string, body: string[]) => {
    if (body.length === 0) return;
    lines.push('', bold(title), ...body);
  };

  if (chosen.has('resumen') && data.meeting.summary?.trim()) {
    block(SECTION_LABEL.resumen, [data.meeting.summary.trim()]);
  }
  if (chosen.has('participantes') && data.meeting.participants.length > 0) {
    block(SECTION_LABEL.participantes, [data.meeting.participants.join(', ')]);
  }
  if (chosen.has('agenda') && items.length > 0) {
    block(
      SECTION_LABEL.agenda,
      items.map((a, i) => `${i + 1}. ${a.title}`),
    );
  }

  for (const key of SECTION_ORDER) {
    const type = SECTION_TYPE[key];
    if (!type || !chosen.has(key)) continue;
    const rows = data.records.filter((r) => r.type === type && inScope(r)).filter(visible);
    block(
      SECTION_LABEL[key],
      rows.map((r) => {
        const follow = followByRecord.get(r.id);
        const extra = [
          follow?.assignee ? `Responsable: ${follow.assignee}` : '',
          follow?.dueDate ? `Fecha límite: ${follow.dueDate}` : '',
        ].filter(Boolean);
        return `${bullet} ${r.content.trim()}${extra.length ? ` (${extra.join('; ')})` : ''}`;
      }),
    );
  }

  if (chosen.has('notas')) {
    const body: string[] = [];
    for (const [i, a] of items.entries()) {
      if (a.notes?.trim()) body.push(`${i + 1}. ${a.title}: ${a.notes.trim()}`);
    }
    const general = data.records.find((r) => r.id.startsWith(GENERAL_NOTE_ID_PREFIX));
    if (general && general.content.trim() && visible(general)) {
      body.push(`Nota general: ${general.content.trim()}`);
    }
    block(SECTION_LABEL.notas, body);
  }

  return { text: lines.join('\n'), excludedPrivate };
}
