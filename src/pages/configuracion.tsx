import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Monitor, Moon, ShieldAlert, ShieldCheck, Sun, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardTitle, PageHeader, PhaseTag } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { db } from '@/db/database';
import { ENTITY_NAMES } from '@/db/repo';
import { BackupCard } from '@/features/backup/components/backup-card';
import { useStorageStatus } from '@/hooks/use-storage-status';
import { useTheme, type ThemePreference } from '@/hooks/use-theme';
import { APP_PHASE, APP_VERSION } from '@/lib/constants';
import { formatBytes } from '@/lib/storage';
import { cn } from '@/lib/utils';

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Automático', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

function ThemeCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card aria-labelledby="tema">
      <CardTitle>
        <span id="tema">Tema</span>
      </CardTitle>
      <div role="radiogroup" aria-labelledby="tema" className="grid grid-cols-3 gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary-soft text-primary-soft-fg'
                  : 'border-border-strong bg-surface text-fg hover:bg-surface-2',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {label}
              </span>
              {selected && <Check className="size-3.5" aria-label="Seleccionado" />}
            </button>
          );
        })}
      </div>
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
