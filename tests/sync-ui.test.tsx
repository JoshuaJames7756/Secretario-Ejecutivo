// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { createEntity, syncKey, updateEntity } from '../src/db/repo';
import { setAuthBridge } from '../src/features/sync/controller';
import { describePhase } from '../src/features/sync/use-sync-status';
import SincronizacionPage from '../src/pages/sincronizacion';

const base = {
  configured: true,
  auth: 'con-sesion' as const,
  running: false,
  pending: 0,
  conflicts: 0,
  failed: 0,
};

describe('estado de sincronización (texto para personas)', () => {
  it('sin configurar: lo local, sin prometer nube', () => {
    expect(describePhase({ ...base, configured: false })).toEqual({
      phase: 'desactivada',
      label: 'Guardado en este dispositivo',
    });
  });

  it('sin sesión: solo en este dispositivo', () => {
    expect(describePhase({ ...base, auth: 'sin-sesion' }).phase).toBe('sin-sesion');
    expect(describePhase({ ...base, auth: 'desconocida' }).phase).toBe('sin-sesion');
  });

  it('cuenta ajena: aviso de no autorizada', () => {
    expect(describePhase({ ...base, auth: 'no-autorizada' }).phase).toBe('no-autorizada');
  });

  it('prioridad: conflicto > sincronizando > error > sin conexión > pendiente > al día', () => {
    expect(describePhase({ ...base, conflicts: 2, running: true }).label).toBe(
      '2 conflictos por resolver',
    );
    expect(describePhase({ ...base, conflicts: 1 }).label).toBe('1 conflicto por resolver');
    expect(describePhase({ ...base, running: true, failed: 1 }).phase).toBe('sincronizando');
    expect(describePhase({ ...base, failed: 1, error: 'x', pending: 3 }).phase).toBe('error');
    expect(describePhase({ ...base, error: 'x', pending: 3 }).phase).toBe('sin-conexion');
    expect(describePhase({ ...base, pending: 3 }).label).toBe('3 cambios por enviar');
    expect(describePhase({ ...base, pending: 1 }).label).toBe('1 cambio por enviar');
    expect(describePhase(base)).toEqual({ phase: 'sincronizado', label: 'Sincronizado' });
  });
});

describe('pantalla de sincronización', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
    setAuthBridge(null);
  });
  afterEach(() => {
    cleanup();
    setAuthBridge(null);
  });

  const open = () =>
    render(
      <MemoryRouter>
        <SincronizacionPage />
      </MemoryRouter>,
    );

  it('sin configurar explica que todo funciona en este dispositivo', async () => {
    open();
    expect(await screen.findByText(/no está activada en esta versión/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sincronizar ahora/i })).toBeNull();
  });

  it('muestra el conflicto con los dos lados y permite elegir', async () => {
    const rec = await createEntity('records', {
      meetingId: 'm-1',
      type: 'nota',
      content: 'versión de este dispositivo',
      isPrivate: false,
    });
    await updateEntity('records', rec.id, { content: 'versión de este dispositivo' });
    await db.syncConflicts.put({
      id: syncKey('records', rec.id),
      entity: 'records',
      entityId: rec.id,
      local: { ...rec, content: 'versión de este dispositivo' },
      server: { ...rec, rev: 5, content: 'versión del servidor' },
      detectedAt: Date.now(),
    });
    open();
    expect(await screen.findByText('Conflicto')).toBeTruthy();
    expect(screen.getByText('versión del servidor')).toBeTruthy();
    expect(screen.getByRole('button', { name: /conservar ambas/i })).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: /conservar la de este dispositivo/i }),
    );
    await waitFor(async () => expect(await db.syncConflicts.count()).toBe(0));
    expect((await db.records.get(rec.id))?.rev).toBeGreaterThan(5);
  });
});
