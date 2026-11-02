import { Router, type IRouter } from "express";
import {
  addDays,
  garminConfigured,
  garminUserId,
  getGarminActivities,
  getReadiness,
  getSyncStatus,
  localDate,
  syncGarmin,
} from "../lib/garmin.js";

const router: IRouter = Router();

/** Only the profile the key belongs to sees Garmin data. */
function linked(userId: string): boolean {
  return garminConfigured() && garminUserId() === userId;
}

router.get("/garmin/status", (req, res) => {
  const s = getSyncStatus();
  res.json({ ...s, linked: linked(req.userId) });
});

router.post("/garmin/sync", async (req, res) => {
  if (!linked(req.userId)) {
    res.status(404).json({ error: "Garmin is not connected to this profile" });
    return;
  }
  const days = req.body && typeof req.body.days === "number" ? req.body.days : undefined;
  const s = await syncGarmin(days);
  res.json({ ...s, linked: true });
});

router.get("/garmin/readiness", async (req, res) => {
  try {
    if (!linked(req.userId)) {
      res.json({ available: false });
      return;
    }
    const r = await getReadiness(req.userId);
    res.json(r ? { available: true, ...r } : { available: false });
  } catch {
    res.status(500).json({ error: "Failed to read readiness" });
  }
});

router.get("/garmin/activities", async (req, res) => {
  try {
    if (!linked(req.userId)) {
      res.json([]);
      return;
    }
    const days = Math.min(Math.max(Number(req.query["days"] ?? 14), 1), 365);
    const to = localDate();
    const rows = await getGarminActivities(req.userId, addDays(to, -(days - 1)), to);
    res.json(
      rows.map((a) => ({
        id: String(a.garminId),
        date: a.date,
        // Garmin's local wall-clock time as sent ("2026-11-01 07:10:00"), independent of the server time zone
        startTimeLocal:
          a.raw && typeof (a.raw as Record<string, unknown>)["startTimeLocal"] === "string"
            ? ((a.raw as Record<string, unknown>)["startTimeLocal"] as string)
            : a.startTimeLocal.toISOString(),
        name: a.name,
        type: a.type,
        durationSeconds: a.durationSeconds,
        distanceMeters: a.distanceMeters,
        avgHr: a.avgHr,
        trainingLoad: a.trainingLoad,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to list activities" });
  }
});

export default router;
