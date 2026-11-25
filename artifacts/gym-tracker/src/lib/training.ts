/** Training helpers for the UI: estimates, plates, grouping, next plan. */

import type { Equipment, PlanWithExercises, SessionSummary } from "@workspace/api-client-react";

/** Epley estimate of a one-rep max. */
export function epley(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** 52.5 → "52.5", 50 → "50" */
export function formatKg(kg: number | null | undefined): string {
  if (kg == null) return "";
  return String(Math.round(kg * 100) / 100);
}

/** "3:00", "0:45" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Timed exercises (running, bike, rowing machine) log a time instead of weight and reps. */
export const isTimed = (equipment: Equipment | null | undefined) => equipment === "cardio";

/** "52.5 × 8", "BW × 4", "8 reps", or "3:00" for a timed set */
export function formatSet(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
  equipment?: Equipment | null,
  durationSeconds?: number | null,
): string {
  if (durationSeconds != null) return formatTime(durationSeconds);
  if (isTimed(equipment)) return "";
  const w = weightKg != null && weightKg > 0 ? formatKg(weightKg) : equipment === "bodyweight" ? "BW" : null;
  if (w == null && reps == null) return "";
  if (w == null) return `${reps} ${reps === 1 ? "rep" : "reps"}`;
  if (reps == null) return weightKg != null && weightKg > 0 ? `${w} kg` : "";
  return `${w} × ${reps}`;
}

export function guessEquipment(name: string): Equipment | null {
  if (/runner|running|\brun\b|treadmill|\bbike\b|\berg\b|assault|ski.?erg|jog|sprint|\bwalk|cardio|laufband|velo/i.test(name)) return "cardio";
  if (/\b(db|dumbbell|hantel|kurzhantel)/i.test(name)) return "dumbbell";
  if (/pull.?up|chin.?up|push.?up|dip|burpee|box jump|pogo|plank|ab wheel/i.test(name)) return "bodyweight";
  if (/pulldown|pallof|face pull|cable/i.test(name)) return "cable";
  if (/barbell|squat|deadlift|bench|row|press/i.test(name)) return "barbell";
  return null;
}

export function equipmentOf(ex: { name: string; equipment?: Equipment | null }): Equipment | null {
  return ex.equipment ?? guessEquipment(ex.name);
}

/** Weight step for the ± buttons. */
export function weightStep(equipment: Equipment | null): number {
  if (equipment === "dumbbell") return 2;
  if (equipment === "machine" || equipment === "cable") return 2.5;
  return 2.5;
}

export const BAR_KG = 20;
export const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export type Plate = (typeof PLATE_SIZES)[number];

/**
 * Plates per side for a barbell load, heaviest first.
 * Returns null when the weight can't be built from the standard set.
 */
export function platesPerSide(totalKg: number, barKg = BAR_KG): Plate[] | null {
  let perSide = Math.round(((totalKg - barKg) / 2) * 100) / 100;
  if (perSide < 0) return null;
  const plates: Plate[] = [];
  for (const p of PLATE_SIZES) {
    while (perSide + 1e-9 >= p) {
      plates.push(p);
      perSide = Math.round((perSide - p) * 100) / 100;
    }
  }
  return perSide < 0.01 ? plates : null;
}

/** Groups consecutive exercises that share a superset letter. */
export function groupBySuperset<T extends { supersetGroup?: string | null }>(items: T[]): { group: string | null; items: T[] }[] {
  const out: { group: string | null; items: T[] }[] = [];
  for (const item of items) {
    const g = item.supersetGroup?.trim() || null;
    const last = out[out.length - 1];
    if (g && last && last.group === g) last.items.push(item);
    else out.push({ group: g, items: [item] });
  }
  return out;
}

/** Strips old naming habits for display: "FORGE — Day A (Strength)" → "FORGE Day A (Strength)". */
export function cleanName(name: string): string {
  return name.replace(/\s*[—–]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function daysBetween(a: Date, b: Date): number {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 86_400_000);
}

/**
 * The date each plan was last done. Sessions come newest first; one without a plan id
 * (logged before plans were linked) matches its plan by name.
 */
export function lastDoneByPlan(plans: PlanWithExercises[], sessions: SessionSummary[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const s of sessions) {
    const plan = plans.find((p) => p.id === s.planId) ?? plans.find((p) => cleanName(p.name) === cleanName(s.name));
    if (plan && !last.has(plan.id)) last.set(plan.id, s.date);
  }
  return last;
}

/**
 * Active plans in the order Today suggests them: the one done least recently first,
 * so two active plans alternate. Plans never done come first, oldest plan first.
 */
export function rotation(plans: PlanWithExercises[], lastDone: Map<string, string>): PlanWithExercises[] {
  return plans
    .filter((p) => p.active)
    .sort((a, b) => (lastDone.get(a.id) ?? "").localeCompare(lastDone.get(b.id) ?? "") || a.createdAt.localeCompare(b.createdAt));
}

/** What to train next: the head of the rotation, or the newest plan when none is active. */
export function pickNextPlan(plans: PlanWithExercises[], sessions: SessionSummary[]): PlanWithExercises | null {
  const next = rotation(plans, lastDoneByPlan(plans, sessions))[0];
  if (next) return next;
  return plans.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
