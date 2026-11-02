/**
 * Training maths shared by the REST API and the MCP server.
 */

/** Epley estimate of a one-rep max. Returns null for missing or non-positive input. */
export function epley(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "quads"
  | "hamstrings_glutes"
  | "arms"
  | "core";

export type MovementPattern = "push" | "pull" | "legs" | "core" | "conditioning";

type Rule = { match: RegExp; muscles: MuscleGroup[]; pattern: MovementPattern };

// First match wins, so specific names come before generic ones.
const RULES: Rule[] = [
  { match: /romanian|rdl|good morning|hip thrust|glute|leg curl|hamstring/i, muscles: ["hamstrings_glutes"], pattern: "legs" },
  { match: /deadlift/i, muscles: ["hamstrings_glutes", "back"], pattern: "legs" },
  { match: /split squat|lunge|step.?up|squat|leg press|leg extension/i, muscles: ["quads", "hamstrings_glutes"], pattern: "legs" },
  { match: /box jump|pogo|jump/i, muscles: ["quads"], pattern: "conditioning" },
  { match: /bench|chest|push.?up|dip|fly/i, muscles: ["chest"], pattern: "push" },
  { match: /push press|overhead press|military|shoulder press|ohp/i, muscles: ["shoulders"], pattern: "push" },
  { match: /lateral raise|rear delt|face pull/i, muscles: ["shoulders"], pattern: "pull" },
  { match: /pull.?up|chin.?up|pulldown|row|pull/i, muscles: ["back"], pattern: "pull" },
  { match: /curl/i, muscles: ["arms"], pattern: "pull" },
  { match: /tricep|pushdown|skull/i, muscles: ["arms"], pattern: "push" },
  { match: /pallof|ab wheel|plank|crunch|core|dead bug/i, muscles: ["core"], pattern: "core" },
  { match: /burpee|sprint|runner|run|bike|row erg|assault/i, muscles: [], pattern: "conditioning" },
];

export function classifyExercise(name: string): { muscles: MuscleGroup[]; pattern: MovementPattern | null } {
  for (const rule of RULES) {
    if (rule.match.test(name)) return { muscles: rule.muscles, pattern: rule.pattern };
  }
  return { muscles: [], pattern: null };
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  quads: "Quads",
  hamstrings_glutes: "Hams and glutes",
  arms: "Arms",
  core: "Core",
};

export type Equipment = "barbell" | "dumbbell" | "bodyweight" | "machine" | "cable" | "other";

/** Best guess when a plan exercise has no equipment set. */
export function guessEquipment(name: string): Equipment | null {
  if (/\b(db|dumbbell|hantel|kurzhantel)/i.test(name)) return "dumbbell";
  if (/pull.?up|chin.?up|push.?up|dip|burpee|box jump|pogo|plank|ab wheel/i.test(name)) return "bodyweight";
  if (/pulldown|pallof|face pull|cable/i.test(name)) return "cable";
  if (/barbell|squat|deadlift|bench|row|press/i.test(name)) return "barbell";
  return null;
}
