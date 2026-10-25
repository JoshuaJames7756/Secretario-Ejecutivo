import { toast } from 'sonner';
import { LocalSaveError, RevisionConflictError } from '@/db/repo';

/** Mensaje comprensible para mostrar a la persona. Nunca expone detalles técnicos. */
export function describeError(error: unknown): string {
  if (error instanceof LocalSaveError || error instanceof RevisionConflictError) {
    return error.message;
  }
  // Errores de la aplicación (ValidationError, transiciones, plantilla oficial...) ya traen
  // un mensaje escrito para personas.
  if (error instanceof Error && error.name !== 'Error' && error.message) return error.message;
  return 'Algo salió mal. Tu información no se perdió; inténtalo de nuevo.';
}

/**
 * Ejecuta una acción y avisa del resultado. Devuelve `undefined` si falló, así el llamador
 * puede decidir no navegar ni cerrar el formulario.
 */
export async function attempt<T>(
  action: () => Promise<T>,
  options: { success?: string } = {},
): Promise<T | undefined> {
  try {
    const result = await action();
    if (options.success) toast.success(options.success);
    return result;
  } catch (error) {
    toast.error(describeError(error));
    return undefined;
  }
}
