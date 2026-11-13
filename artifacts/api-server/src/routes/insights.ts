import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { classifyExercise, epley, MUSCLE_LABELS, type MuscleGroup } from "../lib/training.js";
import { intParam } from "../lib/query.js";

const router: IRouter = Router();

type SetRow = { date: string; name: string; reps: number | null; weight_kg: string | null };

/**
 * Best set per exercise, ranked by how often the exercise was trained.
 * Only weighted sets count; the best set is the one with the highest Epley estimate.
 */
router.get("/insights/bests", async (req, res) => {
  try {
    const limit = intParam(req.query["limit"], 3, 1, 20);
    const rows = await db.execute(sql`
      SELECT s.date::text AS date, se.name, st.reps, st.weight_kg
      FROM sets st
      JOIN session_exercises se ON st.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE s.user_id = ${req.userId}
        AND st.reps IS NOT NULL AND st.reps > 0
        AND st.weight_kg IS NOT NULL AND st.weight_kg > 0
    `);

    const byName = new Map<string, { sessions: Set<string>; best: { weightKg: number; reps: number; e1rm: number; date: string } | null }>();
    for (const r of rows.rows as SetRow[]) {
      const weightKg = parseFloat(r.weight_kg ?? "");
      const e1rm = epley(weightKg, r.reps);
      if (e1rm == null || r.reps == null) continue;
      const entry = byName.get(r.name) ?? { sessions: new Set<string>(), best: null };
      entry.sessions.add(r.date);
      if (!entry.best || e1rm > entry.best.e1rm || (e1rm === entry.best.e1rm && r.date > entry.best.date)) {
        entry.best = { weightKg, reps: r.reps, e1rm, date: r.date };
      }
      byName.set(r.name, entry);
    }

    const result = [...byName.entries()]
      .filter(([, v]) => v.best)
      .sort((a, b) => b[1].sessions.size - a[1].sessions.size || b[1].best!.e1rm - a[1].best!.e1rm)
      .slice(0, limit)
      .map(([name, v]) => ({ name, sessionCount: v.sessions.size, ...v.best! }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch bests");
    res.status(500).json({ error: "Failed to fetch bests" });
  }
});

/**
 * Logged working sets per muscle group and push/pull balance over the last N days.
 * A set counts when it has reps. Exercises hitting two groups count for both.
 */
router.get("/insights/muscle-sets", async (req, res) => {
  try {
    const days = intParam(req.query["days"], 7, 1, 365);
    const rows = await db.execute(sql`
      SELECT se.name, COUNT(st.id)::int AS set_count
      FROM sets st
      JOIN session_exercises se ON st.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE s.user_id = ${req.userId}
        AND st.reps IS NOT NULL AND st.reps > 0
        AND s.date >= (CURRENT_DATE - ${days}::int)
      GROUP BY se.name
    `);

    const muscles = new Map<MuscleGroup, number>();
    let push = 0;
    let pull = 0;
    for (const r of rows.rows as { name: string; set_count: number }[]) {
      const { muscles: groups, pattern } = classifyExercise(r.name);
      for (const g of groups) muscles.set(g, (muscles.get(g) ?? 0) + r.set_count);
      if (pattern === "push") push += r.set_count;
      if (pattern === "pull") pull += r.set_count;
    }

    res.json({
      days,
      muscles: (Object.keys(MUSCLE_LABELS) as MuscleGroup[])
        .map((key) => ({ key, label: MUSCLE_LABELS[key], sets: muscles.get(key) ?? 0 }))
        .sort((a, b) => b.sets - a.sets),
      push,
      pull,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch muscle sets");
    res.status(500).json({ error: "Failed to fetch muscle sets" });
  }
});

export default router;
