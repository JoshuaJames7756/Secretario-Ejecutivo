// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { db } from '../src/db/database';
import { createEntity } from '../src/db/repo';
import { scheduleAppointment } from '../src/features/interviews/service';
import { resetThemeForTests } from '../src/hooks/use-theme';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

beforeEach(async () => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  localStorage.clear();
  resetThemeForTests();
  window.history.pushState({}, '', '/');
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(cleanup);

async function seedTemplate() {
  return createEntity('templates', {
    name: 'Consejo de prueba',
    category: 'Consejos',
    suggestedParticipants: ['Presidente'],
    agendaPoints: [{ title: 'Oración' }, { title: 'Asuntos del día' }],
    checklist: [],
    origin: 'personal',
    status: 'activo',
  });
}

describe('flujo de reunión en pantalla', () => {
  it('crea una reunión desde una plantilla, copia la agenda y la valida', async () => {
    const template = await seedTemplate();
    window.history.pushState({}, '', `/reuniones/nueva?plantilla=${template.id}`);
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(/Se copiarán 2 puntos de agenda/)).toBeTruthy();

    // Validación: sin nombre no se crea
    const title = screen.getByLabelText('Nombre');
    await user.clear(title);
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }));
    expect(await screen.findByText('Escribe un nombre para la reunión.')).toBeTruthy();
    expect(await db.meetings.count()).toBe(0);

    await user.type(title, 'Consejo de abril');
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }));

    await waitFor(async () => expect(await db.meetings.count()).toBe(1));
    expect(await db.agendaItems.count()).toBe(2);
    expect(await screen.findByRole('heading', { level: 1, name: 'Consejo de abril' })).toBeTruthy();
  });

  it('en modo reunión guarda notas, registra una decisión y una asignación, y cierra', async () => {
    const template = await seedTemplate();
    window.history.pushState({}, '', `/reuniones/nueva?plantilla=${template.id}`);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Crear reunión' }));
    await user.click(await screen.findByRole('button', { name: /Iniciar reunión/ }));

    // Notas del primer punto: se guardan solas
    const notes = await screen.findByLabelText('Notas de este punto');
    await user.type(notes, 'Se dio la oración');
    await waitFor(async () => {
      const items = await db.agendaItems.toArray();
      expect(items.some((i) => i.notes === 'Se dio la oración')).toBe(true);
    });

    // Asignación: crea también su seguimiento
    await user.click(screen.getByRole('radio', { name: 'Asignación' }));
    await user.type(screen.getByLabelText('Asignación'), 'Preparar el informe');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(async () => expect(await db.followUps.count()).toBe(1));

    // Decisión: solo registro, sin seguimiento
    await user.click(screen.getByRole('radio', { name: 'Decisión confirmada' }));
    await user.type(screen.getByLabelText('Decisión confirmada'), 'Se aprueba el cambio');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(async () => expect(await db.records.count()).toBe(2));
    expect(await db.followUps.count()).toBe(1);

    // Cierre con advertencia del punto sin notas
    await user.click(screen.getByRole('button', { name: 'Revisar y cerrar la reunión' }));
    expect(await screen.findByText(/1 punto no tiene notas/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cerrar reunión' }));
    await waitFor(async () => {
      const [meeting] = await db.meetings.toArray();
      expect(meeting?.status).toBe('cerrada');
    });
  });

  it('Seguimientos muestra lo creado, marca vencidos y permite cerrarlos', async () => {
    await createEntity('followUps', {
      title: 'Entregar informe',
      kind: 'asignacion',
      status: 'aprobado_asignado',
      dueDate: '2020-01-01',
    });
    window.history.pushState({}, '', '/seguimientos');
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Entregar informe')).toBeTruthy();
    expect(screen.getByText('Vencido')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Estado'), 'completado');
    await waitFor(async () => {
      const [item] = await db.followUps.toArray();
      expect(item?.status).toBe('completado');
      expect(item?.closedAt).toBeTypeOf('number');
    });
    // Ya no está entre los abiertos.
    await waitFor(() => expect(screen.queryByText('Entregar informe')).toBeNull());
  });

  it('el calendario muestra la reunión de un día y programa desde ese día', async () => {
    const startsAt = new Date(2026, 9, 24, 19, 0).getTime();
    await createEntity('meetings', {
      title: 'Consejo de estaca',
      startsAt,
      durationMin: 60,
      participants: [],
      status: 'programada',
    });
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 20, 10, 0) });
    window.history.pushState({}, '', '/calendario');
    const user = userEvent.setup();
    try {
      render(<App />);
      const day = await screen.findByRole('gridcell', { name: /sábado, 24 de octubre, 1 reunión/ });
      await user.click(day);
      expect(await screen.findByText('Consejo de estaca')).toBeTruthy();

      await user.click(screen.getByRole('link', { name: /Nueva reunión/ }));
      const when = (await screen.findByLabelText('Fecha y hora')) as HTMLInputElement;
      expect(when.value).toBe('2026-10-24T19:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('entrevistas: agenda en una pantalla, confirma y respeta el máximo de 3 por bloque', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/entrevistas/nueva');
    render(<App />);
    await user.type(await screen.findByLabelText('Nombre de la persona'), 'Ana Pérez');
    await user.click(screen.getByRole('radio', { name: 'Hermana' }));
    await user.click(screen.getByRole('radio', { name: 'Virtual' }));
    await user.click(screen.getByRole('radio', { name: 'Primer consejero' }));
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2030-03-04' } });
    fireEvent.change(screen.getByLabelText('Hora exacta'), { target: { value: '20:15' } });
    await user.click(screen.getByRole('button', { name: 'Agendar entrevista' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hermana Ana Pérez' }),
    ).toBeTruthy();
    const saved = await db.interviewAppointments.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.leader).toBe('primer_consejero');
    expect((await db.interviewRequests.toArray())[0]?.modality).toBe('virtual');
    const message = (await screen.findByLabelText('Texto del mensaje')) as HTMLTextAreaElement;
    expect(message.value).toContain('hermana Ana');
    expect(message.value).toContain('8:15 pm');
    expect(message.value).not.toMatch(/minutos/);

    // Marca de confirmada
    const toggle = await screen.findByRole('switch', { name: 'Confirmada: Ana Pérez' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await user.click(toggle);
    await waitFor(async () =>
      expect((await db.interviewAppointments.toArray())[0]?.confirmed).toBe(true),
    );

    // Dos más en el mismo bloque con el mismo líder; la cuarta se bloquea
    for (const name of ['Luis', 'Marta']) {
      const r = await createEntity('interviewRequests', {
        personName: name,
        receivedAt: Date.now(),
        mustBeWithPresident: false,
        status: 'recibida',
      });
      await scheduleAppointment({
        requestId: r.id,
        leader: 'primer_consejero',
        startsAt: new Date(2030, 2, 4, 20, 25).getTime(),
      });
    }
    cleanup();
    window.history.pushState({}, '', '/entrevistas/nueva');
    render(<App />);
    await user.type(await screen.findByLabelText('Nombre de la persona'), 'Pedro Soto');
    await user.click(screen.getByRole('radio', { name: 'Primer consejero' }));
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2030-03-04' } });
    fireEvent.change(screen.getByLabelText('Hora exacta'), { target: { value: '20:10' } });
    expect(await screen.findByText(/ya tiene 3 entrevistas/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Agendar entrevista' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(await db.interviewAppointments.count()).toBe(3);
  });
});
