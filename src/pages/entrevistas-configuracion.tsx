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
  setPresidencyName,
} from '@/features/interviews/service';
import { usePresidencyNames } from '@/features/interviews/use-interview-data';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const minToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Apellido de quien preside. Se guarda al salir del campo o con Enter. */
function SurnameInput({ leader, saved }: { leader: Leader; saved: string }) {
  const id = `apellido-${leader}`;
  const save = (value: string) => {
    if (value.trim() === saved) return;
    void attempt(() => setPresidencyName(leader, value), { success: 'Apellido guardado' });
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        Apellido
      </label>
      <input
        key={saved}
        id={id}
        className={cn(inputClass, 'w-44')}
        defaultValue={saved}
        maxLength={40}
        placeholder="Ej. Rojas"
        autoComplete="off"
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function OrgRow({ org }: { org: Organization }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <span className="min-w-0 font-medium">
        {org.name}
        <span className="ml-2 text-sm font-normal text-muted">
          {org.category === 'rama' ? 'Rama' : 'Barrio'}
          {org.status === 'archivada' && ' · Archivado'}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <label htmlFor={`mv-${org.id}`} className="sr-only">
          Mover {org.name} a
        </label>
        <select
          id={`mv-${org.id}`}
          className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm"
          value={org.assignedLeader ?? ''}
          onChange={(e) =>
            attempt(() => setOrganizationLeader(org.id, (e.target.value || undefined) as Leader))
          }
        >
          <option value="">Sin asignar</option>
          {LEADERS.map((l) => (
            <option key={l} value={l}>
              {LEADER_LABEL[l]}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            attempt(() =>
              setOrganizationStatus(org.id, org.status === 'activa' ? 'archivada' : 'activa'),
            )
          }
        >
          {org.status === 'activa' ? 'Archivar' : 'Reactivar'}
        </Button>
      </span>
    </li>
  );
}

/** Agrega un barrio o rama directamente a quien lo atiende. Enter lo guarda. */
function QuickAdd({ leader }: { leader?: Leader }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'barrio' | 'rama'>('barrio');
  const id = `nuevo-${leader ?? 'sin'}`;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const created = await attempt(
      () => createOrganization({ name, category, assignedLeader: leader }),
      { success: 'Agregado' },
    );
    if (created) setName('');
  };
  return (
    <form
      onSubmit={add}
      className="mt-3 flex flex-wrap items-end gap-2"
      aria-label="Agregar barrio o rama"
    >
      <div className="min-w-44 flex-1 space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">
          Agregar barrio o rama
        </label>
        <input
          id={id}
          className={inputClass}
          value={name}
          autoComplete="off"
          placeholder="Nombre"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div role="radiogroup" aria-label="Tipo" className="flex gap-1">
        {(['barrio', 'rama'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              'h-11 rounded-xl border px-3 text-sm',
              category === c
                ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg'
                : 'border-border-strong bg-surface',
            )}
          >
            {c === 'barrio' ? 'Barrio' : 'Rama'}
          </button>
        ))}
      </div>
      <Button type="submit" disabled={!name.trim()}>
        <Plus className="size-4" aria-hidden />
        Agregar
      </Button>
    </form>
  );
}

function PresidencyCard() {
  const orgs = useLiveQuery(() => db.organizations.filter(isActive).toArray(), []);
  const names = usePresidencyNames();

  return (
    <Card aria-labelledby="presidencia">
      <CardTitle>
        <span id="presidencia">Presidencia de estaca y barrios</span>
      </CardTitle>
      <p className="mb-4 text-sm text-muted">
        Escribe el apellido de cada uno y agrega debajo los barrios y ramas que atiende. Al elegir
        un barrio en una entrevista, se asigna solo a quien lo atiende.
      </p>
      {orgs === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : (
        <div className="space-y-4">
          {LEADERS.map((l) => {
            const mine = orgs
              .filter((o) => o.assignedLeader === l)
              .sort((a, b) => a.name.localeCompare(b.name, 'es'));
            return (
              <section
                key={l}
                aria-label={LEADER_LABEL[l]}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold">{LEADER_LABEL[l]}</h3>
                  <SurnameInput leader={l} saved={names[l] ?? ''} />
                </div>
                {mine.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">Sin barrios ni ramas asignados.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {mine.map((o) => (
                      <OrgRow key={o.id} org={o} />
                    ))}
                  </ul>
                )}
                <QuickAdd leader={l} />
              </section>
            );
          })}
          {(() => {
            const loose = orgs
              .filter((o) => !o.assignedLeader)
              .sort((a, b) => a.name.localeCompare(b.name, 'es'));
            if (loose.length === 0) return null;
            return (
              <section
                aria-label="Sin asignar"
                className="rounded-xl border border-dashed border-border-strong p-4"
              >
                <h3 className="text-sm font-semibold text-muted">Sin asignar</h3>
                <ul className="mt-2 space-y-1.5">
                  {loose.map((o) => (
                    <OrgRow key={o.id} org={o} />
                  ))}
                </ul>
              </section>
            );
          })()}
        </div>
      )}
    </Card>
  );
}

function AvailabilityCard() {
  const rules = useLiveQuery(() => db.leaderAvailability.filter(isActive).toArray(), []);
  const [leader, setLeader] = useState<Leader>('presidente');
  const [kind, setKind] = useState<'disponible' | 'no_disponible'>('disponible');
  const [scope, setScope] = useState<'semanal' | 'fecha'>('semanal');
  const [weekday, setWeekday] = useState('4');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('20:00');
  const [end, setEnd] = useState('22:00');

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
        Define cuándo entrevista cada uno (por ejemplo, los jueves de 20:00 a 22:00). Cada media
        hora admite hasta 3 entrevistas por líder. Para un día distinto se marca «Día especial» al
        agendar, no hace falta configurarlo aquí.
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
        title="Presidencia y horarios"
        description="Apellidos, barrios que atiende cada uno y cuándo entrevistan."
        actions={
          <Link to="/entrevistas" className={cn(buttonVariants({ variant: 'outline' }))}>
            <ArrowLeft className="size-4" aria-hidden />
            Volver a Entrevistas
          </Link>
        }
      />
      <div className="space-y-5">
        <PresidencyCard />
        <AvailabilityCard />
      </div>
    </>
  );
}
