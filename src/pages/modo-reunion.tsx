import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, ClipboardCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import type { AgendaItem, MeetingOccurrence } from '@/db/types';
import { NoteEditor } from '@/features/meetings/components/note-editor';
import { PhotosPanel } from '@/features/attachments/components/photos-panel';
import { RecordForm } from '@/features/meetings/components/record-form';
import { RecordList } from '@/features/meetings/components/record-list';
import {
  GENERAL_NOTE_ID_PREFIX,
  agendaQuery,
  changeMeetingStatus,
  recordsQuery,
  saveAgendaItemNotes,
  saveGeneralNote,
  setGeneralNotePrivacy,
} from '@/features/meetings/service';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

function GeneralNote({ meetingId }: { meetingId: string }) {
  const noteId = `${GENERAL_NOTE_ID_PREFIX}${meetingId}`;
  // undefined = cargando, null = todavía no existe
  const note = useLiveQuery(async () => {
    const row = await db.records.get(noteId);
    return row && row.deletedAt === undefined ? row : null;
  }, [noteId]);

  if (note === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando nota…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <NoteEditor
        id="nota-general"
        label="Nota general de la reunión"
        initial={note?.content ?? ''}
        onSave={(value) => saveGeneralNote(meetingId, value)}
        versionsFor={{ entity: 'records', entityId: noteId }}
        placeholder="Observaciones generales que no pertenecen a un punto en particular"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-[var(--primary)]"
          checked={note?.isPrivate ?? false}
          onChange={(e) => attempt(() => setGeneralNotePrivacy(meetingId, e.target.checked))}
        />
        Nota privada: se excluye de los informes por defecto
      </label>
    </div>
  );
}

function ClosePanel({
  meeting,
  agenda,
  onClosed,
}: {
  meeting: MeetingOccurrence;
  agenda: AgendaItem[];
  onClosed: () => void;
}) {
  const [summary, setSummary] = useState(meeting.summary ?? '');
  const [busy, setBusy] = useState(false);
  const records = useLiveQuery(() => recordsQuery(meeting.id), [meeting.id]);

  const withoutNotes = agenda.filter((a) => !a.notes?.trim());
  const count = (type: string) => records?.filter((r) => r.type === type).length ?? 0;

  const close = async () => {
    setBusy(true);
    const closed = await attempt(() => changeMeetingStatus(meeting.id, 'cerrada', { summary }), {
      success: 'Reunión cerrada. Puedes reabrirla si necesitas corregir algo.',
    });
    setBusy(false);
    if (closed) onClosed();
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        <li>Decisiones confirmadas: {count('decision')}</li>
        <li>Asignaciones: {count('asignacion')} (en Seguimientos)</li>
        <li>Asuntos pendientes: {count('pendiente')} (en Seguimientos)</li>
        <li>Propuestas sin decidir: {count('propuesta')}</li>
      </ul>
      {withoutNotes.length > 0 && (
        <div role="note" className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <p className="font-medium">
            {withoutNotes.length === 1
              ? '1 punto no tiene notas:'
              : `${withoutNotes.length} puntos no tienen notas:`}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {withoutNotes.map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
          </ul>
          <p className="mt-1">Puedes cerrar igualmente si no hacían falta.</p>
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="resumen" className="block text-sm font-medium">
          Resumen (opcional)
        </label>
        <textarea
          id="resumen"
          className={textareaClass}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <Button onClick={close} disabled={busy}>
        <ClipboardCheck className="size-4" aria-hidden />
        {busy ? 'Cerrando…' : 'Cerrar reunión'}
      </Button>
    </div>
  );
}

export default function ModoReunionPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  const meeting = useLiveQuery(async () => {
    const row = await db.meetings.get(id);
    return row && row.deletedAt === undefined ? row : null;
  }, [id]);
  const agenda = useLiveQuery(() => agendaQuery(id), [id]);

  if (meeting === undefined || agenda === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  if (meeting === null) {
    return (
      <EmptyState
        icon={Users}
        title="No encontramos esta reunión"
        description="Puede que se haya eliminado."
      >
        <Link to="/reuniones" className={cn(buttonVariants(), 'mt-5')}>
          Ir a Reuniones
        </Link>
      </EmptyState>
    );
  }

  if (meeting.status !== 'en_curso') {
    const canStart = meeting.status === 'programada' || meeting.status === 'reprogramada';
    return (
      <EmptyState
        icon={Users}
        title="La reunión no está en curso"
        description={
          canStart
            ? 'Inicia la reunión para tomar notas y registrar decisiones.'
            : 'Esta reunión está cerrada o cancelada. Puedes reabrirla desde su ficha.'
        }
      >
        <div className="mt-5 flex gap-2">
          {canStart && (
            <Button onClick={() => attempt(() => changeMeetingStatus(meeting.id, 'en_curso'))}>
              Iniciar reunión
            </Button>
          )}
          <Link
            to={`/reuniones/${meeting.id}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Ver la reunión
          </Link>
        </div>
      </EmptyState>
    );
  }

  const current = agenda[Math.min(index, Math.max(agenda.length - 1, 0))];

  return (
    <>
      <PageHeader
        eyebrow="Modo reunión"
        title={meeting.title}
        actions={
          <Link
            to={`/reuniones/${meeting.id}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Ver ficha
          </Link>
        }
      />

      <div className="space-y-5">
        {agenda.length === 0 ? (
          <Card>
            <p className="text-muted">
              Esta reunión no tiene puntos de agenda. Puedes agregarlos desde la ficha y tomar la
              nota general aquí abajo.
            </p>
          </Card>
        ) : (
          current && (
            <Card aria-label="Punto actual">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Badge tone="primary">
                  Punto {Math.min(index, agenda.length - 1) + 1} de {agenda.length}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index <= 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index >= agenda.length - 1}
                    onClick={() => setIndex((i) => Math.min(agenda.length - 1, i + 1))}
                  >
                    Siguiente
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <h2 className="font-display text-2xl font-semibold text-balance">{current.title}</h2>
              {current.description && <p className="mt-1 text-muted">{current.description}</p>}
              <div className="mt-4">
                <NoteEditor
                  key={current.id}
                  id={`notas-${current.id}`}
                  label="Notas de este punto"
                  initial={current.notes ?? ''}
                  onSave={(value) => saveAgendaItemNotes(current.id, value)}
                  versionsFor={{ entity: 'agendaItems', entityId: current.id }}
                />
              </div>
            </Card>
          )
        )}

        <Card>
          <CardTitle>Registrar</CardTitle>
          <RecordForm meetingId={meeting.id} agenda={agenda} currentItemId={current?.id} />
        </Card>

        <Card>
          <CardTitle>Fotos (pizarra, documentos)</CardTitle>
          <PhotosPanel meetingId={meeting.id} agendaItemId={current?.id} />
        </Card>

        <Card>
          <CardTitle>Lo registrado hasta ahora</CardTitle>
          <RecordList meetingId={meeting.id} editable />
        </Card>

        <Card>
          <GeneralNote meetingId={meeting.id} />
        </Card>

        <Card>
          <CardTitle>Terminar</CardTitle>
          {reviewing ? (
            <ClosePanel
              meeting={meeting}
              agenda={agenda}
              onClosed={() => navigate(`/reuniones/${meeting.id}`)}
            />
          ) : (
            <Button variant="outline" onClick={() => setReviewing(true)}>
              Revisar y cerrar la reunión
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}
