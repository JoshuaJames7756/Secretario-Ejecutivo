import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  FilePlus2,
  ListPlus,
  NotebookPen,
  Paperclip,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useMemo, type ComponentType } from 'react';
import { Link } from 'react-router';
import { Card, CardTitle, EmptyState, PageHeader, PhaseTag } from '@/components/shared/page';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { SETTING_KEYS } from '@/db/settings';
import { useStorageStatus } from '@/hooks/use-storage-status';
import { cn, formatDateLong, formatDateTime, greeting } from '@/lib/utils';

const CLOSED_FOLLOW_UPS = ['completado', 'cerrado_sin_completar'];
const PENDING_INTERVIEWS = ['recibida', 'pendiente_coordinacion'];

interface QuickAction {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  to?: string;
  phase?: number;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Abrir el calendario', icon: CalendarDays, to: '/calendario' },
  { label: 'Preparar agenda', icon: FilePlus2, phase: 2 },
  { label: 'Registrar nota', icon: NotebookPen, phase: 2 },
  { label: 'Crear asunto pendiente', icon: ListPlus, phase: 2 },
  { label: 'Registrar asignación', icon: CalendarPlus, phase: 2 },
  { label: 'Programar entrevista', icon: UserPlus, phase: 3 },
  { label: 'Adjuntar documento', icon: Paperclip, phase: 5 },
];

function Count({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div>
      <p className="font-display text-4xl font-semibold tabular-nums">{value ?? '–'}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

export default function InicioPage() {
  const now = useMemo(() => new Date(), []);
  const { status } = useStorageStatus();

  const nextMeeting = useLiveQuery(
    () =>
      db.meetings
        .where('startsAt')
        .aboveOrEqual(Date.now())
        .filter((m) => m.deletedAt === undefined && m.status === 'programada')
        .first(),
    [],
  );

  const openFollowUps = useLiveQuery(
    () =>
      db.followUps
        .filter((f) => f.deletedAt === undefined && !CLOSED_FOLLOW_UPS.includes(f.status))
        .count(),
    [],
  );

  const pendingInterviews = useLiveQuery(
    () =>
      db.interviewRequests
        .filter((r) => r.deletedAt === undefined && PENDING_INTERVIEWS.includes(r.status))
        .count(),
    [],
  );

  const lastBackupAt = useLiveQuery(
    async () => (await db.settings.get(SETTING_KEYS.lastBackupAt))?.value as number | undefined,
    [],
  );

  return (
    <>
      <PageHeader eyebrow={formatDateLong(now)} title={greeting(now)} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card aria-labelledby="proxima-reunion">
            <CardTitle>
              <span id="proxima-reunion">Próxima reunión</span>
            </CardTitle>
            {nextMeeting ? (
              <div>
                <p className="font-display text-2xl font-semibold">{nextMeeting.title}</p>
                <p className="mt-1 text-muted">{formatDateTime(nextMeeting.startsAt)}</p>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No hay reuniones programadas"
                description="Cuando programes reuniones desde el calendario, la siguiente aparecerá aquí con acceso directo a su agenda."
                phase={2}
              />
            )}
          </Card>

          <Card aria-labelledby="acciones-rapidas">
            <CardTitle>
              <span id="acciones-rapidas">Acciones rápidas</span>
            </CardTitle>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK_ACTIONS.map(({ label, icon: Icon, to, phase }) => (
                <li key={label}>
                  {to ? (
                    <Link
                      to={to}
                      className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'w-full justify-start',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'w-full justify-between',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </span>
                      {phase !== undefined && <PhaseTag phase={phase} />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card aria-labelledby="resumen">
            <CardTitle>
              <span id="resumen">Resumen</span>
            </CardTitle>
            <div className="grid grid-cols-2 gap-4">
              <Count value={openFollowUps} label="Asuntos abiertos" />
              <Count value={pendingInterviews} label="Entrevistas por coordinar" />
            </div>
          </Card>

          <Card aria-labelledby="estado-dispositivo">
            <CardTitle>
              <span id="estado-dispositivo">Estado de tus datos</span>
            </CardTitle>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="font-medium">Sincronización</dt>
                  <dd className="text-muted">
                    No configurada. Los datos viven solo en este dispositivo.
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="font-medium">Último respaldo</dt>
                  <dd className="text-muted">
                    {lastBackupAt
                      ? formatDateTime(lastBackupAt)
                      : 'Todavía no hay respaldos. La exportación llega en la Fase 2.'}
                  </dd>
                </div>
              </div>
              {status?.persisted === false && (
                <div className="rounded-xl bg-warning-soft p-3 text-warning">
                  El navegador aún no protege estos datos frente a limpiezas de almacenamiento.{' '}
                  <Link to="/configuracion" className="font-medium underline underline-offset-2">
                    Revisar en Configuración
                  </Link>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
