// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { db } from '../src/db/database';
import { createEntity } from '../src/db/repo';
import { resetThemeForTests } from '../src/hooks/use-theme';
import { NAV_ITEMS } from '../src/lib/nav';

// El service worker no existe en las pruebas.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

function stubMatchMedia(prefersDark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(async () => {
  stubMatchMedia(false);
  localStorage.clear();
  resetThemeForTests();
  document.documentElement.classList.remove('dark');
  window.history.pushState({}, '', '/');
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(cleanup);

describe('aplicación', () => {
  it('muestra Inicio con estados vacíos honestos y sin datos inventados', async () => {
    render(<App />);

    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.textContent).toMatch(/^Buen(os días|as tardes|as noches)$/);
    expect(screen.getByText('No hay reuniones programadas')).toBeTruthy();
    expect(screen.getByText(/Todavía no hay respaldos/)).toBeTruthy();
    // El estado de guardado nunca promete respaldo en la nube.
    expect(screen.getAllByText('Guardado en este dispositivo').length).toBeGreaterThan(0);
  });

  it('las acciones que aún no existen aparecen deshabilitadas y con su fase', async () => {
    render(<App />);
    const prepare = await screen.findByRole('button', { name: /Preparar agenda/ });
    expect((prepare as HTMLButtonElement).disabled).toBe(true);
    expect(within(prepare).getByText('Fase 2')).toBeTruthy();
    // La que sí funciona es un enlace real.
    expect(screen.getByRole('link', { name: /Abrir el calendario/ }).getAttribute('href')).toBe(
      '/calendario',
    );
  });

  it('ofrece las 8 áreas en la barra lateral', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Principal' });
    for (const item of NAV_ITEMS) {
      expect(within(sidebar!).getByRole('link', { name: item.label })).toBeTruthy();
    }
  });

  it('navega entre áreas y marca la actual con aria-current', async () => {
    const user = userEvent.setup();
    render(<App />);
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Principal' });

    await user.click(within(sidebar!).getByRole('link', { name: 'Seguimientos' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Seguimientos' })).toBeTruthy();
    expect(
      within(sidebar!).getByRole('link', { name: 'Seguimientos' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('"Más" lista las áreas que no caben en la barra inferior', async () => {
    window.history.pushState({}, '', '/mas');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Más' })).toBeTruthy();
    for (const label of [
      'Entrevistas',
      'Plantillas y Manual',
      'Historial y búsqueda',
      'Configuración y respaldos',
    ]) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
  });

  it('el resumen de Inicio se actualiza solo cuando cambian los datos locales', async () => {
    render(<App />);
    const summary = (await screen.findByText('Asuntos abiertos')).parentElement!;
    await waitFor(() => expect(within(summary).getByText('0')).toBeTruthy());

    await createEntity('followUps', {
      title: 'Preparar informe trimestral',
      kind: 'asignacion',
      status: 'registrado',
    });

    await waitFor(() => expect(within(summary).getByText('1')).toBeTruthy());
  });

  it('el cambio de tema se aplica, se recuerda y es accesible', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/configuracion');
    render(<App />);

    const dark = await screen.findByRole('radio', { name: /Oscuro/ });
    expect(dark.getAttribute('aria-checked')).toBe('false');

    await user.click(dark);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(dark.getAttribute('aria-checked')).toBe('true');

    await user.click(screen.getByRole('radio', { name: /Claro/ }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('todos los componentes comparten el mismo tema (las notificaciones lo siguen)', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/configuracion');
    const { container } = render(<App />);

    await user.click(await screen.findByRole('radio', { name: /Oscuro/ }));

    // Sonner solo dibuja su contenedor cuando hay una notificación visible.
    toast('Prueba de tema');
    await waitFor(() => {
      const toaster = container.ownerDocument.querySelector('[data-sonner-toaster]');
      expect(toaster).not.toBeNull();
      expect(toaster?.getAttribute('data-sonner-theme')).toBe('dark');
    });
  });

  it('Configuración informa honestamente cuando el navegador no expone el almacenamiento', async () => {
    window.history.pushState({}, '', '/configuracion');
    render(<App />);
    expect(await screen.findByText(/no informa del estado del almacenamiento/)).toBeTruthy();
    expect(screen.getByText(/Aún no hay respaldos/)).toBeTruthy();
  });
});
