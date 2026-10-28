import { useLiveQuery } from 'dexie-react-hooks';
import { Monitor, Moon, ShieldAlert, ShieldCheck, Sun, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle, PageHeader, PhaseTag } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { db } from '@/db/database';
import { ENTITY_NAMES } from '@/db/repo';
import { Link } from 'react-router';
import { useSyncStatus } from '@/features/sync/use-sync-status';
import { BackupCard } from '@/features/backup/components/backup-card';
import { useStorageStatus } from '@/hooks/use-storage-status';
import { useTheme, type ThemePreference } from '@/hooks/use-theme';
import { APP_PHASE, APP_VERSION } from '@/lib/constants';
import { formatBytes } from '@/lib/storage';
import { cn } from '@/lib/utils';

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon; hint: string }[] = [
  { value: 'system', label: 'Automático', icon: Monitor, hint: 'Sigue al teléfono' },
  { value: 'light', label: 'Claro', icon: Sun, hint: 'Fondo blanco' },
  { value: 'dark', label: 'Oscuro', icon: Moon, hint: 'Fondo oscuro' },
];

const PREVIEW_LIGHT = { bg: '#f6f7fb', bar: '#12296b', line: '#c9d0e4' };
const PREVIEW_DARK = { bg: '#0a0f1f', bar: '#7da2ff', line: '#2a3558' };

function MiniScreen({ colors }: { colors: typeof PREVIEW_LIGHT }) {
  return (
    <span className="flex h-full w-full flex-col gap-1 p-1.5" style={{ background: colors.bg }}>
      <span className="h-1.5 w-1/2 rounded-full" style={{ background: colors.bar }} />
      <span className="h-1 w-full rounded-full" style={{ background: colors.line }} />
      <span className="h-1 w-3/4 rounded-full" style={{ background: colors.line }} />
    </span>
  );
}

/** Vista previa dibujada con CSS: se entiende el tema sin leer. Colores fijos a propósito. */
function ThemePreview({ value }: { value: ThemePreference }) {
  return (
    <span
      aria-hidden
      className="relative block h-14 w-full overflow-hidden rounded-lg border border-border"
    >
      {value === 'system' ? (
        <>
          <span className="absolute inset-0">
            <MiniScreen colors={PREVIEW_LIGHT} />
          </span>
          <span
            className="absolute inset-0"
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
          >
            <MiniScreen colors={PREVIEW_DARK} />
          </span>
        </>
      ) : (
        <MiniScreen colors={value === 'light' ? PREVIEW_LIGHT : PREVIEW_DARK} />
      )}
    </span>
  );
}

function ThemeCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card aria-labelledby="tema">
      <CardTitle>
        <span id="tema">Tema</span>
      </CardTitle>
      <div role="radiogroup" aria-labelledby="tema" className="grid grid-cols-3 gap-2.5">
        {THEMES.map(({ value, label, icon: Icon, hint }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-all',
                selected
                  ? 'border-primary bg-primary-soft shadow-sm'
                  : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
              )}
            >
              <ThemePreview value={value} />
              <span className="flex items-center justify-between gap-1 px-0.5">
                <span className="min-w-0">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-sm',
                      selected ? 'font-semibold text-primary-soft-fg' : 'font-medium',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </span>
                  <span className="hidden text-xs text-muted sm:block">{hint}</span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full border-2',
                    selected ? 'border-primary' : 'border-border-strong',
                  )}
                >
                  {selected && <span className="size-2 rounded-full bg-primary" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function SyncCard() {
  const status = useSyncStatus();
  return (
    <Card aria-labelledby="sync">
      <CardTitle>
        <span id="sync">Sincronización</span>
      </CardTitle>
      <p className="text-sm text-muted">Estado actual: {status.label}.</p>
      <Link to="/sincronizacion" className="mt-3 inline-block text-sm font-medium underline">
        Abrir sincronización
      </Link>
    </Card>
  );
}

function StorageCard() {
  const { status, request } = useStorageStatus();

  const onRequest = async () => {
    const granted = await request();
    if (granted) {
      toast.success('Los datos quedaron protegidos en este dispositivo');
    } else {
      toast.warning('El navegador no concedió la protección', {
        description:
          'Chrome decide según el uso. Instalar la app en la pantalla de inicio y abrirla con frecuencia ayuda. Mientras tanto, usa los respaldos.',
      });
    }
  };

  const usageText =
    status?.usage !== undefined && status.quota !== undefined
      ? `${formatBytes(status.usage)} usados de ${formatBytes(status.quota)} disponibles`
      : 'No disponible en este navegador';

  return (
    <Card aria-labelledby="almacenamiento">
      <CardTitle>
        <span id="almacenamiento">Almacenamiento en este dispositivo</span>
      </CardTitle>

      {status === undefined ? (
        <p className="text-sm text-muted">Comprobando…</p>
      ) : !status.supported ? (
        <p className="text-sm text-muted">
          Este navegador no informa del estado del almacenamiento.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {status.persisted ? (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            )}
            <div>
              <p className="font-medium">
                {status.persisted ? 'Datos protegidos' : 'Datos sin protección reforzada'}
              </p>
              <p className="text-sm text-muted">
                {status.persisted
                  ? 'El navegador no los borrará automáticamente por falta de espacio.'
                  : 'Si el teléfono se queda sin espacio, el navegador podría limpiarlos. Genera respaldos con regularidad.'}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted">{usageText}</p>
          {!status.persisted && (
            <Button variant="outline" onClick={onRequest}>
              Solicitar protección
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function DatabaseCard() {
  const counts = useLiveQuery(async () => {
    const entries = await Promise.all(
      ENTITY_NAMES.map(async (name) => {
        const total = await db
          .table(name)
          .filter((e) => e.deletedAt === undefined)
          .count();
        return [name, total] as const;
      }),
    );
    return entries.reduce((sum, [, n]) => sum + n, 0);
  }, []);
  const pendingOps = useLiveQuery(() => db.syncOps.where('status').equals('pendiente').count(), []);

  return (
    <Card aria-labelledby="base-datos">
      <CardTitle>
        <span id="base-datos">Base de datos local</span>
      </CardTitle>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Registros activos</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">{counts ?? '–'}</dd>
        </div>
        <div>
          <dt className="text-muted">Cambios sin sincronizar</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">{pendingOps ?? '–'}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">Esquema local versión {db.verno}.</p>
    </Card>
  );
}

function FuturePlanCard({ title, text, phase }: { title: string; text: string; phase: number }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted">{text}</p>
        </div>
        <PhaseTag phase={phase} />
      </div>
    </Card>
  );
}

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Configuración y respaldos"
        description="Cómo se guardan tus datos en este dispositivo y cómo se ve la aplicación."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <ThemeCard />
        <SyncCard />
        <StorageCard />
        <DatabaseCard />
        <BackupCard />
        <FuturePlanCard
          title="Sincronización entre dispositivos"
          text="Cuenta privada, cola de cambios y resolución de conflictos."
          phase={4}
        />
        <Card>
          <h2 className="font-medium">Acerca de</h2>
          <p className="mt-1 text-sm text-muted">
            Versión {APP_VERSION} · {APP_PHASE}
          </p>
        </Card>
      </div>
    </>
  );
}
