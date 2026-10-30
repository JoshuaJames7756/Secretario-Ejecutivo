import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { Leader } from '@/db/types';
import { PRESIDENCY_SETTING_KEY, type PresidencyNames } from './model';

/** Apellidos de la presidencia de estaca (configurables). Vacío mientras no se escriban. */
export function usePresidencyNames(): PresidencyNames {
  return (
    useLiveQuery(async () => {
      const row = await db.settings.get(PRESIDENCY_SETTING_KEY);
      return (row?.value as PresidencyNames | undefined) ?? {};
    }, []) ?? {}
  );
}

/** Disponibilidad y citas de un líder, para calcular bloques y choques. */
export function useLeaderSlotData(leader: Leader) {
  return useLiveQuery(async () => {
    const [rules, appointments] = await Promise.all([
      db.leaderAvailability.where('leader').equals(leader).filter(isActive).toArray(),
      db.interviewAppointments
        .where('[leader+startsAt]')
        .between([leader, Dexie.minKey], [leader, Dexie.maxKey])
        .filter(isActive)
        .toArray(),
    ]);
    return { rules, appointments };
  }, [leader]);
}

/** Última hora usada al agendar (HH:mm), para repetirla con un toque. */
export function useLastTime(): string | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get('interviews.lastTime');
    return typeof row?.value === 'string' ? row.value : undefined;
  }, []);
}
