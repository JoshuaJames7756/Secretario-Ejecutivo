import { Badge } from '@/components/ui/badge';
import type { MeetingTemplate } from '@/db/types';
import { TEMPLATE_ORIGIN_LABEL } from '@/features/meetings/labels';

/** Origen y estado de verificación. Lo oficial y lo local nunca se confunden (especificación, 5.4). */
export function TemplateBadges({ template }: { template: MeetingTemplate }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={template.origin === 'oficial' ? 'primary' : 'neutral'}>
        {TEMPLATE_ORIGIN_LABEL[template.origin]}
        {template.manualRef ? ` ${template.manualRef}` : ''}
      </Badge>
      {template.origin === 'oficial' &&
        (template.lastReviewedAt ? (
          <Badge tone="success">Referencia verificada</Badge>
        ) : (
          <Badge tone="warning">Referencia por verificar</Badge>
        ))}
      {template.status === 'archivado' && <Badge>Archivada</Badge>}
    </div>
  );
}
