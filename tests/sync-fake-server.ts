import type { PullResponse, PushRequest, PushResponse, SyncDoc } from '../shared/contract';
import { NetworkError, type Transport } from '../src/features/sync/engine';

/** Servidor en memoria con las mismas reglas que worker/sync.ts (que se prueba aparte con D1). */
export class FakeServer implements Transport {
  docs = new Map<string, { doc: SyncDoc; seq: number; deviceId: string }>();
  applied = new Map<string, number>();
  seq = 0;
  offline = false;
  pushCalls = 0;
  failNextPushAfterApply = false;

  async push(request: PushRequest): Promise<PushResponse> {
    this.pushCalls += 1;
    if (this.offline) throw new NetworkError();
    const results: PushResponse['results'] = [];
    for (const op of request.ops) {
      const known = this.applied.get(op.opId);
      if (known !== undefined) {
        results.push({ opId: op.opId, status: 'duplicate', serverRev: known });
        continue;
      }
      const key = `${op.entity}:${op.entityId}`;
      const current = this.docs.get(key);
      if (op.doc.rev <= op.expectedRev || op.doc.id !== op.entityId) {
        results.push({ opId: op.opId, status: 'rejected', error: 'Revisión no válida.' });
        continue;
      }
      if ((current?.doc.rev ?? 0) !== op.expectedRev) {
        results.push({
          opId: op.opId,
          status: 'conflict',
          serverRev: current?.doc.rev,
          serverDoc: current?.doc,
        });
        continue;
      }
      this.seq += 1;
      this.docs.set(key, { doc: op.doc, seq: this.seq, deviceId: request.deviceId });
      this.applied.set(op.opId, op.doc.rev);
      results.push({ opId: op.opId, status: 'applied', serverRev: op.doc.rev });
    }
    if (this.failNextPushAfterApply) {
      // El servidor aplicó pero la respuesta se perdió en el camino.
      this.failNextPushAfterApply = false;
      throw new NetworkError();
    }
    return { results, cursor: this.seq };
  }

  async pull(since: number, limit: number): Promise<PullResponse> {
    if (this.offline) throw new NetworkError();
    const rows = [...this.docs.entries()]
      .filter(([, v]) => v.seq > since)
      .sort((a, b) => a[1].seq - b[1].seq);
    const page = rows.slice(0, limit);
    return {
      changes: page.map(([key, v]) => ({
        entity: key.split(':')[0] as never,
        id: v.doc.id,
        rev: v.doc.rev,
        seq: v.seq,
        deviceId: v.deviceId,
        doc: v.doc,
      })),
      cursor: page.at(-1)?.[1].seq ?? since,
      hasMore: rows.length > limit,
    };
  }

  /** Simula que OTRO dispositivo cambió un documento en el servidor. */
  remoteWrite(entity: string, doc: SyncDoc, deviceId = 'otro-dispositivo'): void {
    this.seq += 1;
    this.docs.set(`${entity}:${doc.id}`, { doc, seq: this.seq, deviceId });
  }
}
