import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Download, Images, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import type { Attachment, Id } from '@/db/types';
import { attempt, describeError } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';
import { addPhoto, listPhotos, removePhoto, renamePhoto } from '../service';

/** URL temporal para mostrar una foto guardada. Se libera al dejar de mostrarla. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(
    () =>
      blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : undefined,
    [blob],
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function Thumb({ photo, onOpen }: { photo: Attachment; onOpen: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir foto: ${photo.title}`}
        className="group block w-full overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-shadow hover:shadow-card"
      >
        <span className="block aspect-[4/3] overflow-hidden bg-surface-2">
          {url ? (
            <img
              src={url}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <span className="grid size-full place-items-center text-sm text-muted">Sin vista</span>
          )}
        </span>
        <span className="block truncate px-2.5 py-2 text-sm font-medium">{photo.title}</span>
      </button>
    </li>
  );
}

function Viewer({ photo, onClose }: { photo: Attachment; onClose: () => void }) {
  const url = useObjectUrl(photo.blob);
  const [title, setTitle] = useState(photo.title);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await attempt(() => renamePhoto(photo.id, title), { success: 'Nombre guardado.' });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto: ${photo.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 md:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2 text-white">
        <p className="text-sm opacity-80">Guardada el {formatDateTime(photo.createdAt)}</p>
        <Button variant="secondary" size="sm" onClick={onClose} aria-label="Cerrar foto" autoFocus>
          <X className="size-4" aria-hidden />
          Cerrar
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center">
        {url ? (
          <img
            src={url}
            alt={photo.title}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-white">No se puede mostrar esta foto.</p>
        )}
      </div>

      <div className="mt-3 space-y-3 rounded-xl bg-surface p-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="foto-nombre" className="mb-1 block text-sm font-medium">
              Nombre de la foto
            </label>
            <input
              id="foto-nombre"
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={!title.trim() || title === photo.title}
          >
            Guardar nombre
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <a
              href={url}
              download={photo.fileName}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <Download className="size-4" aria-hidden />
              Descargar
            </a>
          )}
          <ConfirmButton
            ariaLabel={`Eliminar foto ${photo.title}`}
            confirmLabel="Eliminar foto"
            onConfirm={async () => {
              const done = await attempt(() => removePhoto(photo.id), {
                success: 'Foto eliminada. Se puede recuperar durante 30 días.',
              });
              if (done !== undefined) onClose();
            }}
          >
            Eliminar
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Fotos de una reunión (por ejemplo, la pizarra). Se guardan en este dispositivo, ya reducidas,
 * y entran en el respaldo cifrado. Todavía no se sincronizan con el servidor.
 */
export function PhotosPanel({ meetingId, agendaItemId }: { meetingId: Id; agendaItemId?: Id }) {
  const photos = useLiveQuery(() => listPhotos(meetingId), [meetingId]);
  const [openId, setOpenId] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = photos?.find((p) => p.id === openId);

  const upload = async (files: File[]) => {
    setBusy(true);
    let saved = 0;
    for (const file of files) {
      try {
        await addPhoto(meetingId, file, { agendaItemId });
        saved += 1;
      } catch (error) {
        toast.error(`${file.name || 'Foto'}: ${describeError(error)}`);
      }
    }
    setBusy(false);
    if (saved > 0) toast.success(saved === 1 ? 'Foto guardada.' : `${saved} fotos guardadas.`);
  };

  const inputProps = {
    type: 'file' as const,
    accept: 'image/*',
    className: 'peer sr-only',
    disabled: busy,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span>
          <input
            id={`foto-camara-${meetingId}`}
            {...inputProps}
            capture="environment"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void upload(files);
            }}
          />
          <label
            htmlFor={`foto-camara-${meetingId}`}
            className={cn(
              buttonVariants(),
              'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            <Camera className="size-4" aria-hidden />
            Tomar foto
          </label>
        </span>
        <span>
          <input
            id={`foto-galeria-${meetingId}`}
            {...inputProps}
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void upload(files);
            }}
          />
          <label
            htmlFor={`foto-galeria-${meetingId}`}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            <Images className="size-4" aria-hidden />
            Elegir de la galería
          </label>
        </span>
        {busy && (
          <p role="status" className="self-center text-sm text-muted">
            Guardando…
          </p>
        )}
      </div>

      {photos === undefined ? (
        <p role="status" className="text-muted">
          Cargando fotos…
        </p>
      ) : photos.length === 0 ? (
        <p className="text-muted">
          Todavía no hay fotos. Toma una de la pizarra o elige una de tu galería.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <Thumb key={photo.id} photo={photo} onOpen={() => setOpenId(photo.id)} />
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Las fotos se guardan solo en este dispositivo, reducidas para ocupar poco, y entran en tu
        respaldo cifrado. Todavía no se sincronizan con otros dispositivos.
      </p>

      {opened && <Viewer key={opened.id} photo={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
