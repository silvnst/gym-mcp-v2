import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users, type User } from "@workspace/db";

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
  } catch {
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
  } catch {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
