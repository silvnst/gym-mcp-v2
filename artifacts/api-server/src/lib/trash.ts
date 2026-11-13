import { and, eq, inArray, isNull, lt, desc } from "drizzle-orm";
import {
  db,
  plans,
  planExercises,
  sessions,
  sessionExercises,
  sets,
  trash,
  type Plan,
  type PlanExercise,
  type Session,
  type SessionExercise,
  type Set as SetRow,
} from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Deleting a plan or a session moves it to the trash: the rows are stored as a
 * snapshot in the `trash` table and removed from the live tables, so no other
 * query has to know about deleted data. Restoring puts the rows back with
 * their old ids. Snapshots older than TRASH_DAYS are removed for good.
 */
export const TRASH_DAYS = 30;

export type TrashKind = "session" | "plan";

// JSON turns dates into strings; everything else in a row survives as it is
type Stored<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };

type SessionSnapshot = {
  session: Stored<Session>;
  exercises: Stored<SessionExercise>[];
  sets: Stored<SetRow>[];
};

type PlanSnapshot = {
  plan: Stored<Plan>;
  exercises: Stored<PlanExercise>[];
  // Deleting a plan unlinks its sessions; remembered so a restore can link them again
  sessionIds: string[];
  exerciseLinks: { sessionExerciseId: string; planExerciseId: string }[];
};

export function trashExpiry(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000);
}

/** Moves a session with its exercises and sets to the trash. False when it isn't this user's. */
export async function trashSession(userId: string, sessionId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    if (!session) return false;

    const exercises = await tx.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId));
    const exerciseIds = exercises.map((e) => e.id);
    const setRows = exerciseIds.length ? await tx.select().from(sets).where(inArray(sets.sessionExerciseId, exerciseIds)) : [];

    await tx.insert(trash).values({ id: session.id, userId, kind: "session", name: session.name, payload: { session, exercises, sets: setRows } });
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
    return true;
  });
}

/** Moves a plan with its exercises to the trash. Logged workouts stay in the history. */
export async function trashPlan(userId: string, planId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
    if (!plan) return false;

    const exercises = await tx.select().from(planExercises).where(eq(planExercises.planId, planId));
    const linkedSessions = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.planId, planId));
    const exerciseIds = exercises.map((e) => e.id);
    const linkedExercises = exerciseIds.length
      ? await tx
          .select({ sessionExerciseId: sessionExercises.id, planExerciseId: sessionExercises.planExerciseId })
          .from(sessionExercises)
          .where(inArray(sessionExercises.planExerciseId, exerciseIds))
      : [];

    const payload = {
      plan,
      exercises,
      sessionIds: linkedSessions.map((s) => s.id),
      exerciseLinks: linkedExercises,
    };
    await tx.insert(trash).values({ id: plan.id, userId, kind: "plan", name: plan.name, payload });
    await tx.delete(plans).where(eq(plans.id, planId));
    return true;
  });
}

/** Puts a deleted plan or session back. Null when the trash has no such item for this user. */
export async function restoreFromTrash(userId: string, id: string): Promise<{ id: string; kind: TrashKind; name: string } | null> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(trash)
      .where(and(eq(trash.id, id), eq(trash.userId, userId)));
    if (!item) return null;

    if (item.kind === "session") {
      const snap = item.payload as SessionSnapshot;
      // The plan may have been deleted in the meantime; a restored session then stands alone
      const planId = snap.session.planId;
      const [plan] = planId ? await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)) : [];
      const wanted = snap.exercises.map((e) => e.planExerciseId).filter((v): v is string => v != null);
      const alive = wanted.length ? await tx.select({ id: planExercises.id }).from(planExercises).where(inArray(planExercises.id, wanted)) : [];
      const aliveIds = new Set(alive.map((e) => e.id));

      await tx.insert(sessions).values({ ...snap.session, planId: plan ? planId : null, createdAt: new Date(snap.session.createdAt) });
      if (snap.exercises.length) {
        await tx
          .insert(sessionExercises)
          .values(snap.exercises.map((e) => ({ ...e, planExerciseId: e.planExerciseId && aliveIds.has(e.planExerciseId) ? e.planExerciseId : null })));
      }
      if (snap.sets.length) await tx.insert(sets).values(snap.sets);
    } else {
      const snap = item.payload as PlanSnapshot;
      await tx.insert(plans).values({ ...snap.plan, createdAt: new Date(snap.plan.createdAt) });
      if (snap.exercises.length) await tx.insert(planExercises).values(snap.exercises);
      if (snap.sessionIds.length) {
        await tx
          .update(sessions)
          .set({ planId: snap.plan.id })
          .where(and(inArray(sessions.id, snap.sessionIds), eq(sessions.userId, userId), isNull(sessions.planId)));
      }
      for (const link of snap.exerciseLinks) {
        await tx
          .update(sessionExercises)
          .set({ planExerciseId: link.planExerciseId })
          .where(and(eq(sessionExercises.id, link.sessionExerciseId), isNull(sessionExercises.planExerciseId)));
      }
    }

    await tx.delete(trash).where(eq(trash.id, id));
    return { id: item.id, kind: item.kind as TrashKind, name: item.name };
  });
}

export async function listTrash(userId: string) {
  const rows = await db
    .select({ id: trash.id, kind: trash.kind, name: trash.name, deletedAt: trash.deletedAt })
    .from(trash)
    .where(eq(trash.userId, userId))
    .orderBy(desc(trash.deletedAt));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as TrashKind,
    name: r.name,
    deletedAt: r.deletedAt.toISOString(),
    expiresAt: trashExpiry(r.deletedAt).toISOString(),
  }));
}

async function purgeTrash(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
    const removed = await db.delete(trash).where(lt(trash.deletedAt, cutoff)).returning({ id: trash.id });
    if (removed.length) logger.info({ count: removed.length }, "Emptied old items from the trash");
  } catch (err) {
    logger.error({ err }, "Could not empty the trash");
  }
}

/** Removes expired items now and then once a day. */
export function startTrashPurge(): void {
  void purgeTrash();
  setInterval(() => void purgeTrash(), 24 * 60 * 60 * 1000).unref();
}
