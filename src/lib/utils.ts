import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const dateLong = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function formatDateLong(date: Date): string {
  const text = dateLong.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const dateTime = new Intl.DateTimeFormat('es-BO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(epochMs: number): string {
  return dateTime.format(new Date(epochMs));
}

export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
