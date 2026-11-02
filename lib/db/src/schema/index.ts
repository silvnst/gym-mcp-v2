import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  date,
  uuid,
  jsonb,
  bigint,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable for pre-multi-user rows; backfilled to the default user at boot
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planExercises = pgTable("plan_exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  targetSets: integer("target_sets").notNull(),
  targetReps: integer("target_reps").notNull(),
  targetWeightKg: numeric("target_weight_kg", { precision: 8, scale: 2 }),
  notes: text("notes"),
  // Exercises sharing a group letter (e.g. "A") are done as a superset
  supersetGroup: text("superset_group"),
  // barbell | dumbbell | bodyweight | machine | cable | other
  equipment: text("equipment"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable for pre-multi-user rows; backfilled to the default user at boot
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  durationMin: integer("duration_min"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessionExercises = pgTable("session_exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  planExerciseId: uuid("plan_exercise_id").references(() => planExercises.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  targetSets: integer("target_sets"),
  targetReps: integer("target_reps"),
  targetWeightKg: numeric("target_weight_kg", { precision: 8, scale: 2 }),
  supersetGroup: text("superset_group"),
  equipment: text("equipment"),
});

export const sets = pgTable("sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionExerciseId: uuid("session_exercise_id")
    .notNull()
    .references(() => sessionExercises.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps"),
  weightKg: numeric("weight_kg", { precision: 8, scale: 2 }),
  // How the set felt: easy | right | hard
  effort: text("effort"),
});

// ── Garmin ────────────────────────────────────────────────────────────────────

/** One row per profile and calendar day, filled from the Garmin Personal API. */
export const garminDays = pgTable(
  "garmin_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    restingHr: integer("resting_hr"),
    hrvLastNight: integer("hrv_last_night"),
    hrvWeeklyAvg: integer("hrv_weekly_avg"),
    hrvBaselineLow: integer("hrv_baseline_low"),
    hrvBaselineHigh: integer("hrv_baseline_high"),
    hrvStatus: text("hrv_status"),
    sleepSeconds: integer("sleep_seconds"),
    sleepScore: integer("sleep_score"),
    bodyBatteryHigh: integer("body_battery_high"),
    bodyBatteryLow: integer("body_battery_low"),
    stressAvg: integer("stress_avg"),
    steps: integer("steps"),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("garmin_days_user_date").on(t.userId, t.date)],
);

/** Activities recorded on the watch (runs, rides, strength …). */
export const garminActivities = pgTable(
  "garmin_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    garminId: bigint("garmin_id", { mode: "number" }).notNull(),
    startTimeLocal: timestamp("start_time_local").notNull(),
    date: date("date").notNull(),
    name: text("name"),
    type: text("type"),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: real("distance_meters"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    calories: integer("calories"),
    trainingLoad: real("training_load"),
    aerobicEffect: real("aerobic_effect"),
    anaerobicEffect: real("anaerobic_effect"),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("garmin_activities_user_garmin_id").on(t.userId, t.garminId)],
);

export type GarminDay = typeof garminDays.$inferSelect;
export type GarminActivity = typeof garminActivities.$inferSelect;

export const plansRelations = relations(plans, ({ many }) => ({
  planExercises: many(planExercises),
  sessions: many(sessions),
}));

export const planExercisesRelations = relations(planExercises, ({ one, many }) => ({
  plan: one(plans, { fields: [planExercises.planId], references: [plans.id] }),
  sessionExercises: many(sessionExercises),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  plan: one(plans, { fields: [sessions.planId], references: [plans.id] }),
  sessionExercises: many(sessionExercises),
}));

export const sessionExercisesRelations = relations(sessionExercises, ({ one, many }) => ({
  session: one(sessions, { fields: [sessionExercises.sessionId], references: [sessions.id] }),
  planExercise: one(planExercises, {
    fields: [sessionExercises.planExerciseId],
    references: [planExercises.id],
  }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one }) => ({
  sessionExercise: one(sessionExercises, {
    fields: [sets.sessionExerciseId],
    references: [sessionExercises.id],
  }),
}));

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
});
export const insertPlanExerciseSchema = createInsertSchema(planExercises).omit({
  id: true,
});
export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});
export const insertSessionExerciseSchema = createInsertSchema(
  sessionExercises,
).omit({ id: true });
export const insertSetSchema = createInsertSchema(sets).omit({ id: true });

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanExercise = typeof planExercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type Set = typeof sets.$inferSelect;

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type InsertPlanExercise = z.infer<typeof insertPlanExerciseSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertSessionExercise = z.infer<typeof insertSessionExerciseSchema>;
export type InsertSet = z.infer<typeof insertSetSchema>;
