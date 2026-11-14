import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users, type User } from "@workspace/db";
import { forgetUser } from "../lib/auth.js";

const router: IRouter = Router();

function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    createdAt: u.createdAt,
  };
}

// Mounted behind userContext: a login only ever sees and edits its own profile.
router.get("/users/me", async (req, res) => {
  try {
    const me = await db.query.users.findFirst({ where: eq(users.id, req.userId) });
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(serializeUser(me));
  } catch (err) {
    req.log.error({ err }, "Failed to load profile");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

const renameSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

router.patch("/users/me", async (req, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [updated] = await db
      .update(users)
      .set({ name: parsed.data.name })
      .where(eq(users.id, req.userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(serializeUser(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Removes the profile with everything that hangs on it (plans, workouts, trash, Garmin data).
// The login itself lives in Auth0 and stays; signing in again would start an empty profile.
router.delete("/users/me", async (req, res) => {
  try {
    await db.delete(users).where(eq(users.id, req.userId));
    forgetUser(req.userId);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete profile");
    res.status(500).json({ error: "Failed to delete profile" });
  }
});

export default router;
