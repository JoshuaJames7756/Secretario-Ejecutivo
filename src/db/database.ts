import Dexie, { type EntityTable } from 'dexie';
import type {
  AgendaItem,
  Attachment,
  ChangeLogEntry,
  FollowUp,
  InterviewAppointment,
  InterviewRequest,
  LeaderAvailability,
  MeetingOccurrence,
  MeetingRecord,
  MeetingTemplate,
  Organization,
  Setting,
  SyncOperation,
} from './types';

export const DB_NAME = 'secretaria-estaca';

/**
 * Base de datos local (IndexedDB mediante Dexie). Es la fuente de verdad en el dispositivo.
 *
 * Migraciones: nunca se edita una versión ya publicada. Para cambiar el esquema se añade
 * `db.version(n + 1).stores({...}).upgrade(...)` conservando las anteriores.
 * Solo se listan los campos que se consultan por índice; el resto se guarda igual.
 */
export class AppDatabase extends Dexie {
  templates!: EntityTable<MeetingTemplate, 'id'>;
  meetings!: EntityTable<MeetingOccurrence, 'id'>;
  agendaItems!: EntityTable<AgendaItem, 'id'>;
  records!: EntityTable<MeetingRecord, 'id'>;
  followUps!: EntityTable<FollowUp, 'id'>;
  organizations!: EntityTable<Organization, 'id'>;
  leaderAvailability!: EntityTable<LeaderAvailability, 'id'>;
  interviewRequests!: EntityTable<InterviewRequest, 'id'>;
  interviewAppointments!: EntityTable<InterviewAppointment, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  changeLog!: EntityTable<ChangeLogEntry, 'id'>;
  syncOps!: EntityTable<SyncOperation, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(1).stores({
      templates: 'id, category, status, origin, updatedAt',
      meetings: 'id, templateId, startsAt, status, seriesId, updatedAt',
      agendaItems: 'id, meetingId, [meetingId+order]',
      records: 'id, meetingId, agendaItemId, type, [meetingId+type]',
      followUps:
        'id, status, kind, organizationId, dueDate, nextReviewDate, originMeetingId, updatedAt',
      organizations: 'id, category, status, name',
      leaderAvailability: 'id, leader, date',
      interviewRequests: 'id, status, organizationId, receivedAt',
      interviewAppointments: 'id, requestId, leader, startsAt, [leader+startsAt]',
      attachments: 'id, meetingId, agendaItemId, syncState',
      changeLog: 'id, entity, entityId, at',
      syncOps: 'id, status, createdAt, [entity+entityId]',
      settings: 'key',
    });
  }
}

export const db = new AppDatabase();
