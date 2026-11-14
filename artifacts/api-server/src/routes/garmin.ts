import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  addDays,
  connectGarmin,
  disconnectGarmin,
  garminConnectAvailable,
  garminLinked,
  GarminError,
  getGarminActivities,
  getReadiness,
  getSyncStatus,
  localDate,
  syncGarmin,
} from "../lib/garmin.js";
import { intParam } from "../lib/query.js";

const router: IRouter = Router();

/** Garmin data belongs to the profile that connected the account; nobody else sees it. */
const linked = garminLinked;

async function statusFor(userId: string) {
  const s = await getSyncStatus(userId);
  return { ...s, linked: s.configured, canConnect: garminConnectAvailable() };
}

router.get("/garmin/status", async (req, res) => {
  try {
    res.json(await statusFor(req.userId));
  } catch (err) {
    req.log.error({ err }, "Failed to read Garmin status");
    res.status(500).json({ error: "Failed to read Garmin status" });
  }
});

router.post("/garmin/sync", async (req, res) => {
  try {
    if (!(await linked(req.userId))) {
      res.status(404).json({ error: "Garmin is not connected to this profile" });
      return;
    }
    const days = req.body && typeof req.body.days === "number" ? req.body.days : undefined;
    await syncGarmin(req.userId, days);
    res.json(await statusFor(req.userId));
  } catch (err) {
    req.log.error({ err }, "Failed to sync Garmin");
    res.status(500).json({ error: "Failed to sync Garmin" });
  }
});

const connectSchema = z.object({ apiKey: z.string().trim().min(8).max(500) });

router.put("/garmin/key", async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the API key from Garmin Connect" });
    return;
  }
  try {
    await connectGarmin(req.userId, parsed.data.apiKey);
    res.json(await statusFor(req.userId));
  } catch (err) {
    if (err instanceof GarminError) {
      // Garmin refused the key, or this server can't store keys: the message says which
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to connect Garmin");
    res.status(500).json({ error: "Failed to connect Garmin" });
  }
});

router.delete("/garmin/key", async (req, res) => {
  try {
    await disconnectGarmin(req.userId);
    res.json(await statusFor(req.userId));
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect Garmin");
    res.status(500).json({ error: "Failed to disconnect Garmin" });
  }
});

router.get("/garmin/readiness", async (req, res) => {
  try {
    if (!(await linked(req.userId))) {
      res.json({ available: false });
      return;
    }
    const r = await getReadiness(req.userId);
    res.json(r ? { available: true, ...r } : { available: false });
  } catch (err) {
    req.log.error({ err }, "Failed to read readiness");
    res.status(500).json({ error: "Failed to read readiness" });
  }
});

router.get("/garmin/activities", async (req, res) => {
  try {
    if (!(await linked(req.userId))) {
      res.json([]);
      return;
    }
    const days = intParam(req.query["days"], 14, 1, 365);
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
  } catch (err) {
    req.log.error({ err }, "Failed to list activities");
    res.status(500).json({ error: "Failed to list activities" });
  }
});

export default router;
