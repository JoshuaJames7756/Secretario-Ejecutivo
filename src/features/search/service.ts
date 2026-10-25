import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { FOLLOW_UP_KIND_LABEL } from '@/features/followups/model';
import { RECORD_TYPE_LABEL } from '@/features/meetings/labels';

export type ResultKind =
  'reunion' | 'punto' | 'registro' | 'seguimiento' | 'entrevista' | 'plantilla';

export const RESULT_KIND_LABEL: Record<ResultKind, string> = {
  reunion: 'Reuniones',
  punto: 'Puntos de agenda',
  registro: 'Decisiones, notas y asignaciones',
  seguimiento: 'Seguimientos',
  entrevista: 'Entrevistas',
  plantilla: 'Plantillas',
};

export interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  /** Fragmento donde aparece lo buscado. */
  snippet?: string;
  /** Etiqueta secundaria: tipo de registro, reunión de origen... */
  context?: string;
  isPrivate?: boolean;
  to: string;
  /** Fecha relevante (ms) para ordenar y filtrar. */
  at?: number;
}

/** Minúsculas y sin tildes, carácter por carácter para conservar las posiciones. */
export function normalize(text: string): string {
  return Array.from(text)
    .map((ch) => ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())
    .join('');
}

function snippet(text: string | undefined, needle: string): string | undefined {
  if (!text) return undefined;
  const at = normalize(text).indexOf(needle);
  if (at < 0) return undefined;
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + needle.length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

function matches(needle: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((f) => f !== undefined && normalize(f).includes(needle));
}

export interface SearchOptions {
  kinds?: ResultKind[];
  /** Solo resultados con fecha dentro de este rango (ms). */
  from?: number;
  to?: number;
}

export const MIN_QUERY_LENGTH = 2;

/** Búsqueda local sin tildes ni mayúsculas. Cada resultado abre el registro original. */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const needle = normalize(query.trim());
  if (needle.length < MIN_QUERY_LENGTH) return [];
  const wants = (k: ResultKind) =>
    !options.kinds || options.kinds.length === 0 || options.kinds.includes(k);

  const [meetings, items, records, followUps, requests, templates] = await Promise.all([
    db.meetings.filter(isActive).toArray(),
    db.agendaItems.filter(isActive).toArray(),
    db.records.filter(isActive).toArray(),
    db.followUps.filter(isActive).toArray(),
    db.interviewRequests.filter(isActive).toArray(),
    db.templates.filter(isActive).toArray(),
  ]);
  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const out: SearchResult[] = [];

  if (wants('reunion')) {
    for (const m of meetings) {
      if (matches(needle, m.title, m.place, m.summary, m.participants.join(' '))) {
        out.push({
          kind: 'reunion',
          id: m.id,
          title: m.title,
          snippet: snippet(m.summary, needle),
          to: `/reuniones/${m.id}`,
          at: m.startsAt,
        });
      }
    }
  }
  if (wants('punto')) {
    for (const i of items) {
      if (!matches(needle, i.title, i.description, i.notes)) continue;
      const meeting = meetingById.get(i.meetingId);
      out.push({
        kind: 'punto',
        id: i.id,
        title: i.title,
        snippet: snippet(i.notes, needle) ?? snippet(i.description, needle),
        context: meeting?.title,
        to: `/reuniones/${i.meetingId}`,
        at: meeting?.startsAt,
      });
    }
  }
  if (wants('registro')) {
    for (const r of records) {
      if (!matches(needle, r.content)) continue;
      const meeting = meetingById.get(r.meetingId);
      out.push({
        kind: 'registro',
        id: r.id,
        title: RECORD_TYPE_LABEL[r.type],
        snippet: snippet(r.content, needle),
        context: meeting?.title,
        isPrivate: r.isPrivate,
        to: `/reuniones/${r.meetingId}`,
        at: meeting?.startsAt ?? r.createdAt,
      });
    }
  }
  if (wants('seguimiento')) {
    for (const f of followUps) {
      if (!matches(needle, f.title, f.description, f.assignee)) continue;
      out.push({
        kind: 'seguimiento',
        id: f.id,
        title: f.title,
        snippet:
          f.assignee && matches(needle, f.assignee)
            ? `Responsable: ${f.assignee}`
            : snippet(f.description, needle),
        context: FOLLOW_UP_KIND_LABEL[f.kind],
        to: '/seguimientos',
        at: f.createdAt,
      });
    }
  }
  if (wants('entrevista')) {
    for (const q of requests) {
      if (!matches(needle, q.personName, q.requestedBy, q.notes)) continue;
      out.push({
        kind: 'entrevista',
        id: q.id,
        title: q.personName,
        snippet: snippet(q.notes, needle),
        to: `/entrevistas/${q.id}`,
        at: q.receivedAt,
      });
    }
  }
  if (wants('plantilla')) {
    for (const t of templates) {
      if (matches(needle, t.name, t.description)) {
        out.push({
          kind: 'plantilla',
          id: t.id,
          title: t.name,
          snippet: snippet(t.description, needle),
          to: `/plantillas/${t.id}`,
        });
      }
    }
  }

  return out
    .filter((r) => {
      if (options.from === undefined && options.to === undefined) return true;
      if (r.at === undefined) return false;
      return (
        (options.from === undefined || r.at >= options.from) &&
        (options.to === undefined || r.at <= options.to)
      );
    })
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
