import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { resetDeviceIdCache } from '../src/db/settings';
import { createFollowUp, setFollowUpStatus } from '../src/features/followups/service';
import { agendaQuery, createMeeting, updateAgendaItem } from '../src/features/meetings/service';
import {
  addSuggestionToAgenda,
  dismissSuggestion,
  loadSuggestions,
  restoreSuggestions,
} from '../src/features/meetings/suggestions';

beforeEach(async () => {
  resetDeviceIdCache();
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function setup() {
  const meeting = await createMeeting({ title: 'Consejo', startsAt: Date.now(), durationMin: 60 });
  const a = await createFollowUp({
    kind: 'pendiente',
    text: 'Revisar presupuesto',
    dueDate: '2026-12-01',
  });
  const b = await createFollowUp({
    kind: 'asignacion',
    text: 'Visitar barrio',
    dueDate: '2026-11-01',
  });
  const closed = await createFollowUp({ kind: 'pendiente', text: 'Ya resuelto' });
  await setFollowUpStatus(closed.id, 'completado');
  return { meeting, a, b, closed };
}

describe('sugerencias de agenda', () => {
  it('ofrece solo los seguimientos abiertos, el más próximo primero, y no agrega nada solo', async () => {
    const { meeting, a, b } = await setup();
    const { pending } = await loadSuggestions(meeting.id);
    expect(pending.map((f) => f.id)).toEqual([b.id, a.id]);
    expect(await agendaQuery(meeting.id)).toHaveLength(0);
  });

  it('agregar crea un punto editable y deja de sugerirlo; el seguimiento sigue abierto', async () => {
    const { meeting, a } = await setup();
    const item = await addSuggestionToAgenda(meeting.id, a.id);
    expect(item.followUpId).toBe(a.id);
    expect(item.title).toBe('Revisar presupuesto');

    await updateAgendaItem(item.id, { title: 'Presupuesto: segunda revisión' });
    expect((await db.followUps.get(a.id))?.title).toBe('Revisar presupuesto');

    const { pending } = await loadSuggestions(meeting.id);
    expect(pending.some((f) => f.id === a.id)).toBe(false);
    expect((await db.followUps.get(a.id))?.status).toBe('registrado');
  });

  it('descartar es solo para esa reunión y se puede deshacer', async () => {
    const { meeting, a } = await setup();
    const other = await createMeeting({ title: 'Otra', startsAt: Date.now(), durationMin: 30 });

    await dismissSuggestion(meeting.id, a.id);
    await dismissSuggestion(meeting.id, a.id); // idempotente
    const here = await loadSuggestions(meeting.id);
    expect(here.pending.some((f) => f.id === a.id)).toBe(false);
    expect(here.dismissedCount).toBe(1);
    expect((await loadSuggestions(other.id)).pending.some((f) => f.id === a.id)).toBe(true);

    await restoreSuggestions(meeting.id);
    expect((await loadSuggestions(meeting.id)).pending.some((f) => f.id === a.id)).toBe(true);
  });
});
