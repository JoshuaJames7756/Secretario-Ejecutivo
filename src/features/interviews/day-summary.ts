import type { Leader } from '@/db/types';
import {
  LEADERS,
  LEADER_COLOR,
  MODALITY_LABEL,
  formatClock,
  leaderSurname,
  type PresidencyNames,
} from './model';

/** Una entrevista tal como la ven los presidentes. Sin duración y sin contenido confidencial. */
export interface SummaryEntry {
  id: string;
  startsAt: number;
  /** «Hna. María Pérez» */
  name: string;
  organization?: string;
  reason: string;
  leader: Leader;
  modality: 'presencial' | 'virtual';
  confirmed: boolean;
  special: boolean;
}

export function treatmentAbbr(treatment?: 'hermano' | 'hermana'): string {
  return treatment === 'hermana' ? 'Hna.' : 'Hno.';
}

const longDate = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function summaryTitle(day: Date): string {
  const text = longDate.format(day).replace(',', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface SummaryGroup {
  leader: Leader;
  title: string;
  entries: SummaryEntry[];
}

/** Agrupa por quien entrevista (presidente, primer y segundo consejero) y ordena por hora. */
export function groupSummary(entries: SummaryEntry[], names: PresidencyNames): SummaryGroup[] {
  return LEADERS.map((leader) => ({
    leader,
    title: leaderSurname(leader, names),
    entries: entries.filter((e) => e.leader === leader).sort((a, b) => a.startsAt - b.startsAt),
  })).filter((g) => g.entries.length > 0);
}

/** Versión en texto para pegar en WhatsApp. */
export function summaryText(day: Date, entries: SummaryEntry[], names: PresidencyNames): string {
  if (entries.length === 0) return `${summaryTitle(day)}: sin entrevistas.`;
  const lines: string[] = [`*Entrevistas · ${summaryTitle(day)}*`];
  for (const group of groupSummary(entries, names)) {
    lines.push('', `*${group.title}*`);
    for (const e of group.entries) {
      const extras = [
        e.modality === 'virtual' ? MODALITY_LABEL.virtual : '',
        e.special ? 'Especial' : '',
        e.confirmed ? '✓ confirmada' : 'sin confirmar',
      ].filter(Boolean);
      lines.push(
        `${formatClock(e.startsAt)} · ${e.name}${e.organization ? ` (${e.organization})` : ''} · ${e.reason} · ${extras.join(' · ')}`,
      );
    }
  }
  return lines.join('\n');
}

/* ---------- Varios días (semana) ---------- */

export interface SummaryDay {
  day: Date;
  entries: SummaryEntry[];
}

export interface SummaryHeader {
  eyebrow: string;
  title: string;
}

/** Texto de varios días seguidos. Los días sin entrevistas no aparecen. */
export function weekText(days: SummaryDay[], names: PresidencyNames, title: string): string {
  const withData = days.filter((d) => d.entries.length > 0);
  if (withData.length === 0) return `${title}: sin entrevistas.`;
  return [`*${title}*`, ...withData.map((d) => `\n${summaryText(d.day, d.entries, names)}`)].join(
    '\n',
  );
}

/* ---------- Imagen ---------- */

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const W = 1080;
const PAD = 48;
const ROW_H = 140;
const LEADER_H = 84;
const DAY_H = 96;
const HEADER_H = 190;
const FOOTER_H = 72;
const EMPTY_H = 180;

const C = {
  bg: '#f4f6fb',
  card: '#ffffff',
  line: '#e3e7f1',
  ink: '#101828',
  muted: '#566075',
  primary: '#12296b',
  primarySoft: '#e6ecfa',
  success: '#166534',
  warn: '#8a3b0c',
  warnSoft: '#fdf0dc',
};

type Item =
  | { type: 'day'; day: Date }
  | { type: 'leader'; leader: Leader; title: string; count: number }
  | { type: 'row'; entry: SummaryEntry };

const itemHeight = (item: Item) =>
  item.type === 'day' ? DAY_H : item.type === 'leader' ? LEADER_H : ROW_H;

function layoutItems(days: SummaryDay[], names: PresidencyNames): Item[] {
  const items: Item[] = [];
  const showDays = days.filter((d) => d.entries.length > 0).length > 1 || days.length > 1;
  for (const { day, entries } of days) {
    if (entries.length === 0) continue;
    if (showDays) items.push({ type: 'day', day });
    for (const g of groupSummary(entries, names)) {
      items.push({ type: 'leader', leader: g.leader, title: g.title, count: g.entries.length });
      for (const entry of g.entries) items.push({ type: 'row', entry });
    }
  }
  return items;
}

export function summaryImageHeight(days: SummaryDay[], names: PresidencyNames): number {
  const items = layoutItems(days, names);
  const body = items.length === 0 ? EMPTY_H : items.reduce((sum, i) => sum + itemHeight(i), 0);
  return HEADER_H + body + FOOTER_H;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fg: string,
  bg: string,
): number {
  ctx.font = `600 22px ${FONT}`;
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, 34, 17);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 14, y + 18);
  return w;
}

function drawRow(ctx: CanvasRenderingContext2D, e: SummaryEntry, y: number) {
  const cardH = ROW_H - 16;
  const color = LEADER_COLOR[e.leader];
  ctx.fillStyle = C.card;
  roundRect(ctx, PAD, y, W - PAD * 2, cardH, 22);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Franja del color de quien entrevista
  ctx.save();
  roundRect(ctx, PAD, y, W - PAD * 2, cardH, 22);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(PAD, y, 10, cardH);
  ctx.restore();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.primary;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(formatClock(e.startsAt), PAD + 36, y + cardH / 2);

  const textX = PAD + 36 + 186;
  const maxText = W - PAD - 210 - textX;
  ctx.fillStyle = C.ink;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(fit(ctx, e.name, maxText), textX, y + 34);
  ctx.fillStyle = C.muted;
  ctx.font = `500 25px ${FONT}`;
  ctx.fillText(
    fit(ctx, [e.organization, e.reason].filter(Boolean).join(' · '), maxText),
    textX,
    y + 70,
  );

  const rx = W - PAD - 28;
  const cy = y + cardH / 2;
  ctx.beginPath();
  ctx.arc(rx - 22, cy - 18, 22, 0, Math.PI * 2);
  if (e.confirmed) {
    ctx.fillStyle = C.success;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(rx - 33, cy - 17);
    ctx.lineTo(rx - 25, cy - 9);
    ctx.lineTo(rx - 11, cy - 27);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#b6bfd1';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.textBaseline = 'middle';
  ctx.font = `600 21px ${FONT}`;
  ctx.fillStyle = e.confirmed ? C.success : C.muted;
  const label = e.confirmed ? 'Confirmada' : 'Sin confirmar';
  ctx.fillText(label, rx - ctx.measureText(label).width, cy + 14);

  let px = textX;
  const py = y + 86;
  if (e.modality === 'virtual') px += pill(ctx, 'Virtual', px, py, C.primary, C.primarySoft) + 10;
  if (e.special) pill(ctx, 'Día especial', px, py, C.warn, C.warnSoft);
}

/** Dibuja la agenda (uno o varios días) en un lienzo, lista para compartir como PNG. */
export function drawSummary(
  canvas: HTMLCanvasElement,
  days: SummaryDay[],
  names: PresidencyNames,
  header: SummaryHeader,
): void {
  const items = layoutItems(days, names);
  const height = summaryImageHeight(days, names);
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen en este dispositivo.');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);

  ctx.fillStyle = C.primary;
  ctx.fillRect(0, 0, W, HEADER_H - 30);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(header.eyebrow.toUpperCase(), PAD, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(fit(ctx, header.title, W - PAD * 2), PAD, 134);
  const count = items.filter((i) => i.type === 'row').length;
  const total = `${count} ${count === 1 ? 'entrevista' : 'entrevistas'}`;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(total, W - PAD - ctx.measureText(total).width, 70);

  let y = HEADER_H;
  if (items.length === 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText('No hay entrevistas agendadas.', PAD, y + 90);
  }
  for (const item of items) {
    ctx.textBaseline = 'alphabetic';
    if (item.type === 'day') {
      ctx.fillStyle = C.ink;
      ctx.font = `800 38px ${FONT}`;
      ctx.fillText(summaryTitle(item.day), PAD, y + 62);
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, y + 78, W - PAD * 2, 3);
    } else if (item.type === 'leader') {
      ctx.fillStyle = LEADER_COLOR[item.leader];
      ctx.beginPath();
      ctx.arc(PAD + 10, y + 46, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `700 34px ${FONT}`;
      ctx.fillText(item.title, PAD + 32, y + 56);
      ctx.fillStyle = C.muted;
      ctx.font = `500 24px ${FONT}`;
      const n = String(item.count);
      ctx.fillText(n, W - PAD - ctx.measureText(n).width, y + 56);
    } else {
      drawRow(ctx, item.entry, y);
    }
    y += itemHeight(item);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.muted;
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('Secretaría de Estaca · Solo para la presidencia', PAD, height - 28);
}

export function renderSummaryBlob(
  days: SummaryDay[],
  names: PresidencyNames,
  header: SummaryHeader,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawSummary(canvas, days, names, header);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))),
      'image/png',
    );
  });
}

/* ---------- Compartir ---------- */

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

/** Abre el menú de compartir del teléfono (WhatsApp aparece ahí) con la imagen adjunta. */
export async function shareImage(blob: Blob, filename: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) {
    return 'unsupported';
  }
  try {
    await navigator.share({ files: [file], title: filename.replace(/\.png$/, '') });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export async function copyImage(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return true;
}

export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
