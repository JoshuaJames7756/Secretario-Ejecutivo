import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { resetDeviceIdCache } from '../src/db/settings';
import {
  groupSummary,
  summaryText,
  weekText,
  type SummaryEntry,
} from '../src/features/interviews/day-summary';
import { outreachFor } from '../src/features/interviews/outreach';
import {
  KIND_INFO,
  KIND_ORDER,
  MAX_PER_BLOCK,
  blockStart,
  blocksForDay,
  checkSlot,
  confirmationMessage,
  formatClock,
  leaderShort,
  nextFreeBlock,
  normalizePhone,
  reasonLabel,
  reminderMessage,
  whatsappUrl,
  suggestLeader,
  upcomingInterviewDays,
} from '../src/features/interviews/model';
import {
  SlotUnavailableError,
  ValidationError,
  addAvailability,
  cancelAppointment,
  cancelRequest,
  completeAppointment,
  createAndSchedule,
  createOrganization,
  createRequest,
  getPresidencyNames,
  LAST_TIME_KEY,
  markContacted,
  rescheduleAppointment,
  scheduleAppointment,
  setConfirmed,
  setPresidencyName,
  setWaitlist,
} from '../src/features/interviews/service';

beforeEach(async () => {
  resetDeviceIdCache();
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

// Lunes 2026-10-26 a las hh:mm, hora local
const monday = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();

async function weeklyWindow(leader: 'presidente' | 'primer_consejero', startH = 18, endH = 21) {
  await addAvailability({
    leader,
    kind: 'disponible',
    weekday: 1,
    startMin: startH * 60,
    endMin: endH * 60,
  });
}

async function book(
  name: string,
  startsAt: number,
  leader: 'presidente' | 'primer_consejero' = 'presidente',
) {
  const r = await createRequest({ personName: name });
  return scheduleAppointment({ requestId: r.id, leader, startsAt });
}

describe('motivo de la entrevista y quién la realiza', () => {
  it('investidura y misión exigen al presidente; renovación, llamamiento y Melquisedec no', () => {
    expect(KIND_INFO.investidura.rule).toBe('obligatorio');
    expect(KIND_INFO.mision.rule).toBe('obligatorio');
    expect(KIND_INFO.renovacion_recomendacion.rule).toBe('libre');
    expect(KIND_INFO.llamamiento.rule).toBe('libre');
    expect(KIND_INFO.melquisedec.rule).toBe('libre');
    expect(KIND_INFO.pathway.rule).toBe('libre');
    expect(KIND_INFO.dignidad.rule).toBe('sugerido');
    // «Personal» y «Dignidad» son motivos distintos
    expect(KIND_INFO.personal.label).not.toBe(KIND_INFO.dignidad.label);
  });

  it('todo motivo tiene etiqueta y el de obrero del templo queda marcado por verificar', () => {
    for (const k of KIND_ORDER) expect(KIND_INFO[k].label.length).toBeGreaterThan(0);
    expect(KIND_INFO.obrero_templo.toVerify).toBe(true);
  });

  it('el llamamiento puede llevar el detalle y solo ese motivo lo muestra', () => {
    expect(reasonLabel({ kind: 'llamamiento', kindDetail: 'Presidenta de la Primaria' })).toBe(
      'Llamamiento: Presidenta de la Primaria',
    );
    expect(reasonLabel({ kind: 'llamamiento' })).toBe('Llamamiento');
    expect(reasonLabel({ kind: 'mision', kindDetail: 'secreto' })).toBe('Misión');
  });

  it('createRequest descarta el detalle si no es un llamamiento', async () => {
    const r = await createRequest({ personName: 'Ana', kind: 'mision', kindDetail: 'x' });
    expect(r.kindDetail).toBeUndefined();
    expect(r.mustBeWithPresident).toBe(true);
  });
});

describe('sugerencia de líder', () => {
  const org = { name: 'Barrio Norte', assignedLeader: 'segundo_consejero' as const };

  it('el presidente si el motivo lo exige o lo sugiere; si no, el consejero del barrio', () => {
    expect(suggestLeader({ kind: 'investidura', mustBeWithPresident: true }, org).leader).toBe(
      'presidente',
    );
    expect(suggestLeader({ kind: 'dignidad', mustBeWithPresident: false }, org).leader).toBe(
      'presidente',
    );
    expect(
      suggestLeader({ kind: 'renovacion_recomendacion', mustBeWithPresident: false }, org).leader,
    ).toBe('segundo_consejero');
  });

  it('sin barrio asignado no inventa un líder', () => {
    expect(suggestLeader({ kind: 'personal', mustBeWithPresident: false }).leader).toBeUndefined();
  });
});

describe('bloques de media hora', () => {
  it('el bloque se calcula por media hora y permite hasta 3 por líder', async () => {
    expect(blockStart(monday(20, 45))).toBe(monday(20, 30));
    expect(blockStart(monday(20, 10))).toBe(monday(20));
    expect(MAX_PER_BLOCK).toBe(3);

    await book('A', monday(20, 30));
    await book('B', monday(20, 33));
    await book('C', monday(20, 45));
    const fourth = await createRequest({ personName: 'D' });
    const err = await scheduleAppointment({
      requestId: fourth.id,
      leader: 'presidente',
      startsAt: monday(20, 40),
      special: true, // ni siquiera un día especial supera el bloque
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlotUnavailableError);
    expect((err as SlotUnavailableError).issues[0]?.kind).toBe('bloque_lleno');
    expect(await db.interviewAppointments.count()).toBe(3);
  });

  it('el bloque siguiente y otro líder siguen libres', async () => {
    await book('A', monday(20));
    await book('B', monday(20, 10));
    await book('C', monday(20, 15));
    await book('D', monday(20, 30)); // otro bloque
    await book('E', monday(20, 5), 'primer_consejero'); // otro líder
    expect(await db.interviewAppointments.count()).toBe(5);
  });

  it('la hora exacta es libre: 8:10, 8:15 o 8:45 en el mismo bloque', async () => {
    const a = await book('A', monday(20, 10));
    const b = await book('B', monday(20, 10)); // misma hora exacta también vale
    expect(a.startsAt).toBe(b.startsAt);
  });

  it('cancelar libera cupo en el bloque', async () => {
    const a = await book('A', monday(20));
    await book('B', monday(20));
    await book('C', monday(20));
    await cancelAppointment(a.id);
    await expect(book('D', monday(20, 20))).resolves.toBeDefined();
  });

  it('blocksForDay muestra la ocupación y marca los llenos', async () => {
    await weeklyWindow('presidente', 20, 21);
    await book('A', monday(20));
    await book('B', monday(20, 10));
    await book('C', monday(20, 20));
    const blocks = blocksForDay({
      leader: 'presidente',
      day: new Date(2026, 9, 26),
      rules: await db.leaderAvailability.toArray(),
      appointments: await db.interviewAppointments.toArray(),
    });
    expect(blocks.map((b) => [b.startsAt, b.taken, b.full])).toEqual([
      [monday(20), 3, true],
      [monday(20, 30), 0, false],
    ]);
  });

  it('upcomingInterviewDays propone los próximos días con bloques libres', async () => {
    await weeklyWindow('presidente', 20, 21);
    const rules = await db.leaderAvailability.toArray();
    const days = upcomingInterviewDays({
      leader: 'presidente',
      from: monday(8),
      rules,
      appointments: [],
      max: 2,
    });
    expect(days.map((d) => d.getDate())).toEqual([26, 2]);
  });
});

describe('disponibilidad y día especial', () => {
  it('fuera del horario habitual avisa y solo se agenda como día especial', async () => {
    await weeklyWindow('presidente');
    const r = await createRequest({ personName: 'Ana' });
    const input = { requestId: r.id, leader: 'presidente' as const, startsAt: monday(10) };

    const err = await scheduleAppointment(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlotUnavailableError);
    expect((err as SlotUnavailableError).issues[0]?.kind).toBe('fuera_de_disponibilidad');
    expect(await db.interviewAppointments.count()).toBe(0);

    const a = await scheduleAppointment({ ...input, special: true });
    expect(a.special).toBe(true);
  });

  it('un bloque «no disponible» recorta la disponibilidad', async () => {
    await weeklyWindow('presidente', 18, 21);
    await addAvailability({
      leader: 'presidente',
      kind: 'no_disponible',
      date: '2026-10-26',
      startMin: 19 * 60,
      endMin: 20 * 60,
    });
    const rules = await db.leaderAvailability.toArray();
    const check = (h: number, m = 0) =>
      checkSlot({ leader: 'presidente', startsAt: monday(h, m), rules, appointments: [] });
    expect(check(18)).toHaveLength(0);
    expect(check(19)[0]?.kind).toBe('no_disponible');
    expect(check(19, 45)[0]?.kind).toBe('no_disponible');
    expect(check(20)).toHaveLength(0);
  });

  it('las 20:45 caben en una ventana de 20:00 a 22:00 (no depende de la duración)', async () => {
    await weeklyWindow('presidente', 20, 22);
    const rules = await db.leaderAvailability.toArray();
    expect(
      checkSlot({ leader: 'presidente', startsAt: monday(21, 55), rules, appointments: [] }),
    ).toHaveLength(0);
  });

  it('sin disponibilidad configurada no restringe', () => {
    expect(
      checkSlot({ leader: 'presidente', startsAt: monday(10), rules: [], appointments: [] }),
    ).toHaveLength(0);
  });
});

describe('solicitudes y citas', () => {
  it('investidura con un consejero se rechaza salvo autorización del presidente', async () => {
    const r = await createRequest({ personName: 'Ana', kind: 'investidura' });
    expect(r.requestedLeader).toBe('presidente');
    await expect(
      scheduleAppointment({ requestId: r.id, leader: 'primer_consejero', startsAt: monday(19) }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      scheduleAppointment({
        requestId: r.id,
        leader: 'primer_consejero',
        startsAt: monday(19),
        presidentAuthorized: true,
      }),
    ).resolves.toBeDefined();
  });

  it('una renovación sí puede hacerla un consejero', async () => {
    const r = await createRequest({ personName: 'Ana', kind: 'renovacion_recomendacion' });
    await expect(
      scheduleAppointment({ requestId: r.id, leader: 'segundo_consejero', startsAt: monday(19) }),
    ).resolves.toBeDefined();
  });

  it('registro rápido: persona y cita se guardan juntas o no se guarda nada', async () => {
    const ok = await createAndSchedule(
      { personName: 'Ana', treatment: 'hermana', kind: 'mision', modality: 'virtual' },
      { leader: 'presidente', startsAt: monday(20, 15) },
    );
    expect(ok.request.treatment).toBe('hermana');
    expect(ok.request.modality).toBe('virtual');
    expect(ok.appointment.confirmed).toBe(false);

    await weeklyWindow('primer_consejero');
    await expect(
      createAndSchedule(
        { personName: 'Luis' },
        { leader: 'primer_consejero', startsAt: monday(10) }, // fuera de horario y sin especial
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await db.interviewRequests.count()).toBe(1);
  });

  it('por defecto es presencial y «hermano»', async () => {
    const r = await createRequest({ personName: 'Ana' });
    expect(r.modality).toBe('presencial');
    expect(r.treatment).toBe('hermano');
  });

  it('confirmada: se marca y se quita, y reprogramar la deja sin confirmar', async () => {
    const a = await book('Ana', monday(19));
    expect(a.confirmed).toBe(false);
    expect((await setConfirmed(a.id, true)).confirmed).toBe(true);
    expect((await setConfirmed(a.id, false)).confirmed).toBe(false);
    await setConfirmed(a.id, true);

    const moved = await rescheduleAppointment(a.id, {
      leader: 'presidente',
      startsAt: monday(19, 40),
    });
    expect(moved.confirmed).toBe(false);
    await expect(setConfirmed(a.id, true)).rejects.toBeInstanceOf(ValidationError); // la vieja ya no
  });

  it('programar actualiza la solicitud; reprogramar conserva el historial', async () => {
    const a1 = await book('Ana', monday(19));
    expect((await db.interviewRequests.get(a1.requestId))?.status).toBe('programada');
    const a2 = await rescheduleAppointment(a1.id, {
      leader: 'presidente',
      startsAt: monday(19, 15),
    });
    const all = await db.interviewAppointments.toArray();
    expect(all.find((a) => a.id === a1.id)?.status).toBe('reprogramada');
    expect(all.find((a) => a.id === a2.id)?.status).toBe('programada');
  });

  it('reprogramar dentro del mismo bloque lleno no se cuenta contra sí misma', async () => {
    const a = await book('A', monday(20));
    await book('B', monday(20));
    await book('C', monday(20));
    await expect(
      rescheduleAppointment(a.id, { leader: 'presidente', startsAt: monday(20, 20) }),
    ).resolves.toBeDefined();
  });

  it('cancelar la cita devuelve la solicitud a coordinación', async () => {
    const a = await book('Ana', monday(19));
    await cancelAppointment(a.id);
    expect((await db.interviewRequests.get(a.requestId))?.status).toBe('pendiente_coordinacion');
  });

  it('completar y cancelar la solicitud completa cierran todo', async () => {
    const a = await book('Ana', monday(19));
    await completeAppointment(a.id);
    expect((await db.interviewRequests.get(a.requestId))?.status).toBe('completada');
    await expect(cancelRequest(a.requestId)).rejects.toBeInstanceOf(ValidationError);

    const b = await book('Luis', monday(20));
    await cancelRequest(b.requestId);
    expect(
      (await db.interviewAppointments.toArray()).filter((x) => x.status === 'programada'),
    ).toHaveLength(0);
  });

  it('lista de espera: se activa y se quita al programar', async () => {
    const r = await createRequest({ personName: 'Ana', notes: 'Noches entre semana' });
    const waiting = await setWaitlist(r.id, true);
    expect(waiting.waitlist).toBe(true);
    expect(waiting.notes).toBe('Noches entre semana');
    await scheduleAppointment({ requestId: r.id, leader: 'presidente', startsAt: monday(19) });
    expect((await db.interviewRequests.get(r.id))?.waitlist).toBe(false);
  });

  it('solo datos administrativos y valida el nombre', async () => {
    await expect(createRequest({ personName: '  ' })).rejects.toBeInstanceOf(ValidationError);
    const r = await createRequest({ personName: 'Ana' });
    expect(Object.keys(r)).not.toContain('reason');
  });

  it('no duplica barrios con el mismo nombre', async () => {
    await createOrganization({
      name: 'Barrio Norte',
      category: 'barrio',
      assignedLeader: 'primer_consejero',
    });
    await expect(
      createOrganization({ name: 'barrio norte', category: 'barrio' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('presidencia de estaca', () => {
  it('guarda, cambia y borra los apellidos', async () => {
    expect(await getPresidencyNames()).toEqual({});
    await setPresidencyName('presidente', '  Rojas ');
    await setPresidencyName('primer_consejero', 'Quispe');
    expect(await getPresidencyNames()).toEqual({ presidente: 'Rojas', primer_consejero: 'Quispe' });
    await setPresidencyName('primer_consejero', '');
    expect(await getPresidencyNames()).toEqual({ presidente: 'Rojas' });
  });

  it('muestra el apellido o, si falta, el cargo', () => {
    expect(leaderShort('presidente', { presidente: 'Rojas' })).toBe('Presidente Rojas');
    expect(leaderShort('segundo_consejero', {})).toBe('Segundo consejero');
  });
});

describe('mensaje de confirmación', () => {
  it('solo la hora (sin duración), con «hermana» y sin datos confidenciales', () => {
    const text = confirmationMessage({
      personName: 'Ana María Pérez',
      treatment: 'hermana',
      leader: 'primer_consejero',
      startsAt: monday(20, 30),
    });
    expect(text).toContain('Hola hermana Ana,');
    expect(text).toContain('primer consejero');
    expect(text).toContain('8:30 pm');
    expect(text).not.toMatch(/minutos|duración/i);
    expect(text).not.toMatch(/virtual/i);
  });

  it('dice «hermano» por defecto y avisa si es virtual', () => {
    const text = confirmationMessage({
      personName: 'Luis Rojas',
      leader: 'presidente',
      startsAt: monday(20, 45),
      modality: 'virtual',
      names: { presidente: 'Quispe' },
    });
    expect(text).toContain('Hola hermano Luis,');
    expect(text).toContain('8:45 pm');
    expect(text).toContain('virtual');
    expect(text).toContain('presidente quispe');
  });

  it('formatClock usa el formato de 12 horas', () => {
    expect(formatClock(monday(0, 5))).toBe('12:05 am');
    expect(formatClock(monday(12))).toBe('12:00 pm');
    expect(formatClock(monday(20, 10))).toBe('8:10 pm');
  });
});

describe('resumen del día', () => {
  const entry = (over: Partial<SummaryEntry>): SummaryEntry => ({
    id: Math.random().toString(),
    startsAt: monday(20),
    name: 'Hna. Ana Pérez',
    organization: 'Barrio Norte',
    reason: 'Misión',
    leader: 'presidente',
    modality: 'presencial',
    confirmed: false,
    special: false,
    ...over,
  });

  it('agrupa por quien entrevista y ordena por hora', () => {
    const groups = groupSummary(
      [
        entry({ id: 'a', leader: 'segundo_consejero', startsAt: monday(20, 30) }),
        entry({ id: 'b', leader: 'presidente', startsAt: monday(21) }),
        entry({ id: 'c', leader: 'presidente', startsAt: monday(20) }),
      ],
      { presidente: 'Rojas' },
    );
    expect(groups.map((g) => g.title)).toEqual(['Rojas', 'Segundo consejero']);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('el texto incluye hora, nombre, barrio, motivo y estado, sin duración', () => {
    const text = summaryText(
      new Date(2026, 9, 29),
      [entry({ confirmed: true, modality: 'virtual' })],
      { presidente: 'Rojas' },
    );
    expect(text).toContain('Jueves 29 de octubre');
    expect(text).toContain('Rojas');
    expect(text).toContain('8:00 pm · Hna. Ana Pérez (Barrio Norte) · Misión');
    expect(text).toContain('Virtual');
    expect(text).toContain('confirmada');
    expect(text).not.toMatch(/minutos/);
  });

  it('un día sin entrevistas lo dice', () => {
    expect(summaryText(new Date(2026, 9, 29), [], {})).toContain('sin entrevistas');
  });
});

describe('teléfono y mensajes por WhatsApp', () => {
  it('normaliza el número: 8 dígitos son de Bolivia, y rechaza lo que no parece un número', () => {
    expect(normalizePhone('')).toBeUndefined();
    expect(normalizePhone('712 34567')).toBe('59171234567');
    expect(normalizePhone('+591 71234567')).toBe('59171234567');
    expect(normalizePhone('00 54 9 11 2345 6789')).toBe('5491123456789');
    expect(normalizePhone('123')).toBeNull();
  });

  it('guarda el número normalizado y rechaza uno inválido', async () => {
    const r = await createRequest({ personName: 'Ana', phone: '71234567' });
    expect(r.phone).toBe('59171234567');
    await expect(createRequest({ personName: 'Luis', phone: 'abc' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('el enlace de WhatsApp lleva el texto codificado', () => {
    const url = whatsappUrl('59171234567', 'Hola hermano Juan\n\n¡Gracias!');
    expect(url.startsWith('https://wa.me/59171234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1] ?? '')).toBe('Hola hermano Juan\n\n¡Gracias!');
  });

  it('el recordatorio dice «mañana» o la fecha, solo la hora y pide confirmar', () => {
    const now = new Date(2026, 9, 28, 14).getTime();
    const tomorrow = reminderMessage({
      personName: 'María Soto',
      treatment: 'hermana',
      leader: 'presidente',
      startsAt: new Date(2026, 9, 29, 20, 30).getTime(),
      now,
    });
    expect(tomorrow).toContain('hermana María');
    expect(tomorrow).toContain('mañana a las 8:30 pm');
    expect(tomorrow).toContain('confirma');
    expect(tomorrow).not.toMatch(/minutos/);
    const later = reminderMessage({
      personName: 'Luis',
      leader: 'presidente',
      startsAt: new Date(2026, 10, 5, 20).getTime(),
      now,
    });
    expect(later).toContain('jueves, 5 de noviembre');
  });

  it('toca mensaje, luego recordatorio, y nada cuando ya confirmó', async () => {
    const now = Date.now();
    const r = await createRequest({ personName: 'Ana', phone: '71234567' });
    const a = await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(20),
    });
    const first = outreachFor(r, a, {}, now);
    expect(first?.kind).toBe('inicial');
    expect(first?.whatsapp).toContain('wa.me/59171234567');

    const contacted = await markContacted(a.id);
    expect(contacted.contactedAt).toBeDefined();
    expect(outreachFor(r, contacted, {}, now)?.kind).toBe('recordatorio');

    const confirmed = await setConfirmed(a.id, true);
    expect(outreachFor(r, confirmed, {}, now)).toBeNull();

    // Sin número solo se copia
    const r2 = await createRequest({ personName: 'Luis' });
    const a2 = await scheduleAppointment({
      requestId: r2.id,
      leader: 'presidente',
      startsAt: monday(20, 40),
    });
    expect(outreachFor(r2, a2, {}, now)?.whatsapp).toBeUndefined();
  });

  it('reprogramar reinicia el aviso', async () => {
    const a = await book('Ana', monday(20));
    await markContacted(a.id);
    const moved = await rescheduleAppointment(a.id, { leader: 'presidente', startsAt: monday(21) });
    expect(moved.contactedAt).toBeUndefined();
  });

  it('recuerda la última hora usada al agendar', async () => {
    await book('Ana', monday(20, 15));
    expect((await db.settings.get(LAST_TIME_KEY))?.value).toBe('20:15');
  });
});

describe('cupo y semana', () => {
  it('nextFreeBlock salta los bloques llenos', async () => {
    await weeklyWindow('presidente', 20, 21);
    await book('A', monday(20));
    await book('B', monday(20, 5));
    await book('C', monday(20, 10));
    const free = nextFreeBlock({
      leader: 'presidente',
      from: monday(8),
      rules: await db.leaderAvailability.toArray(),
      appointments: await db.interviewAppointments.toArray(),
    });
    expect(free?.startsAt).toBe(monday(20, 30));
    // Si nadie ocupa el cupo, vale desde la hora indicada
    expect(
      nextFreeBlock({
        leader: 'primer_consejero',
        from: monday(8),
        rules: [],
        appointments: [],
      }),
    ).toBeUndefined();
  });

  it('el texto de la semana omite los días vacíos', () => {
    const entry: SummaryEntry = {
      id: 'x',
      startsAt: monday(20),
      name: 'Hno. Luis',
      reason: 'Misión',
      leader: 'presidente',
      modality: 'presencial',
      confirmed: false,
      special: false,
    };
    const text = weekText(
      [
        { day: new Date(2026, 9, 26), entries: [entry] },
        { day: new Date(2026, 9, 27), entries: [] },
      ],
      {},
      'Semana',
    );
    expect(text).toContain('Lunes 26 de octubre');
    expect(text).not.toContain('27 de octubre');
    expect(weekText([], {}, 'Semana')).toContain('sin entrevistas');
  });
});
