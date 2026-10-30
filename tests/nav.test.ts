import { describe, expect, it } from 'vitest';
import { MOBILE_MORE, MOBILE_PRIMARY, MORE_ROUTE, NAV_ITEMS } from '../src/lib/nav';

describe('navegación', () => {
  it('contiene las 8 áreas de la especificación', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      'Inicio',
      'Entrevistas',
      'Reuniones',
      'Seguimientos',
      'Calendario',
      'Plantillas y Manual',
      'Historial y búsqueda',
      'Configuración y respaldos',
    ]);
  });

  it('no repite rutas y ninguna colisiona con la ruta "Más"', () => {
    const routes = NAV_ITEMS.map((i) => i.to);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).not.toContain(MORE_ROUTE);
  });

  it('Entrevistas está en la barra inferior del teléfono', () => {
    expect(MOBILE_PRIMARY.map((i) => i.to)).toContain('/entrevistas');
  });

  it('la barra inferior del teléfono tiene como máximo 5 destinos incluyendo "Más"', () => {
    expect(MOBILE_PRIMARY.length + 1).toBeLessThanOrEqual(5);
    expect(MOBILE_PRIMARY.length + MOBILE_MORE.length).toBe(NAV_ITEMS.length);
  });
});
