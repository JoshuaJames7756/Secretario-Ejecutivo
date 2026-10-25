import { useLiveQuery } from 'dexie-react-hooks';
import { History } from 'lucide-react';
import { useState } from 'react';
import { SaveStatus } from '@/components/shared/save-status';
import { Button } from '@/components/ui/button';
import { textareaClass } from '@/components/ui/field';
import type { Id } from '@/db/types';
import { useAutosave } from '@/hooks/use-autosave';
import { listVersions, snapshotNow, type VersionedEntity } from '@/features/versions/service';
import { attempt } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';

function preview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
}

/**
 * Editor de notas con guardado automático. El texto inicial solo se lee al montar:
 * usa `key` para cambiar de registro. Con `versionsFor` ofrece recuperar textos anteriores.
 */
export function NoteEditor({
  id,
  label,
  initial,
  onSave,
  placeholder,
  className,
  versionsFor,
}: {
  id: string;
  label: string;
  initial: string;
  onSave: (value: string) => Promise<unknown>;
  placeholder?: string;
  className?: string;
  versionsFor?: { entity: VersionedEntity; entityId: Id };
}) {
  const { value, setValue, state, flush } = useAutosave(initial, onSave);
  const [showVersions, setShowVersions] = useState(false);
  const versions = useLiveQuery(
    () =>
      versionsFor && showVersions ? listVersions(versionsFor.entity, versionsFor.entityId) : [],
    [versionsFor?.entity, versionsFor?.entityId, showVersions],
  );

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        className={cn(textareaClass, 'min-h-32', className)}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void flush()}
        aria-describedby={`${id}-estado`}
      />
      <div id={`${id}-estado`} className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus state={state} onRetry={() => void flush()} />
        {versionsFor && (
          <Button variant="ghost" size="sm" onClick={() => setShowVersions((v) => !v)}>
            <History className="size-4" aria-hidden />
            {showVersions ? 'Ocultar versiones' : 'Versiones anteriores'}
          </Button>
        )}
      </div>
      {versionsFor && showVersions && (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          {versions === undefined ? (
            <p role="status" className="text-sm text-muted">
              Cargando…
            </p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay versiones anteriores. Se guardan automáticamente cuando el texto cambia
              mucho o pasa un rato.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 text-sm">
                    <span className="block text-muted">{formatDateTime(v.at)}</span>
                    <span className="block">{preview(v.content)}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // El texto actual queda como versión antes de reemplazarlo.
                      await attempt(() =>
                        snapshotNow(versionsFor.entity, versionsFor.entityId, value),
                      );
                      setValue(v.content);
                      void flush();
                    }}
                  >
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Restaurar reemplaza el texto actual, que a su vez queda guardado como versión anterior.
          </p>
        </div>
      )}
    </div>
  );
}
