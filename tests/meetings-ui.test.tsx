// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { db } from '../src/db/database';
import { createEntity } from '../src/db/repo';
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
});
