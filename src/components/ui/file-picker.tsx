import { FileUp } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * Selector de archivo con diseño propio. El control nativo sigue ahí (oculto, pero enfocable con
 * teclado y leído por lectores de pantalla); la zona visible acepta toque, clic y arrastrar.
 */
export function FilePicker({
  id,
  label,
  hint,
  accept,
  fileName,
  onFile,
  multiple = false,
}: {
  id: string;
  label: string;
  hint?: string;
  accept?: string;
  /** Nombre del archivo ya elegido, para mostrarlo. */
  fileName?: string;
  onFile: (files: File[]) => void;
  multiple?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFile(multiple ? files : files.slice(0, 1));
  };

  return (
    <div>
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="peer sr-only"
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFile(files);
          event.target.value = ''; // permite elegir el mismo archivo otra vez
        }}
      />
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
          dragging
            ? 'border-primary bg-primary-soft'
            : 'border-border-strong bg-surface-2 hover:border-primary hover:bg-primary-soft',
        )}
      >
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-fg"
        >
          <FileUp className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{fileName ? fileName : label}</span>
          <span className="block text-sm text-muted">
            {fileName ? 'Toca para elegir otro archivo' : 'Toca aquí o arrastra el archivo'}
          </span>
        </span>
      </label>
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
