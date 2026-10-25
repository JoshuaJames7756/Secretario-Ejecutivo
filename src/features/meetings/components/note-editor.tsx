import { SaveStatus } from '@/components/shared/save-status';
import { textareaClass } from '@/components/ui/field';
import { useAutosave } from '@/hooks/use-autosave';
import { cn } from '@/lib/utils';

/**
 * Editor de notas con guardado automático. El texto inicial solo se lee al montar:
 * usa `key` para cambiar de registro.
 */
export function NoteEditor({
  id,
  label,
  initial,
  onSave,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  initial: string;
  onSave: (value: string) => Promise<unknown>;
  placeholder?: string;
  className?: string;
}) {
  const { value, setValue, state, flush } = useAutosave(initial, onSave);

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
      <div id={`${id}-estado`}>
        <SaveStatus state={state} onRetry={() => void flush()} />
      </div>
    </div>
  );
}
