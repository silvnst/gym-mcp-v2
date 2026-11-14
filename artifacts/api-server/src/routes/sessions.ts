import { Router, type IRouter } from "express";
import { eq, desc, and, ne, sql, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { trashSession } from "../lib/trash.js";
import {
  db,
  plans,
  sessions,
  sessionExercises,
  sets,
  type SessionExercise,
  type Set,
  type PlanExercise,
} from "@workspace/db";
import { intParam } from "../lib/query.js";

const router: IRouter = Router();

function numOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

type SessionExerciseWithSets = SessionExercise & { sets: Set[]; planExercise: PlanExercise | null };
type LastSet = { setNumber: number; weightKg: number | null; reps: number | null; effort: string | null };
/** The sets of the most recent earlier workout that logged this exercise. */
type LastTime = { date: string; sets: LastSet[] };

function serializeSet(s: Set, lastTime?: LastTime) {
  const last = lastTime?.sets.find((l) => l.setNumber === s.setNumber);
  return {
    id: s.id,
    sessionExerciseId: s.sessionExerciseId,
    setNumber: s.setNumber,
    reps: s.reps,
    weightKg: numOrNull(s.weightKg),
    effort: s.effort,
    lastReps: last ? last.reps : null,
    lastWeightKg: last ? last.weightKg : null,
  };
}

function serializeSessionExercise(se: SessionExerciseWithSets, lastTime?: LastTime) {
  return {
    id: se.id,
    sessionId: se.sessionId,
    planExerciseId: se.planExerciseId,
    name: se.name,
    sortOrder: se.sortOrder,
    targetSets: se.targetSets,
    targetReps: se.targetReps,
    targetWeightKg: numOrNull(se.targetWeightKg),
    notes: se.planExercise?.notes ?? null,
    supersetGroup: se.supersetGroup ?? se.planExercise?.supersetGroup ?? null,
    equipment: se.equipment ?? se.planExercise?.equipment ?? null,
    lastTime: lastTime ?? null,
    sets: se.sets.map((s) => serializeSet(s, lastTime)),
  };
}

async function fetchLastSessionSetsForExercises(
  exerciseNames: string[],
  currentSessionId: string,
  userId: string,
): Promise<Map<string, LastTime>> {
  const result = new Map<string, LastTime>();

  for (const name of exerciseNames) {
    // Workouts where the exercise was planned but nothing was logged don't count
    const [lastExercise] = await db
      .select({ exerciseId: sessionExercises.id, date: sessions.date })
      .from(sessionExercises)
      .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
      .where(
        and(
          eq(sessionExercises.name, name),
          ne(sessionExercises.sessionId, currentSessionId),
          eq(sessions.userId, userId),
          sql`EXISTS (SELECT 1 FROM ${sets} WHERE ${sets.sessionExerciseId} = ${sessionExercises.id} AND ${sets.reps} IS NOT NULL)`,
        ),
      )
      .orderBy(desc(sessions.date), desc(sessions.createdAt))
      .limit(1);
    if (!lastExercise) continue;

    const lastSets = await db.query.sets.findMany({
      where: and(eq(sets.sessionExerciseId, lastExercise.exerciseId), isNotNull(sets.reps)),
      orderBy: (s, { asc }) => [asc(s.setNumber)],
    });
    result.set(name, {
      date: lastExercise.date,
      sets: lastSets.map((s) => ({ setNumber: s.setNumber, weightKg: numOrNull(s.weightKg), reps: s.reps, effort: s.effort })),
    });
  }

  return result;
}

async function getSessionWithDetail(sessionId: string, userId: string) {
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
    with: {
      sessionExercises: {
        orderBy: (se, { asc }) => [asc(se.sortOrder)],
        with: {
          sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] },
          planExercise: true,
        },
      },
    },
  });
  if (!session) return null;

  const exerciseNames = [...new Set(session.sessionExercises.map((se) => se.name))];
  const lastSetsMap = await fetchLastSessionSetsForExercises(exerciseNames, sessionId, userId);

  return {
    id: session.id,
    planId: session.planId,
    date: session.date,
    name: session.name,
    notes: session.notes,
    durationMin: session.durationMin,
    createdAt: session.createdAt,
    exercises: session.sessionExercises.map((se) =>
      serializeSessionExercise(se, lastSetsMap.get(se.name)),
    ),
  };
}

const createSessionExerciseSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int(),
  targetSets: z.number().int().nullable().optional(),
  targetReps: z.number().int().nullable().optional(),
  targetWeightKg: z.number().nullable().optional(),
  planExerciseId: z.string().nullable().optional(),
  supersetGroup: z.string().max(8).nullable().optional(),
  equipment: z.enum(["barbell", "dumbbell", "bodyweight", "machine", "cable", "other"]).nullable().optional(),
});

const createSessionSchema = z.object({
  planId: z.string().nullable().optional(),
  date: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  durationMin: z.number().int().min(0).max(24 * 60).nullable().optional(),
  exercises: z.array(createSessionExerciseSchema).nullable().optional(),
});

type CreateSessionExercise = z.infer<typeof createSessionExerciseSchema>;

function buildSessionExerciseValues(
  exercises: CreateSessionExercise[],
  sessionId: string,
): (typeof sessionExercises.$inferInsert)[] {
  return exercises.map((ex, i) => ({
    sessionId,
    planExerciseId: ex.planExerciseId ?? null,
    name: ex.name,
    sortOrder: ex.sortOrder ?? i,
    targetSets: ex.targetSets ?? null,
    targetReps: ex.targetReps ?? null,
    targetWeightKg: ex.targetWeightKg != null ? ex.targetWeightKg.toString() : null,
    supersetGroup: ex.supersetGroup ?? null,
    equipment: ex.equipment ?? null,
  }));
}

router.get("/sessions", async (req, res) => {
  try {
    const limit = intParam(req.query["limit"], 20, 1, 100);
    const offset = intParam(req.query["offset"], 0, 0, 1_000_000);

    const allSessions = await db.query.sessions.findMany({
      where: eq(sessions.userId, req.userId),
      orderBy: [desc(sessions.date), desc(sessions.createdAt)],
      limit,
      offset,
    });

    // Aggregate exercise/set/volume stats for the page of sessions in one query
    const sessionIds = allSessions.map((s) => s.id);
    type StatRow = {
      sessionId: string;
      exerciseCount: number;
      setCount: number;
      totalVolumeKg: number | null;
    };
    const statsBySession = new Map<string, StatRow>();
    if (sessionIds.length > 0) {
      const statRows = await db
        .select({
          sessionId: sessionExercises.sessionId,
          exerciseCount: sql<number>`COUNT(DISTINCT ${sessionExercises.id})::int`,
          setCount: sql<number>`COUNT(${sets.id}) FILTER (WHERE ${sets.reps} IS NOT NULL AND ${sets.weightKg} IS NOT NULL)::int`,
          totalVolumeKg: sql<
            number | null
          >`SUM(${sets.reps} * ${sets.weightKg}) FILTER (WHERE ${sets.reps} IS NOT NULL AND ${sets.weightKg} IS NOT NULL)::float`,
        })
        .from(sessionExercises)
        .leftJoin(sets, eq(sets.sessionExerciseId, sessionExercises.id))
        .where(inArray(sessionExercises.sessionId, sessionIds))
        .groupBy(sessionExercises.sessionId);
      for (const row of statRows) {
        statsBySession.set(row.sessionId, row);
      }
    }

    res.json(
      allSessions.map((s) => {
        const stats = statsBySession.get(s.id);
        return {
          id: s.id,
          planId: s.planId,
          date: s.date,
          name: s.name,
          notes: s.notes,
          durationMin: s.durationMin,
          createdAt: s.createdAt,
          exerciseCount: stats?.exerciseCount ?? 0,
          setCount: stats?.setCount ?? 0,
          totalVolumeKg: stats?.totalVolumeKg != null ? Math.round(stats.totalVolumeKg) : 0,
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list sessions");
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/sessions", async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { planId, date, name, notes, durationMin, exercises: bodyExercises } = parsed.data;

  try {
    const sessionId = await db.transaction(async (tx) => {
      const [session] = await tx
        .insert(sessions)
        .values({
          userId: req.userId,
          planId: planId ?? null,
          date,
          name,
          notes: notes ?? null,
          durationMin: durationMin ?? null,
        })
        .returning();

      let exercisesToInsert: ReturnType<typeof buildSessionExerciseValues> = [];

      if (bodyExercises && bodyExercises.length > 0) {
        exercisesToInsert = buildSessionExerciseValues(bodyExercises, session.id);
      } else if (planId) {
        const plan = await tx.query.plans.findFirst({
          where: and(eq(plans.id, planId), eq(plans.userId, req.userId)),
          with: {
            planExercises: { orderBy: (pe, { asc }) => [asc(pe.sortOrder)] },
          },
        });
        if (plan) {
          exercisesToInsert = plan.planExercises.map((pe) => ({
            sessionId: session.id,
            planExerciseId: pe.id,
            name: pe.name,
            sortOrder: pe.sortOrder,
            targetSets: pe.targetSets,
            targetReps: pe.targetReps,
            targetWeightKg: pe.targetWeightKg,
            supersetGroup: pe.supersetGroup,
            equipment: pe.equipment,
          }));
        }
      }

      if (exercisesToInsert.length > 0) {
        await tx.insert(sessionExercises).values(exercisesToInsert);
      }

      return session.id;
    });

    const result = await getSessionWithDetail(sessionId, req.userId);
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create session");
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const session = await getSessionWithDetail(req.params.id!, req.userId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "Failed to get session");
    res.status(500).json({ error: "Failed to get session" });
  }
});

const updateSessionSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().nullable().optional(),
  durationMin: z.number().int().min(0).max(24 * 60).nullable().optional(),
});

router.patch("/sessions/:id", async (req, res) => {
  const parsed = updateSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const existing = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, req.params.id!), eq(sessions.userId, req.userId)),
    });
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const updates: Partial<{
      name: string;
      date: string;
      notes: string | null;
      durationMin: number | null;
    }> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.date !== undefined) updates.date = parsed.data.date;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.durationMin !== undefined) updates.durationMin = parsed.data.durationMin;

    if (Object.keys(updates).length > 0) {
      await db.update(sessions).set(updates).where(eq(sessions.id, req.params.id!));
    }

    const result = await getSessionWithDetail(req.params.id!, req.userId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to update session");
    res.status(500).json({ error: "Failed to update session" });
  }
});

const updateSessionExerciseSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

router.patch("/sessions/:id/exercises/:exerciseId", async (req, res) => {
  const parsed = updateSessionExerciseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, req.params.id!), eq(sessions.userId, req.userId)),
    });
    const se = await db.query.sessionExercises.findFirst({
      where: eq(sessionExercises.id, req.params.exerciseId!),
    });
    if (!session || !se || se.sessionId !== req.params.id) {
      res.status(404).json({ error: "Session exercise not found in this session" });
      return;
    }

    const updates: Partial<{ name: string; sortOrder: number }> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

    if (Object.keys(updates).length > 0) {
      await db
        .update(sessionExercises)
        .set(updates)
        .where(eq(sessionExercises.id, req.params.exerciseId!));
    }

    const result = await db.query.sessionExercises.findFirst({
      where: eq(sessionExercises.id, req.params.exerciseId!),
      with: { sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] }, planExercise: true },
    });

    res.json(serializeSessionExercise(result as SessionExerciseWithSets));
  } catch (err) {
    req.log.error({ err }, "Failed to update session exercise");
    res.status(500).json({ error: "Failed to update session exercise" });
  }
});

router.delete("/sessions/:id/exercises/:exerciseId", async (req, res) => {
  try {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, req.params.id!), eq(sessions.userId, req.userId)),
    });
    const se = await db.query.sessionExercises.findFirst({
      where: eq(sessionExercises.id, req.params.exerciseId!),
    });
    if (!session || !se || se.sessionId !== req.params.id) {
      res.status(404).json({ error: "Session exercise not found in this session" });
      return;
    }

    await db.delete(sessionExercises).where(eq(sessionExercises.id, req.params.exerciseId!));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete session exercise");
    res.status(500).json({ error: "Failed to delete session exercise" });
  }
});

router.post("/sessions/:id/exercises", async (req, res) => {
  const parsed = createSessionExerciseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sessionId = req.params.id!;

  try {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.userId, req.userId)),
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [newExercise] = await db
      .insert(sessionExercises)
      .values({
        sessionId,
        planExerciseId: parsed.data.planExerciseId ?? null,
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder,
        targetSets: parsed.data.targetSets ?? null,
        targetReps: parsed.data.targetReps ?? null,
        targetWeightKg: parsed.data.targetWeightKg != null ? parsed.data.targetWeightKg.toString() : null,
        supersetGroup: parsed.data.supersetGroup ?? null,
        equipment: parsed.data.equipment ?? null,
      })
      .returning();

    const result = await db.query.sessionExercises.findFirst({
      where: eq(sessionExercises.id, newExercise.id),
      with: { sets: true, planExercise: true },
    });

    res.status(201).json(serializeSessionExercise(result as SessionExerciseWithSets));
  } catch (err) {
    req.log.error({ err }, "Failed to add exercise to session");
    res.status(500).json({ error: "Failed to add exercise to session" });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    // Goes to the trash and can be restored from there (see lib/trash.ts)
    if (!(await trashSession(req.userId, req.params.id!))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete session");
    res.status(500).json({ error: "Failed to delete session" });
  }
});

const addSetSchema = z.object({
  sessionExerciseId: z.string().min(1),
  setNumber: z.number().int().min(1),
  reps: z.number().int().nullable().optional(),
  weightKg: z.number().nullable().optional(),
});

router.post("/sessions/:id/sets", async (req, res) => {
  const parsed = addSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sessionExerciseId, setNumber, reps, weightKg } = parsed.data;
  const sessionId = req.params.id!;

  try {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.userId, req.userId)),
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const se = await db.query.sessionExercises.findFirst({
      where: eq(sessionExercises.id, sessionExerciseId),
    });
    if (!se || se.sessionId !== sessionId) {
      res.status(404).json({ error: "Session exercise not found in this session" });
      return;
    }

    const [newSet] = await db
      .insert(sets)
      .values({
        sessionExerciseId,
        setNumber,
        reps: reps ?? null,
        weightKg: weightKg != null ? weightKg.toString() : null,
      })
      .returning();

    res.status(201).json(serializeSet(newSet));
  } catch (err) {
    req.log.error({ err }, "Failed to add set");
    res.status(500).json({ error: "Failed to add set" });
  }
});

export default router;
