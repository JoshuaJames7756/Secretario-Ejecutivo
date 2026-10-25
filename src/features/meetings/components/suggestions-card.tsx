import { useLiveQuery } from 'dexie-react-hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/shared/page';
import type { Id } from '@/db/types';
import { FOLLOW_UP_KIND_LABEL, isOverdue, toDateString } from '@/features/followups/model';
import {
  addSuggestionToAgenda,
  dismissSuggestion,
  loadSuggestions,
  restoreSuggestions,
} from '@/features/meetings/suggestions';
import { attempt } from '@/lib/actions';
import { useState } from 'react';

/** Asuntos abiertos que podrían tratarse en esta reunión. Nada se agrega sin que la persona lo pida. */
export function SuggestionsCard({ meetingId }: { meetingId: Id }) {
  const [today] = useState(() => toDateString(new Date()));
  const data = useLiveQuery(() => loadSuggestions(meetingId), [meetingId]);
  if (data === undefined) return null;
  if (data.pending.length === 0 && data.dismissedCount === 0) return null;

  return (
    <Card aria-labelledby="sugerencias">
      <CardTitle>
        <span id="sugerencias">Asuntos abiertos que podrían tratarse</span>
      </CardTitle>
      {data.pending.length === 0 ? (
        <p className="text-sm text-muted">No quedan sugerencias para esta reunión.</p>
      ) : (
        <ul className="space-y-2">
          {data.pending.map((item) => (
            <li key={item.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="primary">{FOLLOW_UP_KIND_LABEL[item.kind]}</Badge>
                {isOverdue(item, today) && <Badge tone="danger">Vencido</Badge>}
                {item.dueDate && <span className="text-sm text-muted">Límite: {item.dueDate}</span>}
              </div>
              <p className="mt-1.5 font-medium text-balance">{item.title}</p>
              {item.assignee && <p className="text-sm text-muted">Responsable: {item.assignee}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    attempt(() => addSuggestionToAgenda(meetingId, item.id), {
                      success: 'Agregado a la agenda',
                    })
                  }
                >
                  Agregar a la agenda
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => attempt(() => dismissSuggestion(meetingId, item.id))}
                >
                  Ahora no
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.dismissedCount > 0 && (
        <p className="mt-3 text-sm text-muted">
          {data.dismissedCount === 1 ? '1 descartado' : `${data.dismissedCount} descartados`} para
          esta reunión.{' '}
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() => attempt(() => restoreSuggestions(meetingId))}
          >
            Volver a mostrarlos
          </button>
        </p>
      )}
    </Card>
  );
}
