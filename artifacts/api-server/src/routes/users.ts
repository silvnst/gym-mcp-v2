import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
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

router.get("/users", async (_req, res) => {
  try {
    const allUsers = await db.select().from(users).orderBy(asc(users.createdAt));
    res.json(allUsers.map(serializeUser));
  } catch {
    res.status(500).json({ error: "Failed to list users" });
  }
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

router.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [created] = await db.insert(users).values({ name: parsed.data.name }).returning();
    res.status(201).json(serializeUser(created!));
  } catch {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:id", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [updated] = await db
      .update(users)
      .set({ name: parsed.data.name })
      .where(eq(users.id, req.params.id!))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(serializeUser(updated));
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
