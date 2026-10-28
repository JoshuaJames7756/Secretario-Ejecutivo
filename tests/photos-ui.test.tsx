// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { FilePicker } from '../src/components/ui/file-picker';
import { PhotosPanel } from '../src/features/attachments/components/photos-panel';
import ConfiguracionPage from '../src/pages/configuracion';

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
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(cleanup);

describe('interfaz de fotos y selectores', () => {
  it('sin fotos: invita a tomar una y deja claro que son locales', async () => {
    render(<PhotosPanel meetingId="m-1" />);
    expect(await screen.findByText(/Todavía no hay fotos/)).toBeTruthy();
    expect(screen.getByText('Tomar foto')).toBeTruthy();
    expect(screen.getByText('Elegir de la galería')).toBeTruthy();
    expect(screen.getByText(/solo en este dispositivo/)).toBeTruthy();
    const camera = document.getElementById('foto-camara-m-1') as HTMLInputElement;
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(camera.accept).toBe('image/*');
  });

  it('el selector de archivo muestra el nombre elegido y sigue siendo accesible', () => {
    render(
      <FilePicker id="x" label="Elegir el archivo" fileName="respaldo.json" onFile={() => {}} />,
    );
    expect(screen.getByText('respaldo.json')).toBeTruthy();
    expect(screen.getByText('Toca para elegir otro archivo')).toBeTruthy();
    expect(screen.getByLabelText(/respaldo\.json/)).toBeTruthy();
  });

  it('el selector de tema es un grupo de opciones con una sola elegida', async () => {
    render(
      <MemoryRouter>
        <ConfiguracionPage />
      </MemoryRouter>,
    );
    const options = await screen.findAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(options.filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });
});
