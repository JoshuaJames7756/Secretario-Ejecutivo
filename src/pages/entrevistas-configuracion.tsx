import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Card, CardTitle, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { Leader, Organization } from '@/db/types';
import { LEADERS, LEADER_LABEL, WEEKDAY_LABEL, WEEKDAY_ORDER } from '@/features/interviews/model';
import {
  addAvailability,
  createOrganization,
  removeAvailability,
  setOrganizationLeader,
  setOrganizationStatus,
} from '@/features/interviews/service';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const minToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function OrganizationsCard() {
  const orgs = useLiveQuery(() => db.organizations.filter(isActive).toArray(), []);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Organization['category']>('barrio');
  const [leader, setLeader] = useState<Leader | ''>('');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const created = await attempt(
      () => createOrganization({ name, category, assignedLeader: leader || undefined }),
      { success: 'Agregado' },
    );
    if (created) {
      setName('');
      setLeader('');
    }
  };

  return (
    <Card aria-labelledby="barrios">
      <CardTitle>
        <span id="barrios">Barrios, ramas y consejero asignado</span>
      </CardTitle>
      <p className="mb-4 text-sm text-muted">
        Con esto la aplicación sugiere con qué consejero coordinar cada solicitud. Siempre puedes
        elegir otro.
      </p>

      {orgs === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : orgs.length === 0 ? (
        <p className="mb-4 text-muted">Todavía no hay barrios ni ramas.</p>
      ) : (
        <ul className="mb-5 space-y-2">
          {orgs
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{o.name}</p>
                  <p className="text-sm text-muted">
                    {o.category === 'barrio' ? 'Barrio' : o.category === 'rama' ? 'Rama' : 'Otro'}
                    {o.status === 'archivada' && ' · Archivado'}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label htmlFor={`l-${o.id}`} className="block text-sm font-medium">
                      Consejero
                    </label>
                    <select
                      id={`l-${o.id}`}
                      className={cn(inputClass, 'min-w-52')}
                      value={o.assignedLeader ?? ''}
                      onChange={(e) =>
                        attempt(() =>
                          setOrganizationLeader(o.id, (e.target.value || undefined) as Leader),
                        )
                      }
                    >
                      <option value="">Sin asignar</option>
                      {LEADERS.map((l) => (
                        <option key={l} value={l}>
                          {LEADER_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      attempt(() =>
                        setOrganizationStatus(o.id, o.status === 'activa' ? 'archivada' : 'activa'),
                      )
                    }
                  >
                    {o.status === 'activa' ? 'Archivar' : 'Reactivar'}
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}

      <form
        onSubmit={add}
        className="grid gap-3 sm:grid-cols-4 sm:items-end"
        aria-label="Agregar barrio o rama"
      >
        <Field label="Nombre" htmlFor="org-nombre" className="sm:col-span-2">
          <input
            id="org-nombre"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Tipo" htmlFor="org-tipo">
          <select
            id="org-tipo"
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as Organization['category'])}
          >
            <option value="barrio">Barrio</option>
            <option value="rama">Rama</option>
          </select>
        </Field>
        <Field label="Consejero" htmlFor="org-lider">
          <select
            id="org-lider"
            className={inputClass}
            value={leader}
            onChange={(e) => setLeader(e.target.value as Leader | '')}
          >
            <option value="">Sin asignar</option>
            {LEADERS.map((l) => (
              <option key={l} value={l}>
                {LEADER_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={!name.trim()} className="sm:col-span-4 sm:w-fit">
          <Plus className="size-4" aria-hidden />
          Agregar
        </Button>
      </form>
    </Card>
  );
}

function AvailabilityCard() {
  const rules = useLiveQuery(() => db.leaderAvailability.filter(isActive).toArray(), []);
  const [leader, setLeader] = useState<Leader>('presidente');
  const [kind, setKind] = useState<'disponible' | 'no_disponible'>('disponible');
  const [scope, setScope] = useState<'semanal' | 'fecha'>('semanal');
  const [weekday, setWeekday] = useState('1');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    await attempt(
      () =>
        addAvailability({
          leader,
          kind,
          weekday: scope === 'semanal' ? Number(weekday) : undefined,
          date: scope === 'fecha' ? date : undefined,
          startMin: timeToMin(start),
          endMin: timeToMin(end),
        }),
      { success: 'Horario agregado' },
    );
  };

  return (
    <Card aria-labelledby="disponibilidad">
      <CardTitle>
        <span id="disponibilidad">Disponibilidad de los líderes</span>
      </CardTitle>
      <p className="mb-4 text-sm text-muted">
        Define bloques semanales disponibles y excepciones. Si un líder no tiene bloques
        disponibles, la aplicación no restringe sus horarios (solo evita citas simultáneas).
      </p>

      {rules === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : (
        <div className="mb-5 space-y-4">
          {LEADERS.map((l) => {
            const mine = rules.filter((r) => r.leader === l);
            return (
              <section key={l} aria-label={LEADER_LABEL[l]}>
                <h3 className="mb-1.5 text-sm font-semibold">{LEADER_LABEL[l]}</h3>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted">Sin horarios configurados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {mine
                      .sort(
                        (a, b) =>
                          (a.date ?? '').localeCompare(b.date ?? '') ||
                          WEEKDAY_ORDER.indexOf(a.weekday ?? 0) -
                            WEEKDAY_ORDER.indexOf(b.weekday ?? 0) ||
                          a.startMin - b.startMin,
                      )
                      .map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={r.kind === 'disponible' ? 'success' : 'danger'}>
                              {r.kind === 'disponible' ? 'Disponible' : 'No disponible'}
                            </Badge>
                            {r.date
                              ? `El ${r.date}`
                              : `Cada ${WEEKDAY_LABEL[r.weekday ?? 0]?.toLowerCase()}`}
                            , {minToTime(r.startMin)} a {minToTime(r.endMin)}
                          </span>
                          <ConfirmButton
                            ariaLabel={`Quitar horario de ${LEADER_LABEL[l]}`}
                            confirmLabel="Quitar"
                            onConfirm={() => attempt(() => removeAvailability(r.id))}
                          >
                            Quitar
                          </ConfirmButton>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <form
        onSubmit={add}
        className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3"
        aria-label="Agregar horario"
      >
        <Field label="Líder" htmlFor="disp-lider">
          <select
            id="disp-lider"
            className={inputClass}
            value={leader}
            onChange={(e) => setLeader(e.target.value as Leader)}
          >
            {LEADERS.map((l) => (
              <option key={l} value={l}>
                {LEADER_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo" htmlFor="disp-tipo">
          <select
            id="disp-tipo"
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="disponible">Disponible</option>
            <option value="no_disponible">No disponible</option>
          </select>
        </Field>
        <Field label="Se repite" htmlFor="disp-alcance">
          <select
            id="disp-alcance"
            className={inputClass}
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="semanal">Cada semana</option>
            <option value="fecha">Una fecha concreta</option>
          </select>
        </Field>
        {scope === 'semanal' ? (
          <Field label="Día" htmlFor="disp-dia">
            <select
              id="disp-dia"
              className={inputClass}
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
            >
              {WEEKDAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Fecha" htmlFor="disp-fecha">
            <input
              id="disp-fecha"
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        )}
        <Field label="Desde" htmlFor="disp-desde">
          <input
            id="disp-desde"
            type="time"
            className={inputClass}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Hasta" htmlFor="disp-hasta">
          <input
            id="disp-hasta"
            type="time"
            className={inputClass}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          disabled={scope === 'fecha' && !date}
          className="sm:col-span-3 sm:w-fit"
        >
          <Plus className="size-4" aria-hidden />
          Agregar horario
        </Button>
      </form>
    </Card>
  );
}

export default function EntrevistasConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Barrios y disponibilidad"
        description="Configuración de la coordinación de entrevistas."
        actions={
          <Link to="/entrevistas" className={cn(buttonVariants({ variant: 'outline' }))}>
            <ArrowLeft className="size-4" aria-hidden />
            Volver a Entrevistas
          </Link>
        }
      />
      <div className="space-y-5">
        <OrganizationsCard />
        <AvailabilityCard />
      </div>
    </>
  );
}
