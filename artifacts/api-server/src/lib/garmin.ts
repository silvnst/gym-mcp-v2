/**
 * Garmin Connect Personal API: token exchange, read-only requests and a sync
 * that stores daily wellness metrics and activities in Postgres.
 *
 * Auth: the personal API key (GARMIN_API_KEY) is exchanged for a JWT valid ~24h.
 * There are no refresh tokens; a new exchange is made when the token runs out.
 * The API is pull-only, so the server syncs on boot, on a timer and on demand.
 *
 * The key belongs to one Garmin account, linked to one profile: GARMIN_USER_ID
 * if set, else the default (oldest) profile.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, garminActivities, garminDays } from "@workspace/db";
import { logger } from "./logger.js";
import { getDefaultUserId } from "../middlewares/user-context.js";

const BASE_URL = (process.env["GARMIN_API_BASE_URL"] ?? "https://personal.connectapi.garmin.com").replace(/\/+$/, "");
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const TIMEOUT_MS = 15_000;
const TIME_ZONE = process.env["GARMIN_TIMEZONE"] ?? "Europe/Zurich";
const CHUNK_DAYS = 28; // stay under the 31-day limit of the range endpoints
const BACKFILL_DAYS = 90;
const ROUTINE_DAYS = 7;
const INTERVAL_MS = 2 * 60 * 60 * 1000;

export class GarminError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/* ── Config ──────────────────────────────────────────────────────────────── */

export function garminConfigured(): boolean {
  return !!process.env["GARMIN_API_KEY"]?.trim();
}

export function garminUserId(): string {
  return process.env["GARMIN_USER_ID"]?.trim() || getDefaultUserId();
}

/* ── Token ───────────────────────────────────────────────────────────────── */

let token: { value: string; refreshAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

function jwtExp(jwt: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function exchangeToken(): Promise<string> {
  const key = process.env["GARMIN_API_KEY"]?.trim();
  if (!key) throw new GarminError(0, TOKEN_PATH, "GARMIN_API_KEY is not set");
  const res = await fetch(BASE_URL + TOKEN_PATH, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    const hint = [400, 401, 403].includes(res.status)
      ? "Garmin refused the API key. It may be wrong, expired or deleted; create a new one in Garmin Connect settings."
      : `Token exchange failed with ${res.status}.`;
    throw new GarminError(res.status, TOKEN_PATH, hint);
  }
  let value = text.replace(/^"|"$/g, "");
  if (text.startsWith("{")) {
    const json = JSON.parse(text) as Record<string, unknown>;
    value = String(json["access_token"] ?? json["accessToken"] ?? json["token"] ?? "");
  }
  if (!/^[\w-]+\.[\w-]+\.[\w-]*$/.test(value)) {
    throw new GarminError(res.status, TOKEN_PATH, "The token endpoint did not return a token. Garmin may be down.");
  }
  const now = Date.now();
  const exp = jwtExp(value) ?? now + 23 * 3600_000;
  token = { value, refreshAt: now + Math.max(exp - now - 3600_000, (exp - now) / 2) };
  return value;
}

async function getToken(): Promise<string> {
  if (token && Date.now() < token.refreshAt) return token.value;
  tokenInFlight ??= exchangeToken().finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

/* ── Requests ────────────────────────────────────────────────────────────── */

async function getJson(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.append(k, String(v));
  const url = BASE_URL + path + (qs.size ? `?${qs}` : "");

  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await getToken();
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 && attempt === 0) {
      await res.body?.cancel();
      if (token?.value === bearer) token = null;
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) throw new GarminError(res.status, path, `GET ${path} failed with ${res.status}: ${text.slice(0, 300)}`);
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  throw new GarminError(401, path, `GET ${path} was rejected twice`);
}

/* ── Parsing helpers (tolerant: Garmin's field names are not formally documented) ── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Depth-first search for the first numeric value under any of the given keys. */
function findNum(value: unknown, keys: string[], depth = 0): number | null {
  if (depth > 5 || value == null) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const n = findNum(v, keys, depth + 1);
      if (n != null) return n;
    }
    return null;
  }
  if (!isObj(value)) return null;
  for (const k of keys) {
    const v = value[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  for (const v of Object.values(value)) {
    if (typeof v === "object") {
      const n = findNum(v, keys, depth + 1);
      if (n != null) return n;
    }
  }
  return null;
}

function findStr(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = findStr(v, keys, depth + 1);
      if (s) return s;
    }
    return null;
  }
  if (!isObj(value)) return null;
  for (const k of keys) {
    const v = value[k];
    if (typeof v === "string" && v) return v;
  }
  for (const v of Object.values(value)) {
    if (typeof v === "object") {
      const s = findStr(v, keys, depth + 1);
      if (s) return s;
    }
  }
  return null;
}

/** Collects every object that carries its own calendar date, keyed by YYYY-MM-DD. */
function byDate(payload: unknown): Map<string, Obj> {
  const out = new Map<string, Obj>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (!isObj(v)) return;
    const d = [v["calendarDate"], v["summaryDate"], v["date"]].find((x) => typeof x === "string" && DATE_RE.test(x)) as string | undefined;
    if (d) {
      const key = d.slice(0, 10);
      out.set(key, { ...(out.get(key) ?? {}), ...v });
      return;
    }
    for (const x of Object.values(v)) visit(x, depth + 1);
  };
  visit(payload, 0);
  return out;
}

/** Top-level key names of a payload, for logging the shape without health values. */
function shape(payload: unknown): string {
  if (isObj(payload)) {
    const arrays = Object.entries(payload).filter(([, v]) => Array.isArray(v));
    if (arrays.length === 1) return `{${Object.keys(payload).join(",")}} with ${arrays[0]![0]}: ${shape(arrays[0]![1])}`;
  }
  if (Array.isArray(payload)) return `array(${payload.length}) of [${isObj(payload[0]) ? Object.keys(payload[0]).slice(0, 25).join(",") : typeof payload[0]}]`;
  if (isObj(payload)) return `{${Object.keys(payload).slice(0, 25).join(",")}}`;
  return String(payload);
}

const round = (n: number | null) => (n == null ? null : Math.round(n));

/* ── Dates ───────────────────────────────────────────────────────────────── */

export function localDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function chunks(from: string, to: string): [string, string][] {
  const out: [string, string][] = [];
  for (let start = from; start <= to; start = addDays(start, CHUNK_DAYS)) {
    const end = addDays(start, CHUNK_DAYS - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

/* ── Sync ────────────────────────────────────────────────────────────────── */

export type SyncStatus = {
  configured: boolean;
  running: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  lastResult: { days: number; activities: number; from: string; to: string } | null;
};

const status: SyncStatus = { configured: false, running: false, lastSyncAt: null, lastError: null, lastResult: null };
let shapesLogged = false;
let activitiesShapeLogged = false;
let running: Promise<SyncStatus> | null = null;

export function getSyncStatus(): SyncStatus {
  return { ...status, configured: garminConfigured() };
}

type DayRow = Partial<Omit<typeof garminDays.$inferInsert, "userId" | "date">> & { raw?: Obj };

async function safe<T>(label: string, fn: () => Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    // Garmin answers 4xx for data that doesn't exist yet; one missing section shouldn't stop the rest
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`${label}: ${msg}`);
    if (err instanceof GarminError && err.path === TOKEN_PATH) throw err;
    return null;
  }
}

async function syncRange(userId: string, from: string, to: string) {
  const days = new Map<string, DayRow>();
  const day = (d: string) => {
    const row = days.get(d) ?? { raw: {} };
    days.set(d, row);
    return row;
  };
  const errors: string[] = [];

  for (const [a, b] of chunks(from, to)) {
    const summaries = await safe("daily summaries", () => getJson("/usersummary-service/v2/dailysummaries", { startDate: a, endDate: b }), errors);
    const sleep = await safe("sleep", () => getJson("/sleep-service/sleep/dailySleepSummariesByDate", { startDate: a, endDate: b }), errors);
    const hrv = await safe("hrv", () => getJson(`/hrv-service/hrv/daily/${a}/${b}`), errors);

    if (!shapesLogged) {
      logger.info({ summaries: shape(summaries), sleep: shape(sleep), hrv: shape(hrv) }, "Garmin payload shapes");
      // Key names one and two levels into the first daily summary (names only, no values)
      const first = [...byDate(summaries).values()].at(-1);
      if (first) {
        const nested: Record<string, string> = {};
        for (const [k, v] of Object.entries(first)) {
          if (isObj(v)) {
            nested[k] = Object.entries(v)
              .map(([k2, v2]) => (isObj(v2) ? `${k2}{${Object.keys(v2).join(",")}}` : k2))
              .join(",");
          }
        }
        logger.info(nested, "Garmin daily summary keys");
      }
      shapesLogged = true;
    }

    for (const [d, o] of byDate(summaries)) {
      const r = day(d);
      r.restingHr = round(findNum(o, ["restingHeartRate", "restingHeartRateInBeatsPerMinute", "currentDayRestingHeartRate"]));
      r.bodyBatteryHigh = round(findNum(o, ["bodyBatteryHighestValue", "bodyBatteryHigh", "maxBodyBattery"]));
      r.bodyBatteryLow = round(findNum(o, ["bodyBatteryLowestValue", "bodyBatteryLow", "minBodyBattery"]));
      r.stressAvg = round(findNum(o, ["averageStressLevel", "avgStressLevel", "averageStress"]));
      r.steps = round(findNum(o, ["totalSteps", "steps"]));
      r.raw!["summary"] = o;
    }
    for (const [d, o] of byDate(sleep)) {
      const r = day(d);
      r.sleepSeconds = round(findNum(o, ["sleepTimeSeconds", "totalSleepSeconds", "durationInSeconds"]));
      const scores = isObj(o["sleepScores"]) ? (o["sleepScores"] as Obj) : null;
      const overall = scores && isObj(scores["overall"]) ? (scores["overall"] as Obj) : null;
      r.sleepScore = round(
        (typeof overall?.["value"] === "number" ? (overall["value"] as number) : null) ?? findNum(o, ["overallSleepScore", "sleepScore", "overallScore"]),
      );
      r.raw!["sleep"] = o;
    }
    for (const [d, o] of byDate(hrv)) {
      const r = day(d);
      r.hrvLastNight = round(findNum(o, ["lastNightAvg", "lastNightAverage", "avgOvernightHrv"]));
      r.hrvWeeklyAvg = round(findNum(o, ["weeklyAvg", "weeklyAverage"]));
      r.hrvBaselineLow = round(findNum(o, ["balancedLow", "baselineLowUpper", "lowUpper"]));
      r.hrvBaselineHigh = round(findNum(o, ["balancedUpper", "balancedHigh"]));
      r.hrvStatus = findStr(o, ["status", "hrvStatus"])?.toLowerCase() ?? null;
      r.raw!["hrv"] = o;
    }
  }

  const activities = await safe(
    "activities",
    () => getJson("/activitylist-service/activities/search/activities", { startDate: from, endDate: to, limit: 200 }),
    errors,
  );
  if (!activitiesShapeLogged) {
    logger.info({ activities: shape(activities) }, "Garmin payload shapes");
    const firstActivity = Array.isArray(activities) ? activities.find(isObj) : null;
    if (firstActivity) logger.info({ keys: Object.keys(firstActivity).join(",") }, "Garmin activity keys");
    activitiesShapeLogged = true;
  }

  const activityList = Array.isArray(activities) ? activities : isObj(activities) && Array.isArray(activities["activityList"]) ? (activities["activityList"] as unknown[]) : [];
  const activityRows = activityList.filter(isObj).flatMap((a) => {
    const id = Number(a["activityId"]);
    const start = typeof a["startTimeLocal"] === "string" ? (a["startTimeLocal"] as string) : null;
    if (!Number.isFinite(id) || !start || !DATE_RE.test(start)) return [];
    const startTime = new Date(start.replace(" ", "T"));
    if (Number.isNaN(startTime.getTime())) return [];
    const type = isObj(a["activityType"]) ? String((a["activityType"] as Obj)["typeKey"] ?? "") : typeof a["activityType"] === "string" ? (a["activityType"] as string) : null;
    return [
      {
        userId,
        garminId: id,
        startTimeLocal: startTime,
        date: start.slice(0, 10),
        name: typeof a["activityName"] === "string" ? (a["activityName"] as string) : null,
        type: type || null,
        durationSeconds: round(findNum(a, ["duration", "movingDuration", "elapsedDuration"])),
        distanceMeters: findNum(a, ["distance"]),
        avgHr: round(findNum(a, ["averageHR", "avgHr", "averageHeartRate"])),
        maxHr: round(findNum(a, ["maxHR", "maxHr", "maxHeartRate"])),
        calories: round(findNum(a, ["calories"])),
        trainingLoad: findNum(a, ["activityTrainingLoad", "trainingLoad"]),
        aerobicEffect: findNum(a, ["aerobicTrainingEffect"]),
        anaerobicEffect: findNum(a, ["anaerobicTrainingEffect"]),
        raw: a,
        syncedAt: new Date(),
      },
    ];
  });

  const dayRows = [...days.entries()].map(([date, r]) => ({ userId, date, ...r, syncedAt: new Date() }));

  // How many days got each field (counts only, no health values) to spot parsing gaps
  const filled = (k: keyof DayRow) => dayRows.filter((r) => r[k] != null).length;
  logger.info(
    {
      days: dayRows.length,
      firstDay: dayRows.map((r) => r.date).sort()[0] ?? null,
      lastDay: dayRows.map((r) => r.date).sort().at(-1) ?? null,
      lastSleepDay: dayRows.filter((r) => r.sleepSeconds != null).map((r) => r.date).sort().at(-1) ?? null,
      lastActivityDay: activityRows.map((a) => a.date).sort().at(-1) ?? null,
      restingHr: filled("restingHr"),
      hrvLastNight: filled("hrvLastNight"),
      hrvBaseline: filled("hrvBaselineLow"),
      hrvStatus: filled("hrvStatus"),
      sleepSeconds: filled("sleepSeconds"),
      sleepScore: filled("sleepScore"),
      bodyBattery: filled("bodyBatteryHigh"),
      stress: filled("stressAvg"),
      steps: filled("steps"),
      activitiesWithLoad: activityRows.filter((a) => a.trainingLoad != null).length,
      activitiesWithHr: activityRows.filter((a) => a.avgHr != null).length,
    },
    "Garmin field coverage",
  );
  if (dayRows.length > 0) {
    await db
      .insert(garminDays)
      .values(dayRows)
      .onConflictDoUpdate({
        target: [garminDays.userId, garminDays.date],
        set: {
          restingHr: sql`coalesce(excluded.resting_hr, ${garminDays.restingHr})`,
          hrvLastNight: sql`coalesce(excluded.hrv_last_night, ${garminDays.hrvLastNight})`,
          hrvWeeklyAvg: sql`coalesce(excluded.hrv_weekly_avg, ${garminDays.hrvWeeklyAvg})`,
          hrvBaselineLow: sql`coalesce(excluded.hrv_baseline_low, ${garminDays.hrvBaselineLow})`,
          hrvBaselineHigh: sql`coalesce(excluded.hrv_baseline_high, ${garminDays.hrvBaselineHigh})`,
          hrvStatus: sql`coalesce(excluded.hrv_status, ${garminDays.hrvStatus})`,
          sleepSeconds: sql`coalesce(excluded.sleep_seconds, ${garminDays.sleepSeconds})`,
          sleepScore: sql`coalesce(excluded.sleep_score, ${garminDays.sleepScore})`,
          bodyBatteryHigh: sql`coalesce(excluded.body_battery_high, ${garminDays.bodyBatteryHigh})`,
          bodyBatteryLow: sql`coalesce(excluded.body_battery_low, ${garminDays.bodyBatteryLow})`,
          stressAvg: sql`coalesce(excluded.stress_avg, ${garminDays.stressAvg})`,
          steps: sql`coalesce(excluded.steps, ${garminDays.steps})`,
          raw: sql`coalesce(${garminDays.raw}, '{}'::jsonb) || excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }
  if (activityRows.length > 0) {
    await db
      .insert(garminActivities)
      .values(activityRows)
      .onConflictDoUpdate({
        target: [garminActivities.userId, garminActivities.garminId],
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          durationSeconds: sql`excluded.duration_seconds`,
          distanceMeters: sql`excluded.distance_meters`,
          avgHr: sql`excluded.avg_hr`,
          maxHr: sql`excluded.max_hr`,
          calories: sql`excluded.calories`,
          trainingLoad: sql`excluded.training_load`,
          aerobicEffect: sql`excluded.aerobic_effect`,
          anaerobicEffect: sql`excluded.anaerobic_effect`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  return { days: dayRows.length, activities: activityRows.length, errors };
}

/** Syncs the last `days` days (default: backfill if nothing stored yet, else the last few days). */
export function syncGarmin(days?: number): Promise<SyncStatus> {
  if (!garminConfigured()) return Promise.resolve(getSyncStatus());
  running ??= (async () => {
    status.running = true;
    try {
      const userId = garminUserId();
      let span = days;
      if (span == null) {
        const [any] = await db.select({ id: garminDays.id }).from(garminDays).where(eq(garminDays.userId, userId)).limit(1);
        span = any ? ROUTINE_DAYS : BACKFILL_DAYS;
      }
      const to = localDate();
      const from = addDays(to, -(Math.min(Math.max(span, 1), 365) - 1));
      const result = await syncRange(userId, from, to);
      status.lastSyncAt = new Date().toISOString();
      status.lastResult = { days: result.days, activities: result.activities, from, to };
      status.lastError = result.errors.length ? result.errors.join(" | ") : null;
      logger.info({ ...status.lastResult, errors: result.errors.length }, "Garmin sync done");
      if (result.errors.length) logger.warn({ errors: result.errors }, "Garmin sync had partial errors");
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      logger.error({ err: status.lastError, stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined }, "Garmin sync failed");
    } finally {
      status.running = false;
      running = null;
    }
    return getSyncStatus();
  })();
  return running;
}

export function startGarminSync(): void {
  if (!garminConfigured()) {
    logger.info("GARMIN_API_KEY not set: Garmin sync is off");
    return;
  }
  // A full window on every boot keeps late-arriving watch data from slipping through
  void syncGarmin(BACKFILL_DAYS);
  setInterval(() => void syncGarmin(), INTERVAL_MS).unref();
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

export async function getGarminDays(userId: string, from: string, to: string) {
  return db
    .select()
    .from(garminDays)
    .where(and(eq(garminDays.userId, userId), gte(garminDays.date, from), sql`${garminDays.date} <= ${to}`))
    .orderBy(desc(garminDays.date));
}

export async function getGarminActivities(userId: string, from: string, to: string) {
  return db
    .select()
    .from(garminActivities)
    .where(and(eq(garminActivities.userId, userId), gte(garminActivities.date, from), sql`${garminActivities.date} <= ${to}`))
    .orderBy(desc(garminActivities.startTimeLocal));
}

/* ── Readiness ───────────────────────────────────────────────────────────── */

export type Readiness = {
  date: string;
  level: "ready" | "caution" | "easy";
  headline: string;
  reasons: string[];
  metrics: {
    sleepSeconds: number | null;
    sleepScore: number | null;
    hrvLastNight: number | null;
    hrvBaselineLow: number | null;
    hrvBaselineHigh: number | null;
    hrvStatus: string | null;
    restingHr: number | null;
    restingHrAvg: number | null;
    bodyBatteryHigh: number | null;
  };
  yesterdayActivities: { name: string | null; type: string | null; durationSeconds: number | null; distanceMeters: number | null; trainingLoad: number | null }[];
};

/**
 * Transparent rules instead of an opaque score. Each flag is a common, well
 * supported sign of incomplete recovery:
 * - overnight HRV below the personal baseline range (Garmin's own baseline)
 * - resting heart rate at least 5 bpm above the 4-week average
 * - less than 6 hours of sleep, or a sleep score below 60
 * No flag: good to train. One: train, but don't add weight. Two or more: go easy.
 */
export async function getReadiness(userId: string): Promise<Readiness | null> {
  const today = localDate();
  const rows = await getGarminDays(userId, addDays(today, -29), today);
  const latest = rows.find((r) => r.sleepSeconds != null || r.hrvLastNight != null || r.restingHr != null);
  if (!latest) return null;
  // Use today if last night's data is in, else the latest day that has it
  const day = latest;

  const prior = rows.filter((r) => r.date < day.date && r.restingHr != null);
  const restingHrAvg = prior.length >= 7 ? Math.round(prior.reduce((s, r) => s + r.restingHr!, 0) / prior.length) : null;

  const reasons: string[] = [];
  let flags = 0;
  if (day.hrvLastNight != null && day.hrvBaselineLow != null && day.hrvLastNight < day.hrvBaselineLow) {
    flags++;
    reasons.push(`HRV ${day.hrvLastNight} ms is below your usual range (${day.hrvBaselineLow} to ${day.hrvBaselineHigh ?? "?"} ms)`);
  } else if (day.hrvLastNight != null && day.hrvBaselineLow == null && (day.hrvStatus === "low" || day.hrvStatus === "poor")) {
    flags++;
    reasons.push(`HRV status is ${day.hrvStatus}`);
  }
  if (day.restingHr != null && restingHrAvg != null && day.restingHr - restingHrAvg >= 5) {
    flags++;
    reasons.push(`Resting heart rate ${day.restingHr} bpm is ${day.restingHr - restingHrAvg} above your 4-week average`);
  }
  if (day.sleepSeconds != null && day.sleepSeconds < 6 * 3600) {
    flags++;
    reasons.push(`${(day.sleepSeconds / 3600).toFixed(1)} h of sleep`);
  } else if (day.sleepScore != null && day.sleepScore < 60) {
    flags++;
    reasons.push(`Sleep score ${day.sleepScore}`);
  }

  const level: Readiness["level"] = flags === 0 ? "ready" : flags === 1 ? "caution" : "easy";
  const headline =
    level === "ready" ? "Good to train" : level === "caution" ? "Train, but don't add weight" : "Go easy today";

  const yesterday = await getGarminActivities(userId, addDays(day.date, -1), addDays(day.date, -1));

  return {
    date: day.date,
    level,
    headline,
    reasons,
    metrics: {
      sleepSeconds: day.sleepSeconds,
      sleepScore: day.sleepScore,
      hrvLastNight: day.hrvLastNight,
      hrvBaselineLow: day.hrvBaselineLow,
      hrvBaselineHigh: day.hrvBaselineHigh,
      hrvStatus: day.hrvStatus,
      restingHr: day.restingHr,
      restingHrAvg,
      bodyBatteryHigh: day.bodyBatteryHigh,
    },
    yesterdayActivities: yesterday.map((a) => ({
      name: a.name,
      type: a.type,
      durationSeconds: a.durationSeconds,
      distanceMeters: a.distanceMeters,
      trainingLoad: a.trainingLoad,
    })),
  };
}

export { addDays };
