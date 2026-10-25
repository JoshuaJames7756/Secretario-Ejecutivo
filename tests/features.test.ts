import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { restoreEntity, softDeleteEntity, updateEntity } from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';
import {
  INITIAL_STATUS,
  isOpenFollowUp,
  isOverdue,
  titleFromText,
  toDateString,
} from '../src/features/followups/model';
import {
  createFollowUp,
  setFollowUpStatus,
  ValidationError,
} from '../src/features/followups/service';
import {
  InvalidTransitionError,
  addAgendaItem,
  addRecord,
  agendaQuery,
  canTransition,
  changeMeetingStatus,
  createMeeting,
  moveAgendaItem,
  recordsQuery,
  removeAgendaItem,
  saveGeneralNote,
  setGeneralNotePrivacy,
} from '../src/features/meetings/service';
import { CATALOG } from '../src/features/templates/catalog';
import {
  OfficialTemplateError,
  createBlankTemplate,
  duplicateAsLocal,
  markReferenceReviewed,
  seedCatalog,
  updateTemplate,
} from '../src/features/templates/service';

const HOUR = 60 * 60 * 1000;
const PRESIDENCIA = 'oficial:presidencia-estaca';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  resetDeviceIdCache();
});

describe('catálogo de plantillas', () => {
  it('se carga una sola vez y no sobrescribe lo que la persona cambió', async () => {
    await seedCatalog();
    const total = await db.templates.count();
    expect(total).toBe(CATALOG.length);

    await db.templates.update(PRESIDENCIA, { name: 'Mi nombre propio' });
    await db.settings.delete('catalogVersion'); // fuerza una segunda carga
    await seedCatalog();

    expect(await db.templates.count()).toBe(total);
    expect((await db.templates.get(PRESIDENCIA))?.name).toBe('Mi nombre propio');
  });

  it('una plantilla eliminada no reaparece al volver a cargar el catálogo', async () => {
    await seedCatalog();
    await softDeleteEntity('templates', PRESIDENCIA);
    await db.settings.delete('catalogVersion');
    await seedCatalog();
    expect((await db.templates.get(PRESIDENCIA))?.deletedAt).toBeDefined();
  });

  it('ninguna entrada nace como verificada y todas las oficiales citan una sección del Manual', () => {
    for (const entry of CATALOG) {
      expect(entry).not.toHaveProperty('lastReviewedAt');
      if (entry.origin === 'oficial') expect(entry.manualRef).toMatch(/^\d+(\.\d+)+$/);
      else expect(entry.manualRef).toBeUndefined();
    }
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
  });

  it('las frecuencias coinciden con las verificadas en el Manual y no se inventan otras', () => {
    const verified: Record<string, string | undefined> = {
      'oficial:presidencia-estaca': 'Con regularidad (por lo general, cada semana)',
      'oficial:sumo-consejo': 'Dos veces al mes, si es posible',
      'oficial:consejo-estaca': 'Cada mes, si es posible',
      'oficial:consejo-obispos': 'Por lo menos trimestralmente',
      'oficial:conferencia-estaca': 'Dos veces al año',
      'oficial:reunion-general-sacerdocio': 'Una vez al año',
      'oficial:lideres-sacerdocio':
        'Parte de una conferencia de estaca al año; puede programarse una segunda',
      'oficial:lideres-estaca': 'Una vez al año; puede autorizarse una segunda',
      'oficial:comite-adultos': 'Según resulte necesario',
      'oficial:comite-jovenes': 'Según resulte necesario',
      // El Manual no indica frecuencia para estas:
      'oficial:cuorum-sumos-sacerdotes': undefined,
      'oficial:consejo-comunicaciones': undefined,
      // Plantillas locales: frecuencia la define la persona.
      'local:templo-historia-familiar': undefined,
      'local:presidencia-organizacion': undefined,
    };
    expect(CATALOG.map((e) => e.id).sort()).toEqual(Object.keys(verified).sort());
    for (const entry of CATALOG) expect(entry.suggestedFrequency).toBe(verified[entry.id]);
  });

  it('una plantilla oficial no se edita; se duplica como local sin heredar la referencia', async () => {
    await seedCatalog();
    const edit = {
      name: 'x',
      category: 'x',
      suggestedParticipants: [],
      agendaPoints: [],
      checklist: [],
    };
    await expect(updateTemplate(PRESIDENCIA, edit)).rejects.toBeInstanceOf(OfficialTemplateError);

    const copy = await duplicateAsLocal(PRESIDENCIA);
    expect(copy.origin).toBe('local');
    expect(copy.manualRef).toBeUndefined();
    expect(copy.manualUrl).toBeUndefined();
    expect(copy.frequencyBasis).toBe('Configuración local');
    expect(copy.id).not.toBe(PRESIDENCIA);

    const edited = await updateTemplate(copy.id, { ...edit, name: 'Mi presidencia' });
    expect(edited.name).toBe('Mi presidencia');
  });

  it('marcar la referencia como verificada guarda la fecha y solo aplica a oficiales', async () => {
    await seedCatalog();
    const reviewed = await markReferenceReviewed(PRESIDENCIA, 1_700_000_000_000);
    expect(reviewed.lastReviewedAt).toBe(1_700_000_000_000);

    const local = await createBlankTemplate('Mía');
    await expect(markReferenceReviewed(local.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('independencia entre plantilla, reunión y registro histórico', () => {
  async function meetingFromPresidencia() {
    await seedCatalog();
    return createMeeting({
      title: 'Presidencia del 27 de octubre',
      startsAt: Date.now() + 24 * HOUR,
      durationMin: 60,
      templateId: PRESIDENCIA,
    });
  }

  it('copia la estructura inicial: título, participantes y puntos de agenda', async () => {
    const meeting = await meetingFromPresidencia();
    const template = (await db.templates.get(PRESIDENCIA))!;
    const agenda = await agendaQuery(meeting.id);

    expect(meeting.templateId).toBe(PRESIDENCIA);
    expect(meeting.participants).toEqual(template.suggestedParticipants);
    expect(agenda.map((a) => a.title)).toEqual(template.agendaPoints.map((p) => p.title));
    expect(agenda.map((a) => a.order)).toEqual(agenda.map((_, i) => i));
  });

  it('CRITERIO DE ACEPTACIÓN: modificar, archivar o eliminar la plantilla no altera la reunión', async () => {
    const meeting = await meetingFromPresidencia();
    await saveGeneralNote(meeting.id, 'Acordamos revisar el presupuesto');
    const before = {
      meeting: await db.meetings.get(meeting.id),
      agenda: await agendaQuery(meeting.id),
      records: await recordsQuery(meeting.id),
    };

    // Se cambia la plantilla de todas las formas posibles.
    await db.templates.update(PRESIDENCIA, {
      name: 'Nombre completamente distinto',
      suggestedParticipants: ['Otra persona'],
      agendaPoints: [{ title: 'Punto nuevo' }],
    });
    await updateEntity('templates', PRESIDENCIA, { status: 'archivado' });
    await softDeleteEntity('templates', PRESIDENCIA);

    expect(await db.meetings.get(meeting.id)).toEqual(before.meeting);
    expect(await agendaQuery(meeting.id)).toEqual(before.agenda);
    expect(await recordsQuery(meeting.id)).toEqual(before.records);
  });

  it('cambiar la agenda de una reunión tampoco altera la plantilla', async () => {
    const meeting = await meetingFromPresidencia();
    const templateBefore = await db.templates.get(PRESIDENCIA);
    await addAgendaItem(meeting.id, { title: 'Punto solo de esta reunión' });
    const [first] = await agendaQuery(meeting.id);
    await removeAgendaItem(first!.id);
    expect(await db.templates.get(PRESIDENCIA)).toEqual(templateBefore);
  });

  it('la reunión y su agenda se guardan juntas o no se guarda nada', async () => {
    await seedCatalog();
    const meetingsBefore = await db.meetings.count();
    const opsBefore = await db.syncOps.count();
    await expect(
      createMeeting({ title: 'x', startsAt: Date.now(), durationMin: 60, templateId: 'no-existe' }),
    ).rejects.toThrow();
    expect(await db.meetings.count()).toBe(meetingsBefore);
    expect(await db.agendaItems.count()).toBe(0);
    expect(await db.syncOps.count()).toBe(opsBefore);
  });

  it('valida los datos antes de guardar', async () => {
    const base = { title: 'Reunión', startsAt: Date.now(), durationMin: 60 };
    await expect(createMeeting({ ...base, title: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createMeeting({ ...base, startsAt: Number.NaN })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(createMeeting({ ...base, durationMin: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.meetings.count()).toBe(0);
  });
});

describe('agenda', () => {
  it('agrega al final, reordena con vecinos y no pierde el orden al eliminar', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    const a = await addAgendaItem(meeting.id, { title: 'A' });
    const b = await addAgendaItem(meeting.id, { title: 'B' });
    const c = await addAgendaItem(meeting.id, { title: 'C' });

    expect((await agendaQuery(meeting.id)).map((i) => i.title)).toEqual(['A', 'B', 'C']);

    expect(await moveAgendaItem(meeting.id, c.id, -1)).toBe(true);
    expect((await agendaQuery(meeting.id)).map((i) => i.title)).toEqual(['A', 'C', 'B']);

    expect(await moveAgendaItem(meeting.id, a.id, -1)).toBe(false); // ya es el primero
    expect(await moveAgendaItem(meeting.id, b.id, 1)).toBe(false); // ya es el último

    await removeAgendaItem(c.id);
    const d = await addAgendaItem(meeting.id, { title: 'D' });
    expect((await agendaQuery(meeting.id)).map((i) => i.title)).toEqual(['A', 'B', 'D']);
    expect(d.order).toBeGreaterThan(c.order); // nunca choca con uno eliminado recuperable
  });

  it('un punto eliminado se puede recuperar en su posición original', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await addAgendaItem(meeting.id, { title: 'A' });
    const b = await addAgendaItem(meeting.id, { title: 'B' });
    await addAgendaItem(meeting.id, { title: 'C' });

    const deleted = await softDeleteEntity('agendaItems', b.id);
    expect((await agendaQuery(meeting.id)).map((i) => i.title)).toEqual(['A', 'C']);

    await restoreEntity('agendaItems', b.id, deleted.deletedAt! + 1000);
    expect((await agendaQuery(meeting.id)).map((i) => i.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('estados de la reunión', () => {
  it('permite el ciclo normal y reabrir, y rechaza saltos inválidos', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });

    await expect(changeMeetingStatus(meeting.id, 'cerrada')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect((await changeMeetingStatus(meeting.id, 'en_curso')).status).toBe('en_curso');
    const closed = await changeMeetingStatus(meeting.id, 'cerrada', { summary: '  Resumen  ' });
    expect(closed.status).toBe('cerrada');
    expect(closed.summary).toBe('Resumen');
    expect((await changeMeetingStatus(meeting.id, 'en_curso')).status).toBe('en_curso');
    expect(canTransition('cancelada', 'cerrada')).toBe(false);
  });

  it('cancelar una reunión no elimina sus notas, agenda ni asignaciones', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await addAgendaItem(meeting.id, { title: 'Punto' });
    await saveGeneralNote(meeting.id, 'Nota');
    await addRecord({ meetingId: meeting.id, type: 'asignacion', content: 'Hacer algo' });

    await changeMeetingStatus(meeting.id, 'cancelada');

    expect(await agendaQuery(meeting.id)).toHaveLength(1);
    expect(await recordsQuery(meeting.id)).toHaveLength(2);
    expect(await db.followUps.count()).toBe(1);
  });
});

describe('notas y registros de la reunión', () => {
  it('la nota general es una sola por reunión aunque se guarde muchas veces', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await saveGeneralNote(meeting.id, 'a');
    await saveGeneralNote(meeting.id, 'ab');
    await saveGeneralNote(meeting.id, 'abc');

    const notes = (await recordsQuery(meeting.id)).filter((r) => r.type === 'nota');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ content: 'abc', isPrivate: false });
  });

  it('guardar el texto de una nota privada NO la vuelve pública', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await saveGeneralNote(meeting.id, 'texto');
    await setGeneralNotePrivacy(meeting.id, true);
    for (const text of ['texto 2', 'texto 3']) await saveGeneralNote(meeting.id, text);

    const [note] = (await recordsQuery(meeting.id)).filter((r) => r.type === 'nota');
    expect(note).toMatchObject({ content: 'texto 3', isPrivate: true });
  });

  it('marcar como privada antes de escribir crea la nota vacía y privada', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await setGeneralNotePrivacy(meeting.id, true);
    await saveGeneralNote(meeting.id, 'primer texto');
    const notes = (await recordsQuery(meeting.id)).filter((r) => r.type === 'nota');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ content: 'primer texto', isPrivate: true });
  });

  it('el guardado automático de una nota no llena la cola de sincronización', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    for (let i = 0; i < 30; i++) await saveGeneralNote(meeting.id, `texto ${i}`);
    const ops = await db.syncOps.filter((o) => o.entityId === `nota-general:${meeting.id}`).count();
    expect(ops).toBe(1);
  });

  it('una propuesta se guarda como propuesta: nunca se convierte en decisión por sí sola', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    const { record, followUp } = await addRecord({
      meetingId: meeting.id,
      type: 'propuesta',
      content: 'Mover la conferencia a marzo',
    });
    expect(record.type).toBe('propuesta');
    expect(followUp).toBeUndefined();
    expect(await db.followUps.count()).toBe(0);
  });

  it('una asignación crea su seguimiento enlazado a la reunión, al punto y al registro', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    const item = await addAgendaItem(meeting.id, { title: 'Presupuesto' });

    const { record, followUp } = await addRecord({
      meetingId: meeting.id,
      agendaItemId: item.id,
      type: 'asignacion',
      content: 'Preparar el informe trimestral\nIncluir gastos de enero',
      assignee: '  Hno. Pérez ',
      dueDate: '2026-11-15',
    });

    expect(followUp).toMatchObject({
      kind: 'asignacion',
      status: INITIAL_STATUS.asignacion,
      title: 'Preparar el informe trimestral',
      assignee: 'Hno. Pérez',
      dueDate: '2026-11-15',
      originMeetingId: meeting.id,
      originAgendaItemId: item.id,
      originRecordId: record.id,
    });
    expect(followUp?.description).toContain('Incluir gastos de enero');
  });

  it('si algo falla, no queda el registro sin su seguimiento ni al revés', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    await expect(
      addRecord({ meetingId: meeting.id, type: 'asignacion', content: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.records.count()).toBe(0);
    expect(await db.followUps.count()).toBe(0);
  });

  it('eliminar un registro no elimina el seguimiento que originó', async () => {
    const meeting = await createMeeting({ title: 'R', startsAt: 1, durationMin: 30 });
    const { record } = await addRecord({
      meetingId: meeting.id,
      type: 'pendiente',
      content: 'Revisar el acuerdo del terreno',
    });
    await softDeleteEntity('records', record.id);
    const followUps = await db.followUps.toArray();
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.deletedAt).toBeUndefined();
  });
});

describe('seguimientos', () => {
  it('cerrar registra la fecha de cierre y reabrir la quita', async () => {
    const f = await createFollowUp({ kind: 'pendiente', text: 'Tema abierto' });
    expect(f.status).toBe('registrado');
    expect(isOpenFollowUp(f)).toBe(true);

    const done = await setFollowUpStatus(f.id, 'completado');
    expect(done.closedAt).toBeTypeOf('number');
    expect(isOpenFollowUp(done)).toBe(false);

    const reopened = await setFollowUpStatus(f.id, 'en_progreso');
    expect(reopened.closedAt).toBeUndefined();
    expect(isOpenFollowUp(reopened)).toBe(true);
  });

  it('cambiar al mismo estado no genera cambios innecesarios', async () => {
    const f = await createFollowUp({ kind: 'asignacion', text: 'Algo' });
    const opsBefore = await db.changeLog.count();
    await setFollowUpStatus(f.id, f.status);
    expect(await db.changeLog.count()).toBe(opsBefore);
  });

  it('detecta vencidas solo si están abiertas y la fecha ya pasó', async () => {
    const f = await createFollowUp({ kind: 'asignacion', text: 'X', dueDate: '2026-10-01' });
    expect(isOverdue(f, '2026-10-24')).toBe(true);
    expect(isOverdue(f, '2026-10-01')).toBe(false); // vence hoy: aún no está vencida
    const done = await setFollowUpStatus(f.id, 'completado');
    expect(isOverdue(done, '2026-10-24')).toBe(false);
  });

  it('formatea fechas locales y recorta títulos largos', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(titleFromText('x'.repeat(200))).toHaveLength(118);
    expect(titleFromText('  Primera línea \nsegunda')).toBe('Primera línea');
  });
});
