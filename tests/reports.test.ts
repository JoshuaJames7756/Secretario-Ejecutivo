import { describe, expect, it } from 'vitest';
import type { AgendaItem, FollowUp, MeetingOccurrence, MeetingRecord } from '../src/db/types';
import { buildReport, type ReportOptions } from '../src/features/reports/build';

const base = { createdAt: 0, updatedAt: 0, rev: 1 };
const meeting = {
  ...base,
  id: 'm1',
  title: 'Consejo de estaca',
  startsAt: new Date(2026, 9, 24, 19, 0).getTime(),
  durationMin: 60,
  participants: ['Presidente', 'Secretario'],
  place: 'Capilla',
  status: 'cerrada',
  summary: 'Reunión productiva.',
} as MeetingOccurrence;
const agenda = [
  {
    ...base,
    id: 'a1',
    meetingId: 'm1',
    title: 'Oración',
    order: 0,
    prep: 'pendiente',
    notes: 'Se dio',
  },
  { ...base, id: 'a2', meetingId: 'm1', title: 'Presupuesto', order: 1, prep: 'pendiente' },
] as AgendaItem[];
const rec = (
  id: string,
  type: MeetingRecord['type'],
  content: string,
  extra: Partial<MeetingRecord> = {},
) => ({ ...base, id, meetingId: 'm1', type, content, isPrivate: false, ...extra }) as MeetingRecord;
const records = [
  rec('r1', 'decision', 'Se aprueba el cambio'),
  rec('r2', 'asignacion', 'Preparar informe'),
  rec('r3', 'decision', 'Decisión sensible', { isPrivate: true }),
  rec('nota-general:m1', 'nota', 'Nota general reservada', { isPrivate: true }),
  rec('r4', 'propuesta', 'Cambiar horario', { agendaItemId: 'a2' }),
];
const followUps = [
  {
    ...base,
    id: 'f1',
    title: 'x',
    kind: 'asignacion',
    status: 'aprobado_asignado',
    originRecordId: 'r2',
    assignee: 'Ana',
    dueDate: '2026-11-01',
  },
] as FollowUp[];
const data = { meeting, agenda, records, followUps };
const all: ReportOptions = {
  sections: [
    'resumen',
    'participantes',
    'agenda',
    'decisiones',
    'asignaciones',
    'propuestas',
    'notas',
  ],
  includePrivate: false,
  style: 'whatsapp',
};

describe('informes', () => {
  it('excluye lo privado por defecto y dice cuánto dejó fuera', () => {
    const { text, excludedPrivate } = buildReport(data, all);
    expect(text).not.toContain('Decisión sensible');
    expect(text).not.toContain('Nota general reservada');
    expect(excludedPrivate).toBe(2);
    expect(text).toContain('Se aprueba el cambio');
  });

  it('incluye lo privado solo cuando se pide expresamente', () => {
    const { text, excludedPrivate } = buildReport(data, { ...all, includePrivate: true });
    expect(text).toContain('Decisión sensible');
    expect(text).toContain('Nota general reservada');
    expect(excludedPrivate).toBe(0);
  });

  it('solo contiene las secciones elegidas', () => {
    const { text } = buildReport(data, { ...all, sections: ['decisiones'] });
    expect(text).toContain('*Decisiones confirmadas*');
    expect(text).not.toContain('Participantes');
    expect(text).not.toContain('Preparar informe');
    expect(text).not.toContain('Oración');
  });

  it('añade responsable y fecha límite a las asignaciones', () => {
    const { text } = buildReport(data, { ...all, sections: ['asignaciones'] });
    expect(text).toContain('Preparar informe (Responsable: Ana; Fecha límite: 2026-11-01)');
  });

  it('respeta los puntos de agenda elegidos y los registros ligados a otros puntos', () => {
    const { text } = buildReport(data, { ...all, agendaItemIds: ['a1'] });
    expect(text).toContain('1. Oración');
    expect(text).not.toContain('Presupuesto');
    expect(text).not.toContain('Cambiar horario'); // ligado al punto a2, no elegido
    expect(text).toContain('Se aprueba el cambio'); // general: se mantiene
  });

  it('el estilo texto no usa marcas de WhatsApp', () => {
    const { text } = buildReport(data, { ...all, style: 'texto' });
    expect(text).not.toContain('*');
    expect(text).toContain('DECISIONES CONFIRMADAS');
  });
});
