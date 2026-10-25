import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { resetDeviceIdCache } from '../src/db/settings';
import {
  checkSlot,
  confirmationMessage,
  suggestLeader,
  suggestSlots,
} from '../src/features/interviews/model';
import {
  SlotUnavailableError,
  ValidationError,
  addAvailability,
  cancelAppointment,
  cancelRequest,
  completeAppointment,
  createOrganization,
  createRequest,
  rescheduleAppointment,
  scheduleAppointment,
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

describe('sugerencia de líder', () => {
  it('respeta presidente, luego el líder pedido, luego el consejero del barrio', () => {
    const org = { name: 'Barrio Norte', assignedLeader: 'segundo_consejero' as const };
    expect(
      suggestLeader({ mustBeWithPresident: true, requestedLeader: 'primer_consejero' }, org).leader,
    ).toBe('presidente');
    expect(
      suggestLeader({ mustBeWithPresident: false, requestedLeader: 'primer_consejero' }, org)
        .leader,
    ).toBe('primer_consejero');
    expect(suggestLeader({ mustBeWithPresident: false }, org).leader).toBe('segundo_consejero');
    expect(suggestLeader({ mustBeWithPresident: false }).leader).toBeUndefined();
  });
});

describe('horarios', () => {
  it('detecta choque con otra cita del mismo líder y lo trata como no anulable', async () => {
    await weeklyWindow('presidente');
    const r1 = await createRequest({ personName: 'Ana Pérez' });
    const r2 = await createRequest({ personName: 'Luis Rojas' });
    await scheduleAppointment({
      requestId: r1.id,
      leader: 'presidente',
      startsAt: monday(18),
      durationMin: 30,
    });

    const err = await scheduleAppointment({
      requestId: r2.id,
      leader: 'presidente',
      startsAt: monday(18, 15),
      durationMin: 30,
      overrideAvailability: true, // aun forzando, un choque no se permite
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlotUnavailableError);
    expect((err as SlotUnavailableError).issues[0]?.kind).toBe('conflicto');
    expect(await db.interviewAppointments.count()).toBe(1);

    // Justo después sí se puede (los extremos no se solapan)
    await scheduleAppointment({
      requestId: r2.id,
      leader: 'presidente',
      startsAt: monday(18, 30),
      durationMin: 30,
    });
    expect(await db.interviewAppointments.count()).toBe(2);
  });

  it('otro líder puede tener cita a la misma hora', async () => {
    const r1 = await createRequest({ personName: 'Ana' });
    const r2 = await createRequest({ personName: 'Luis' });
    await scheduleAppointment({
      requestId: r1.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
    await scheduleAppointment({
      requestId: r2.id,
      leader: 'primer_consejero',
      startsAt: monday(19),
      durationMin: 30,
    });
    expect(await db.interviewAppointments.count()).toBe(2);
  });

  it('fuera de la disponibilidad avisa y solo se agenda con anulación expresa', async () => {
    await weeklyWindow('presidente');
    const r = await createRequest({ personName: 'Ana' });
    const input = {
      requestId: r.id,
      leader: 'presidente' as const,
      startsAt: monday(10),
      durationMin: 30,
    };

    const err = await scheduleAppointment(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlotUnavailableError);
    expect((err as SlotUnavailableError).issues[0]?.kind).toBe('fuera_de_disponibilidad');
    expect(await db.interviewAppointments.count()).toBe(0);

    await scheduleAppointment({ ...input, overrideAvailability: true });
    expect(await db.interviewAppointments.count()).toBe(1);
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
    const check = (h: number) =>
      checkSlot({
        leader: 'presidente',
        startsAt: monday(h),
        durationMin: 30,
        rules,
        appointments: [],
      });
    expect(check(18)).toHaveLength(0);
    expect(check(19)[0]?.kind).toBe('no_disponible');
    expect(check(20)).toHaveLength(0);
    // Otro lunes sí está libre a las 19
    const nextMonday = new Date(2026, 10, 2, 19).getTime();
    expect(
      checkSlot({
        leader: 'presidente',
        startsAt: nextMonday,
        durationMin: 30,
        rules,
        appointments: [],
      }),
    ).toHaveLength(0);
  });

  it('sin disponibilidad configurada no bloquea, solo respeta los choques', () => {
    expect(
      checkSlot({
        leader: 'presidente',
        startsAt: monday(10),
        durationMin: 30,
        rules: [],
        appointments: [],
      }),
    ).toHaveLength(0);
  });

  it('no permite citas que crucen la medianoche', () => {
    const issues = checkSlot({
      leader: 'presidente',
      startsAt: monday(23, 45),
      durationMin: 30,
      rules: [],
      appointments: [],
    });
    expect(issues[0]?.kind).toBe('cruza_medianoche');
  });

  it('propone horarios libres futuros y omite los ocupados', async () => {
    await weeklyWindow('presidente', 18, 19);
    const r = await createRequest({ personName: 'Ana' });
    await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(18),
      durationMin: 30,
    });
    const rules = await db.leaderAvailability.toArray();
    const appointments = await db.interviewAppointments.toArray();
    const slots = suggestSlots({
      leader: 'presidente',
      from: monday(8),
      durationMin: 30,
      rules,
      appointments,
      max: 3,
    });
    expect(slots[0]).toBe(monday(18, 30));
    expect(slots[1]).toBe(new Date(2026, 10, 2, 18).getTime());
    expect(
      suggestSlots({
        leader: 'segundo_consejero',
        from: monday(8),
        durationMin: 30,
        rules,
        appointments,
      }),
    ).toEqual([]);
  });
});

describe('solicitudes y citas', () => {
  it('exige presidente cuando así se indica', async () => {
    const r = await createRequest({ personName: 'Ana', mustBeWithPresident: true });
    expect(r.requestedLeader).toBe('presidente');
    await expect(
      scheduleAppointment({
        requestId: r.id,
        leader: 'primer_consejero',
        startsAt: monday(19),
        durationMin: 30,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('programar actualiza la solicitud; reprogramar conserva el historial', async () => {
    const r = await createRequest({ personName: 'Ana' });
    const a1 = await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
    expect((await db.interviewRequests.get(r.id))?.status).toBe('programada');

    // Reprogramar a un horario que solo choca consigo misma debe ser posible
    const a2 = await rescheduleAppointment(a1.id, {
      leader: 'presidente',
      startsAt: monday(19, 15),
      durationMin: 30,
    });
    const all = await db.interviewAppointments.toArray();
    expect(all.find((a) => a.id === a1.id)?.status).toBe('reprogramada');
    expect(all.find((a) => a.id === a2.id)?.status).toBe('programada');
    // La cita vieja ya no bloquea su horario
    const r2 = await createRequest({ personName: 'Luis' });
    await expect(
      scheduleAppointment({
        requestId: r2.id,
        leader: 'presidente',
        startsAt: monday(19),
        durationMin: 15,
      }),
    ).resolves.toBeDefined();
  });

  it('cancelar la cita devuelve la solicitud a coordinación y libera el horario', async () => {
    const r = await createRequest({ personName: 'Ana' });
    const a = await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
    await cancelAppointment(a.id);
    expect((await db.interviewRequests.get(r.id))?.status).toBe('pendiente_coordinacion');
    const r2 = await createRequest({ personName: 'Luis' });
    await scheduleAppointment({
      requestId: r2.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
  });

  it('completar y cancelar la solicitud completa cierran todo', async () => {
    const r = await createRequest({ personName: 'Ana' });
    const a = await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
    await completeAppointment(a.id);
    expect((await db.interviewRequests.get(r.id))?.status).toBe('completada');
    await expect(cancelRequest(r.id)).rejects.toBeInstanceOf(ValidationError);

    const r2 = await createRequest({ personName: 'Luis' });
    await scheduleAppointment({
      requestId: r2.id,
      leader: 'presidente',
      startsAt: monday(20),
      durationMin: 30,
    });
    await cancelRequest(r2.id);
    expect(
      (await db.interviewAppointments.toArray()).filter((x) => x.status === 'programada'),
    ).toHaveLength(0);
  });

  it('lista de espera: se activa sin perder datos y se quita al programar', async () => {
    const r = await createRequest({ personName: 'Ana', timePreferences: 'Noches entre semana' });
    const waiting = await setWaitlist(r.id, true);
    expect(waiting.waitlist).toBe(true);
    expect(waiting.status).toBe('pendiente_coordinacion');
    expect(waiting.timePreferences).toBe('Noches entre semana');
    await scheduleAppointment({
      requestId: r.id,
      leader: 'presidente',
      startsAt: monday(19),
      durationMin: 30,
    });
    expect((await db.interviewRequests.get(r.id))?.waitlist).toBe(false);
  });

  it('no registra contenido: solo datos administrativos y valida el nombre', async () => {
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

describe('mensaje de confirmación', () => {
  it('usa el primer nombre, el líder y la hora, sin datos confidenciales', () => {
    const text = confirmationMessage({
      personName: 'Ana María Pérez',
      leader: 'primer_consejero',
      startsAt: monday(19, 30),
      durationMin: 20,
    });
    expect(text).toContain('Hola Ana,');
    expect(text).toContain('primer consejero');
    expect(text).toContain('19:30');
    expect(text).toContain('20 minutos');
  });
});
