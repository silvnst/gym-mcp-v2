/** Reads a whole-number query parameter, falling back when it is missing or not a number, and keeps it in range. */
export function intParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
