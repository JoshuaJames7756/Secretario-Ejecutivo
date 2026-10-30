import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { reasonLabel } from './model';
import { treatmentAbbr, type SummaryDay } from './day-summary';

/** Entrevistas programadas de `days` días seguidos desde una fecha (hora local). */
export function useDaysEntries(dateKey: string, days = 1): SummaryDay[] | undefined {
  return useLiveQuery(async () => {
    const start = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(start.getTime())) return [];
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const appointments = await db.interviewAppointments
      .where('startsAt')
      .between(start.getTime(), end.getTime(), true, false)
      .filter((a) => isActive(a) && a.status === 'programada')
      .toArray();
    const requests = await db.interviewRequests.bulkGet(appointments.map((a) => a.requestId));
    const orgs = await db.organizations.toArray();
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const out: SummaryDay[] = Array.from({ length: days }, (_, i) => {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      return { day, entries: [] };
    });
    appointments.forEach((a, i) => {
      const r = requests[i];
      if (!r || !isActive(r)) return;
      const index = Math.floor((a.startsAt - start.getTime()) / 86_400_000);
      const bucket =
        out.find((d) => d.day.toDateString() === new Date(a.startsAt).toDateString()) ?? out[index];
      bucket?.entries.push({
        id: a.id,
        startsAt: a.startsAt,
        name: `${treatmentAbbr(r.treatment)} ${r.personName}`,
        organization: r.organizationId ? orgName.get(r.organizationId) : undefined,
        reason: reasonLabel(r),
        leader: a.leader,
        modality: r.modality ?? 'presencial',
        confirmed: a.confirmed === true,
        special: a.special === true,
      });
    });
    return out;
  }, [dateKey, days]);
}
