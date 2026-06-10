import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats minutes as "45 min" or "1 h 20 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Formats kilograms with thousands separator, e.g. "4'250 kg". */
export function formatVolume(kg: number): string {
  return `${Math.round(kg).toLocaleString("de-CH")} kg`;
}
