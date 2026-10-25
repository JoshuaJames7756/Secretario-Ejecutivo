/**
 * Modelo de datos local (especificación, sección 18).
 *
 * Reglas comunes a todas las entidades sincronizables:
 *  - `id`: UUID generado en el dispositivo (permite crear sin conexión sin colisiones).
 *  - `rev`: número de revisión. Sube en cada cambio; base para detectar conflictos al sincronizar.
 *  - `deletedAt`: borrado lógico. Un registro borrado se puede recuperar durante 30 días.
 */

export type Id = string;

export interface BaseEntity {
  id: Id;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  rev: number;
}

/* ---------- Plantillas ---------- */

export type TemplateOrigin = 'oficial' | 'local' | 'personal';

export interface AgendaPointTemplate {
  title: string;
  description?: string;
}

export interface MeetingTemplate extends BaseEntity {
  name: string;
  category: string;
  description?: string;
  /** Referencia al Manual General, p. ej. "29.2". Solo si es una indicación oficial. */
  manualRef?: string;
  manualUrl?: string;
  suggestedParticipants: string[];
  leader?: string;
  suggestedFrequency?: string;
  frequencyBasis?: string;
  durationMin?: number;
  agendaPoints: AgendaPointTemplate[];
  checklist: string[];
  lastReviewedAt?: number;
  origin: TemplateOrigin;
  status: 'activo' | 'archivado';
}

/* ---------- Reuniones ---------- */

export type MeetingStatus = 'programada' | 'en_curso' | 'cerrada' | 'cancelada' | 'reprogramada';

export interface MeetingOccurrence extends BaseEntity {
  /** Origen opcional. La reunión conserva su propia copia: cambiar la plantilla no la altera. */
  templateId?: Id;
  title: string;
  startsAt: number;
  durationMin: number;
  participants: string[];
  place?: string;
  status: MeetingStatus;
  seriesId?: Id;
  summary?: string;
  /** Seguimientos que la persona descartó como sugerencia de agenda para esta reunión. */
  dismissedSuggestionIds?: Id[];
}

export interface AgendaItem extends BaseEntity {
  meetingId: Id;
  title: string;
  description?: string;
  order: number;
  notes?: string;
  prep: 'pendiente' | 'lista';
  /** Seguimiento del que se tomó este punto (si se agregó desde las sugerencias). */
  followUpId?: Id;
}

export type RecordType =
  'nota' | 'propuesta' | 'decision' | 'asignacion' | 'pendiente' | 'informativa';

export interface MeetingRecord extends BaseEntity {
  meetingId: Id;
  agendaItemId?: Id;
  type: RecordType;
  content: string;
  /** Las notas privadas se excluyen por defecto de cualquier exportación. */
  isPrivate: boolean;
}

/* ---------- Seguimiento ---------- */

export type FollowUpStatus =
  | 'registrado'
  | 'pendiente_aprobacion'
  | 'aprobado_asignado'
  | 'en_progreso'
  | 'en_espera'
  | 'completado'
  | 'cerrado_sin_completar';

export interface FollowUp extends BaseEntity {
  title: string;
  description?: string;
  kind: 'asignacion' | 'pendiente';
  status: FollowUpStatus;
  priority?: 'alta' | 'media' | 'baja';
  assignee?: string;
  organizationId?: Id;
  dueDate?: string; // YYYY-MM-DD
  nextReviewDate?: string; // YYYY-MM-DD
  originMeetingId?: Id;
  originAgendaItemId?: Id;
  originRecordId?: Id;
  closedAt?: number;
}

/* ---------- Organización y entrevistas ---------- */

export interface Organization extends BaseEntity {
  name: string;
  category: 'barrio' | 'rama' | 'organizacion' | 'comite';
  status: 'activa' | 'archivada';
  /** Consejero asignado a este barrio o rama (para sugerir con quién coordinar). */
  assignedLeader?: Leader;
}

export type Leader = 'presidente' | 'primer_consejero' | 'segundo_consejero';

export interface LeaderAvailability extends BaseEntity {
  leader: Leader;
  /** 0 = domingo ... 6 = sábado. Ignorado si `date` está presente. */
  weekday?: number;
  /** Excepción para una fecha concreta, YYYY-MM-DD. */
  date?: string;
  /** Minutos desde la medianoche. */
  startMin: number;
  endMin: number;
  kind: 'disponible' | 'no_disponible';
  note?: string;
}

export type InterviewRequestStatus =
  | 'recibida'
  | 'pendiente_coordinacion'
  | 'programada'
  | 'completada'
  | 'cancelada'
  | 'reprogramada';

/** Solo datos administrativos mínimos. Nunca el contenido de la entrevista. */
export interface InterviewRequest extends BaseEntity {
  personName: string;
  organizationId?: Id;
  requestedBy?: string;
  receivedAt: number;
  requestedLeader?: Leader;
  mustBeWithPresident: boolean;
  timePreferences?: string;
  /** En lista de espera: no hubo horario disponible todavía. */
  waitlist?: boolean;
  status: InterviewRequestStatus;
  notes?: string;
}

export interface InterviewAppointment extends BaseEntity {
  requestId: Id;
  leader: Leader;
  startsAt: number;
  durationMin: number;
  status: 'programada' | 'completada' | 'cancelada' | 'reprogramada';
}

/* ---------- Adjuntos ---------- */

export type AttachmentSyncState = 'solo_local' | 'pendiente' | 'confirmado' | 'error';

export interface Attachment extends BaseEntity {
  meetingId: Id;
  agendaItemId?: Id;
  title: string;
  description?: string;
  fileName: string;
  mime: string;
  size: number;
  /** Huella SHA-256 para comprobar integridad tras copiar o sincronizar. */
  sha256: string;
  blob?: Blob;
  syncState: AttachmentSyncState;
}

/* ---------- Infraestructura (no son entidades de negocio) ---------- */

export type ChangeOp = 'create' | 'update' | 'delete' | 'restore' | 'purge';

/** Historial de cambios. Guarda qué cambió y cuándo, nunca el contenido. */
export interface ChangeLogEntry {
  id: Id;
  entity: string;
  entityId: Id;
  op: ChangeOp;
  rev: number;
  at: number;
}

export type SyncOpStatus = 'pendiente' | 'enviando' | 'error' | 'confirmada';

/**
 * Operación pendiente de enviar al servidor (fase 4).
 * No copia el contenido: al enviar se lee la versión actual de la entidad.
 * El `id` de la operación sirve como clave de idempotencia en el servidor.
 */
export interface SyncOperation {
  id: Id;
  entity: string;
  entityId: Id;
  op: 'upsert' | 'delete' | 'restore';
  rev: number;
  deviceId: Id;
  status: SyncOpStatus;
  attempts: number;
  createdAt: number;
  lastError?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}
