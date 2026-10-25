import type { AgendaPointTemplate } from '@/db/types';

/** Puntos de agenda como texto editable: una línea por punto, "Título | descripción opcional". */
export function agendaToText(points: AgendaPointTemplate[]): string {
  return points.map((p) => (p.description ? `${p.title} | ${p.description}` : p.title)).join('\n');
}

export function textToAgenda(text: string): AgendaPointTemplate[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = '', ...rest] = line.split('|');
      const description = rest.join('|').trim();
      return description ? { title: title.trim(), description } : { title: title.trim() };
    })
    .filter((p) => p.title.length > 0);
}
