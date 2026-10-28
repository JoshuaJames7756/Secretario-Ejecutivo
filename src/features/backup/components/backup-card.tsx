import { Download, FileUp, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Card, CardTitle } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { FilePicker } from '@/components/ui/file-picker';
import { ENTITY_NAMES } from '@/db/repo';
import { attempt } from '@/lib/actions';
import { formatDateTime } from '@/lib/utils';
import {
  MIN_PASSWORD_LENGTH,
  backupFileName,
  createBackup,
  markBackupDone,
  openBackup,
  restoreBackup,
  type BackupSummary,
} from '../service';

const TABLE_LABEL: Record<string, string> = {
  templates: 'Plantillas',
  meetings: 'Reuniones',
  agendaItems: 'Puntos de agenda',
  records: 'Registros y notas',
  followUps: 'Seguimientos',
  organizations: 'Organizaciones',
  leaderAvailability: 'Disponibilidad de líderes',
  interviewRequests: 'Solicitudes de entrevista',
  interviewAppointments: 'Citas de entrevista',
  attachments: 'Adjuntos',
};

function download(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function ExportSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; summary: BackupSummary } | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setDone(null);
    const result = await attempt(() => createBackup(password));
    if (result) {
      const name = backupFileName();
      download(result.text, name);
      await attempt(() => markBackupDone());
      setDone({ name, summary: result.summary });
      setPassword('');
      setConfirm('');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Crear respaldo">
      <h3 className="font-medium">Crear respaldo cifrado</h3>
      <p className="text-sm text-muted">
        Incluye reuniones, notas, seguimientos y la papelera. El archivo se cifra con tu contraseña.
        <strong className="font-semibold text-fg">
          {' '}
          Si la pierdes, el respaldo no se puede recuperar.
        </strong>
      </p>
      <Field
        label="Contraseña del respaldo"
        htmlFor="respaldo-clave"
        hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
      >
        <input
          id="respaldo-clave"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          aria-describedby="respaldo-clave-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field
        label="Repite la contraseña"
        htmlFor="respaldo-clave2"
        error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
      >
        <input
          id="respaldo-clave2"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          aria-invalid={mismatch}
          aria-describedby={mismatch ? 'respaldo-clave2-error' : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        disabled={busy || password.length < MIN_PASSWORD_LENGTH || password !== confirm}
      >
        <Download className="size-4" aria-hidden />
        {busy ? 'Cifrando y verificando…' : 'Crear y descargar respaldo'}
      </Button>
      {done && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-success-soft p-3 text-sm text-success"
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Respaldo generado y verificado ({done.summary.total} registros). Comprueba que{' '}
            <strong>{done.name}</strong> aparece en tus descargas y guárdalo también fuera del
            teléfono.
          </span>
        </p>
      )}
    </form>
  );
}

function RestoreSection() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [password, setPassword] = useState('');
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setText(null);
    setFileName('');
    setPassword('');
    setSummary(null);
  };

  const onFile = async (file: File | undefined) => {
    setSummary(null);
    if (!file) return;
    setText(await file.text());
    setFileName(file.name);
  };

  const review = async (event: FormEvent) => {
    event.preventDefault();
    if (!text) return;
    setBusy(true);
    const result = await attempt(() => openBackup(text, password));
    setBusy(false);
    if (result) setSummary(result.summary);
  };

  const restore = async () => {
    if (!text) return;
    const result = await attempt(() => restoreBackup(text, password), {
      success: 'Respaldo restaurado y verificado.',
    });
    if (result) reset();
  };

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <h3 className="font-medium">Restaurar desde un respaldo</h3>
      <p className="text-sm text-muted">
        Restaurar reemplaza los datos actuales de este dispositivo. Antes de confirmar verás qué
        contiene el respaldo. Si dudas, crea primero un respaldo de lo que tienes ahora.
      </p>
      <FilePicker
        id="restaurar-archivo"
        label="Elegir el archivo de respaldo"
        accept=".json,application/json"
        fileName={fileName}
        onFile={(files) => void onFile(files[0])}
      />

      {text && !summary && (
        <form onSubmit={review} className="space-y-3">
          <Field label={`Contraseña de ${fileName}`} htmlFor="restaurar-clave">
            <input
              id="restaurar-clave"
              type="password"
              autoComplete="off"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={busy || !password}>
            <FileUp className="size-4" aria-hidden />
            {busy ? 'Abriendo…' : 'Revisar el respaldo'}
          </Button>
        </form>
      )}

      {summary && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-sm">
            Respaldo del <strong>{formatDateTime(summary.createdAt)}</strong> con{' '}
            <strong>{summary.total}</strong> registros:
          </p>
          <ul className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
            {ENTITY_NAMES.filter((n) => (summary.counts[n] ?? 0) > 0).map((n) => (
              <li key={n}>
                {TABLE_LABEL[n] ?? n}: {summary.counts[n]}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              size="default"
              confirmLabel="Sí, reemplazar mis datos"
              onConfirm={restore}
            >
              Restaurar este respaldo
            </ConfirmButton>
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BackupCard() {
  return (
    <Card aria-labelledby="respaldo" className="md:col-span-2">
      <CardTitle>
        <span id="respaldo">Respaldo cifrado</span>
      </CardTitle>
      <div className="space-y-5">
        <ExportSection />
        <RestoreSection />
      </div>
    </Card>
  );
}
