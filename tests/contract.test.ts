import { describe, expect, it } from 'vitest';
import { ENTITY_NAMES } from '@/db/repo';
import { SYNC_ENTITIES } from '../shared/contract';

describe('contrato de sincronización', () => {
  it('las entidades del servidor son exactamente las tablas de negocio de la app', () => {
    expect([...SYNC_ENTITIES].sort()).toEqual([...ENTITY_NAMES].sort());
  });
});
